/**
 * services/whatsappBot.js
 * WhatsApp Web via Baileys — production-hardened version
 *
 * Key design decisions vs previous version:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. MESSAGE QUEUE WITH RETRY
 *    When a send is attempted during reconnection (the "not connected, skipping"
 *    problem), the message is held in a queue and delivered when the socket
 *    comes back online — up to QUEUE_TTL_MS (60 s) per message.
 *
 * 2. RECONNECTION STRATEGY
 *    408 (Connection Lost) = transient network hiccup → reconnect IMMEDIATELY
 *    with no backoff. Exponential backoff is reserved for persistent failures
 *    (e.g. 500 Restart Required) to avoid hammering the server.
 *
 * 3. NO _sock.end() BEFORE RE-INIT
 *    Calling sock.end() destroys the WebSocket *and* flushes the signal keys,
 *    which can corrupt the auth state for the next session. We let the old
 *    socket die naturally and only clear the reference.
 *
 * 4. FINE-GRAINED STATUS
 *    'disconnected' | 'connecting' | 'reconnecting' | 'connected'
 *    The UI can now differentiate between "never connected" and "temporarily
 *    dropped but auto-reconnecting".
 *
 * 5. BROWSER FINGERPRINT
 *    Using 'Ubuntu' instead of 'Chrome' — reduces server-side session
 *    timeouts that cause spurious 408s on some WA versions.
 *
 * Exports:
 *   initBaileys()
 *   getStatus()              → { status, phone }
 *   getQRDataUrl()           → PNG data-url | null
 *   getLastSendInfo()        → { lastSuccess, lastError }
 *   disconnect()
 *   sendWhatsAppMessage(to, text) → Promise<boolean>
 *   notificarNovoPedido(pedido)
 *   notificarStatusPedido(pedido, status)
 *   waEvents                 EventEmitter
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const { Boom }        = require('@hapi/boom');
const QRCode          = require('qrcode');
const EventEmitter    = require('events');
const path            = require('path');
const fs              = require('fs');
const { query }       = require('../db/connection');

// ─── Session directory ────────────────────────────────────────────────────────
const SESSION_DIR = path.join(__dirname, '..', 'sessions', 'wa_session');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

// ─── State ────────────────────────────────────────────────────────────────────
const waEvents = new EventEmitter();
waEvents.setMaxListeners(30);

let _status      = 'disconnected';  // 'disconnected'|'connecting'|'reconnecting'|'connected'
let _phone       = null;
let _qrDataUrl   = null;
let _sock        = null;
let _isManuallyClosed = false;      // true only when disconnect() was called by user
let _reconnectTimer   = null;

let _lastSuccess = null;  // ISO string
let _lastError   = null;  // { time, message }

let _isInitializing    = false;  // true from initBaileys() start until 'open' or 'close' fires
let _socketGeneration  = 0;      // increments each initBaileys() call; stale sockets check this
let _cachedVersion     = null;   // cache fetchLatestBaileysVersion() result
let _pairingCode       = null;   // 8-char code for phone-number pairing (null when not in use)
let _pendingPhoneNumber = null;  // phone passed to initBaileys(); triggers pairing code on first qr event

async function _getVersion() {
  if (!_cachedVersion) _cachedVersion = await fetchLatestBaileysVersion();
  return _cachedVersion;
}

// ─── Logger silencioso recursivo ──────────────────────────────────────────────
// CRÍTICO: o child() deve retornar um objeto com todos os métodos, inclusive
// outro child() recursivo. Se retornar {} (vazio), qualquer chamada interna do
// Baileys tipo logger.child().child().debug() lança TypeError silencioso —
// impedindo que o makeCacheableSignalKeyStore escreva arquivos de chave no disco.
const _silentLogger = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info:  () => {},
  warn:  () => {}, error: () => {}, fatal: () => {},
  child: () => _silentLogger,   // ← recursivo: child sempre retorna o mesmo objeto
};

// Apaga sessão com pairing incompleto (registered:false) independente de ter ou não key files.
// Isso garante nova identidade de dispositivo, resetando o rate-limit do WA após tentativas fracassadas.
function _clearIncompleteSession() {
  const files = fs.existsSync(SESSION_DIR) ? fs.readdirSync(SESSION_DIR) : [];
  if (!files.includes('creds.json')) return; // sem creds → nada a limpar
  try {
    const creds = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, 'creds.json'), 'utf8'));
    if (!creds.registered) {
      console.warn('[Baileys] ⚠️  creds.registered=false — pairing nunca concluído. Limpando sessão para nova identidade.');
      for (const f of files) fs.rmSync(path.join(SESSION_DIR, f), { force: true });
    }
  } catch (_) {
    // creds.json ilegível → limpar tudo
    console.warn('[Baileys] ⚠️  creds.json ilegível — limpando sessão corrompida.');
    for (const f of files) fs.rmSync(path.join(SESSION_DIR, f), { force: true });
  }
}

// ─── Message queue ────────────────────────────────────────────────────────────
// Messages enqueued while not connected are retried when connected.
const QUEUE_TTL_MS      = 60_000;   // discard after 60 s
const QUEUE_RETRY_MS    = 3_000;    // retry interval while reconnecting
let   _msgQueue         = [];       // [{ to, text, enqueued, resolve, reject }]
let   _queueFlushTimer  = null;

function _enqueueMessage(to, text) {
  return new Promise((resolve, reject) => {
    const entry = { to, text, enqueued: Date.now(), resolve, reject };
    _msgQueue.push(entry);
    console.log(`[Baileys] 📥 Message queued for ${to} (queue size: ${_msgQueue.length})`);
    // Schedule flush attempt
    if (!_queueFlushTimer) {
      _queueFlushTimer = setInterval(_flushQueue, QUEUE_RETRY_MS);
    }
  });
}

async function _flushQueue() {
  if (_status !== 'connected' || !_sock) return;

  const now = Date.now();
  const toSend = _msgQueue.filter(e => (now - e.enqueued) < QUEUE_TTL_MS);
  const expired = _msgQueue.filter(e => (now - e.enqueued) >= QUEUE_TTL_MS);

  // Reject expired entries
  for (const e of expired) {
    console.warn(`[Baileys] ⏰ Message to ${e.to} expired in queue after ${QUEUE_TTL_MS / 1000}s`);
    _lastError = { time: new Date().toISOString(), message: `Mensagem para ${e.to} expirou na fila (sem conexão por ${QUEUE_TTL_MS / 1000}s)` };
    e.reject(new Error('Message expired in queue'));
  }

  _msgQueue = toSend;
  if (_msgQueue.length === 0) {
    clearInterval(_queueFlushTimer);
    _queueFlushTimer = null;
    return;
  }

  // Drain queue sequentially
  while (_msgQueue.length > 0 && _status === 'connected' && _sock) {
    const entry = _msgQueue.shift();
    try {
      const ok = await _sendNow(entry.to, entry.text);
      entry.resolve(ok);
    } catch (err) {
      entry.reject(err);
    }
  }

  if (_msgQueue.length === 0) {
    clearInterval(_queueFlushTimer);
    _queueFlushTimer = null;
  }
}

// ─── Reject entire queue ──────────────────────────────────────────────────────
function _rejectQueue(reasonMsg) {
  if (_msgQueue.length > 0) {
    console.warn(`[Baileys] 🗑 Rejeitando ${_msgQueue.length} mensagens: ${reasonMsg}`);
  }
  for (const e of _msgQueue) {
    e.reject(new Error(reasonMsg));
  }
  _lastError = { time: new Date().toISOString(), message: reasonMsg };
  _msgQueue = [];
  if (_queueFlushTimer) {
    clearInterval(_queueFlushTimer);
    _queueFlushTimer = null;
  }
}

// ─── Phone normalizer ─────────────────────────────────────────────────────────
// Garante formato E.164. Número português de 9 dígitos (começa com 9, 2 ou 3)
// recebe prefixo 351 automaticamente. Ex: "935355112" → "351935355112".
function _normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 9 && /^[923]/.test(d)) d = '351' + d;
  return d;
}

// ─── Actual send (socket must be ready) ──────────────────────────────────────
async function _sendNow(to, text) {
  const digits = _normalizePhone(to);
  if (digits.length < 8) {
    console.warn('[Baileys] _sendNow: número inválido:', to, '→', digits);
    return false;
  }
  console.log(`[Baileys] _sendNow → +${digits}`);

  const jid = `${digits}@s.whatsapp.net`;

  try {
    await _sock.sendMessage(jid, { text });
    _lastSuccess = new Date().toISOString();
    console.log(`[Baileys] ✅ Message sent to +${digits}`);
    return true;
  } catch (err) {
    _lastError = { time: new Date().toISOString(), message: err.message };
    console.error(`[Baileys] ❌ sendMessage to +${digits} FAILED:`, err.message);
    return false;
  }
}

// ─── Public send API ──────────────────────────────────────────────────────────
// Só enfileira quando está reconectando (já autenticado, queda de rede temporária).
// Se disconnected/awaiting_qr/awaiting_pairing_code → descarta imediatamente (sem fila fantasma).
async function sendWhatsAppMessage(to, text) {
  const digits = _normalizePhone(to);
  console.log(`[Baileys] sendWhatsAppMessage → +${digits} status=${_status}`);

  if (_status === 'connected' && _sock) return _sendNow(to, text);

  if (_status === 'reconnecting' || _status === 'connecting') {
    console.warn(`[Baileys] ⚠️ Reconectando — mensagem enfileirada para +${digits}`);
    return _enqueueMessage(to, text);
  }

  // disconnected / awaiting_qr / awaiting_pairing_code → falha imediata
  _lastError = { time: new Date().toISOString(), message: `WA não conectado (${_status}) — mensagem descartada.` };
  console.warn(`[Baileys] ⚠️ status=${_status} — descartando envio para +${digits} (conecte o WhatsApp primeiro)`);
  return false;
}

// ─── Mapa: status do pedido → chave na tabela chatbot_mensagens ───────────────
const STATUS_CHAVE = {
  recebido:           'pedido_recebido',
  pendente_aprovacao: 'pedido_recebido',
  em_preparo:         'pedido_preparo',
  pronto:             'pedido_pronto',
  em_entrega:         'pedido_a_caminho',
  chegou:             'pedido_chegou',
  entregue:           'pedido_entregue',
  finalizado:         'pedido_finalizado',
  cancelado:          'pedido_cancelado',
  rejeitado:          'pedido_cancelado',
};

// Busca mensagem do banco e substitui placeholders {{variavel}}.
// Retorna null se a chave não existir ou o texto estiver vazio.
async function _getMensagem(chave, vars = {}) {
  try {
    const { rows } = await query('SELECT mensagem FROM chatbot_mensagens WHERE chave = $1', [chave]);
    if (!rows.length || !rows[0].mensagem) return null;
    let texto = rows[0].mensagem;
    for (const [k, v] of Object.entries(vars)) {
      texto = texto.split(`{{${k}}}`).join(String(v ?? ''));
    }
    return texto;
  } catch (err) {
    console.error('[Baileys] _getMensagem error:', err.message);
    return null;
  }
}

// ─── Notify helpers ───────────────────────────────────────────────────────────
async function notificarNovoPedido(pedido) {
  console.log(`[Baileys] notificarNovoPedido: pedido #${pedido.id} tel=${pedido.telefone}`);

  try {
    const { rows } = await query('SELECT ativo, pedido_recebido FROM chatbot_whatsapp_config LIMIT 1');
    const cfg = rows[0];
    if (!cfg) { console.warn('[Baileys] notificarNovoPedido: no chatbot config found'); return; }
    if (!cfg.ativo) { console.log('[Baileys] notificarNovoPedido: chatbot desativado'); return; }
    if (!cfg.pedido_recebido) { console.log('[Baileys] notificarNovoPedido: toggle pedido_recebido OFF'); return; }
  } catch (err) {
    console.error('[Baileys] notificarNovoPedido: DB error:', err.message);
    return;
  }

  const tel = pedido.telefone;
  if (!tel || String(tel).replace(/\D/g, '').length < 8) {
    console.warn('[Baileys] notificarNovoPedido: telefone ausente ou inválido:', tel);
    return;
  }

  const vars = { cliente: pedido.cliente || '', id: pedido.id || '', total: pedido.total || '' };
  const text = await _getMensagem('pedido_recebido', vars);
  if (!text) { console.warn('[Baileys] notificarNovoPedido: mensagem vazia no banco para pedido_recebido'); return; }
  console.log(`[Baileys] notificarNovoPedido: enviando para ${tel}: "${text}"`);
  await sendWhatsAppMessage(tel, text);
}

async function notificarStatusPedido(pedido, novoStatus, origem = 'sistema') {
  origem = String(origem || 'sistema').toLowerCase();
  console.log(`[Baileys] notificarStatusPedido: pedido #${pedido.id} → ${novoStatus} source=${origem} tel=${pedido.telefone}`);

  // Se a rota PATCH identificou um clique duplo limpo e não alterou o banco, não notifica
  if (pedido._status_blocked) {
    console.log(`[WhatsApp] skip notification for pedido #${pedido.id} status=${novoStatus} (_status_blocked)`);
    return;
  }

  // ── (0.1) HARDBLOCK de segurança: não enviar duplicatas persistentes ──
  const historico = typeof pedido.notificacoes_historico === 'object' && pedido.notificacoes_historico !== null 
    ? pedido.notificacoes_historico 
    : {};
  if (historico[novoStatus]) {
    if (novoStatus === 'pronto' && (pedido.tipo === 'balcao' || pedido.tipo === 'retirada')) {
      console.log(`[WhatsApp] skip duplicate balcão pronto pedido #${pedido.id}`);
    } else {
      console.log(`[WhatsApp] skip duplicate notification for pedido #${pedido.id} status=${novoStatus}`);
    }
    return;
  }

  // ── (0) HARDBLOCK de segurança: cozinha NUNCA dispara mensagem ao cliente ──
  // Exceção: pedido BALCÃO/RETIRADA + status PRONTO → notificar cliente imediatamente.
  // Este bloco resolve ANTES de qualquer consulta às tabelas de regras, pois
  // chatbot_whatsapp_rules tem cozinha/pronto=false (correto para delivery) mas
  // não deve bloquear o caso de balcão.
  const isBalcaoProntoFromCozinha =
    origem === 'cozinha' &&
    novoStatus === 'pronto' &&
    (pedido.tipo === 'balcao' || pedido.tipo === 'retirada');

  if (origem === 'cozinha' && !isBalcaoProntoFromCozinha) {
    console.log(`[WhatsApp] pedido #${pedido.id} status=${novoStatus} source=${origem} => SKIPPED (regra: cozinha não notifica cliente exceto balcão pronto)`);
    return;
  }

  // ── (1) Tabela centralizada de regras (origem,status) → enviar/skip ──
  // SKIP para balcão pronto vindo da cozinha — a regra genérica cozinha/pronto=false
  // é para delivery e não deve bloquear notificação de retirada.
  if (!isBalcaoProntoFromCozinha) {
    try {
      const { rows: ruleRows } = await query(
        'SELECT enviar FROM chatbot_whatsapp_rules WHERE origem = $1 AND status = $2',
        [origem, novoStatus]
      );
      if (ruleRows.length && ruleRows[0].enviar === false) {
        console.log(`[WhatsApp] pedido #${pedido.id} status=${novoStatus} source=${origem} => SKIPPED (rule)`);
        return;
      }
    } catch (e) {
      // Tabela pode não existir ainda no startup → segue para os toggles legados
    }
  }

  // ── (2) Toggles legados em chatbot_whatsapp_config (UI atual do admin) ──
  const STATUS_TOGGLE = {
    recebido:           'pedido_recebido',
    pendente_aprovacao: 'pedido_recebido',
    em_preparo:         'pedido_aceito',
    pronto:             (pedido.tipo === 'balcao' || pedido.tipo === 'retirada') ? 'pedido_pronto_retirada' : 'pedido_pronto',
    em_entrega:         'pedido_a_caminho',
    chegou:             'pedido_chegou',
    entregue:           'pedido_entregue',
    finalizado:         'pedido_finalizado',
    cancelado:          'pedido_cancelado',
    rejeitado:          'pedido_cancelado',
  };

  try {
    const { rows } = await query('SELECT * FROM chatbot_whatsapp_config LIMIT 1');
    const cfg = rows[0];
    if (!cfg) { console.warn('[Baileys] notificarStatusPedido: no config'); return; }
    if (!cfg.ativo) { console.log('[Baileys] notificarStatusPedido: chatbot OFF'); return; }

    const tf = STATUS_TOGGLE[novoStatus];
    if (tf && !cfg[tf]) {
      console.log(`[WhatsApp] pedido #${pedido.id} status=${novoStatus} source=${origem} => SKIPPED (toggle "${tf}" OFF)`);
      return;
    }
  } catch (err) {
    console.error('[Baileys] notificarStatusPedido: DB error:', err.message);
  }

  const tel = pedido.telefone;
  if (!tel || String(tel).replace(/\D/g, '').length < 8) {
    if (novoStatus === 'pronto' && (pedido.tipo === 'balcao' || pedido.tipo === 'retirada')) {
      console.log(`[WhatsApp] sem telefone balcão pronto pedido #${pedido.id}`);
    } else {
      console.warn('[Baileys] notificarStatusPedido: telefone ausente:', tel);
    }
    return;
  }

  let chave = STATUS_CHAVE[novoStatus];
  if (novoStatus === 'pronto' && (pedido.tipo === 'balcao' || pedido.tipo === 'retirada')) {
    chave = 'pedido_pronto_retirada';
  }
  if (!chave) { console.warn('[Baileys] notificarStatusPedido: sem chave para status:', novoStatus); return; }

  const vars = {
    cliente:  pedido.cliente  || '',
    id:       pedido.id       || '',
    total:    pedido.total    || '',
    endereco: pedido.endereco || '',
    tipo_msg: pedido.tipo === 'delivery' ? 'Saindo para entrega! 🛵' : 'Pode retirar no balcão! 🏠',
    status:   novoStatus,
  };
  const text = await _getMensagem(chave, vars);
  if (!text) { console.warn(`[Baileys] notificarStatusPedido: mensagem vazia no banco para "${chave}"`); return; }
  if (novoStatus === 'pronto' && (pedido.tipo === 'balcao' || pedido.tipo === 'retirada')) {
    console.log(`[WhatsApp] balcão pronto pedido #${pedido.id} tel=${tel}`);
  } else {
    console.log(`[WhatsApp] pedido #${pedido.id} status=${novoStatus} source=${origem} => SENT`);
  }

  try {
    await query(`UPDATE pedidos SET notificacoes_historico = jsonb_set(COALESCE(notificacoes_historico, '{}'::jsonb), $1, 'true'::jsonb) WHERE id = $2`, [`{${novoStatus}}`, pedido.id]);
  } catch(e) {
    console.error('[Baileys] falha ao atualizar notificacoes_historico no banco:', e.message);
  }

  await sendWhatsAppMessage(tel, text);
}

// ─── Reconnection logic ───────────────────────────────────────────────────────
function _scheduleReconnect(reason, immediate = false) {
  if (_isManuallyClosed) return;
  if (_reconnectTimer) return; // already scheduled

  // 408 = Connection Lost → 5 s (aguarda saveCreds() terminar de escrever os key files)
  // 515 = Restart Required → 3 s
  // 500 = Error → 5 s
  // qualquer outro → 5 s
  // NUNCA usar delay 0 — cria race condition entre saveCreds(disk write) e useMultiFileAuthState(disk read).
  const DELAYS = {
    408: 5_000,
    515: 3_000,
    500: 5_000,
  };
  const delay = immediate ? 1_000 : (DELAYS[reason] ?? 5_000);

  console.log(`[Baileys] Scheduling reconnect in ${delay}ms (reason: ${reason})`);
  _status = 'reconnecting';

  _reconnectTimer = setTimeout(async () => {
    _reconnectTimer = null;
    await initBaileys();
  }, delay);
}

// ─── Main init ────────────────────────────────────────────────────────────────
async function initBaileys(phoneNumber = null) {
  console.log(`[Baileys] initBaileys() chamado | phone=${phoneNumber || 'null'} | status=${_status} | isInit=${_isInitializing}`);

  if (_isManuallyClosed) {
    console.log('[Baileys] initBaileys skipped — manually disconnected.');
    return;
  }

  // OVERRIDE: Se um número foi fornecido E há init em andamento (QR em exibição ou conectando),
  // cancelar o socket atual e reiniciar em modo phone.
  // Isso resolve o caso: usuário abre QR → muda para "Via Número" → clica "Gerar Código"
  // Sem este bloco, o guard abaixo retornaria silenciosamente e nada aconteceria.
  if (_isInitializing && phoneNumber) {
    console.log(`[Baileys] 🔄 Override: cancelando init em andamento (status=${_status}) para pairing por número.`);
    _socketGeneration++;         // invalida todos os handlers do socket antigo
    _isInitializing     = false; // libera o guard
    _pendingPhoneNumber = null;
    _qrDataUrl          = null;
    _status             = 'connecting';
    if (_sock) {
      try { _sock.end(undefined); } catch (_) {}
      _sock = null;
    }
  }

  if (_isInitializing) {
    console.log('[Baileys] initBaileys já em progresso — chamada concorrente ignorada.');
    return;
  }

  _isInitializing     = true;
  _pairingCode        = null;
  _pendingPhoneNumber = null;
  const myGen = ++_socketGeneration; // esta instância "pertence" à geração myGen

  _sock = null;

  // Detecta e limpa sessão incompleta (creds.json sem key files) ANTES de tentar carregar.
  // Sessão incompleta faz o Baileys sempre exigir novo QR, mesmo havendo creds.json.
  _clearIncompleteSession();

  const sessionFiles = fs.existsSync(SESSION_DIR) ? fs.readdirSync(SESSION_DIR) : [];
  console.log(`[Baileys] ── Initializing (gen ${myGen}) | sessão: [${sessionFiles.join(', ') || 'vazia'}] ──`);
  if (_status !== 'reconnecting') _status = 'connecting';
  _qrDataUrl = null;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version, isLatest } = await _getVersion();
    console.log(`[Baileys] WA version: ${version.join('.')} (latest: ${isLatest})`);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        // makeCacheableSignalKeyStore REQUER logger com child() totalmente recursivo.
        // Logger com child:()=>({}) causa TypeError silencioso e impede escrita de key files.
        keys: makeCacheableSignalKeyStore(state.keys, _silentLogger),
      },
      logger: _silentLogger,
      browser: ['Ubuntu', 'Chrome', '22.04.1'],  // formato Baileys: [OS, browser, version]
      printQRInTerminal: false,
      // Connection timing — tighter keepalive catches drops earlier
      connectTimeoutMs:       60_000,   // 60s — pairing pode demorar em conexões lentas
      defaultQueryTimeoutMs:  60_000,
      keepAliveIntervalMs:    15_000,   // ping a cada 15s (evita interferência no handshake)
      retryRequestDelayMs:       500,
      maxMsgRetryCount:            3,
      markOnlineOnConnect:     false,
      syncFullHistory:         false,   // faster initial connect
      getMessage: async (_key) => undefined,  // retorna undefined para msgs fora do store (correto)
    });

    _sock = sock;

    // ── Phone-number pairing: guardar número — requestPairingCode() será chamado
    // dentro do handler connection.update quando o evento 'qr' for emitido.
    // O evento 'qr' prova que ws.isOpen=true e o socket está pronto para sendNode().
    // Usar setTimeout(3s) era não-determinístico; esta abordagem é event-driven.
    if (phoneNumber && !state.creds.registered) {
      _pendingPhoneNumber = phoneNumber;
      console.log(`[Baileys] 📱 Modo pairing code — aguardando socket pronto para +${_normalizePhone(phoneNumber)}`);
    }

    // ── Save credentials on every update ─────────────────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ── Connection lifecycle ──────────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      // Se uma nova geração de socket foi criada, este socket está obsoleto — ignorar.
      if (myGen !== _socketGeneration) {
        console.log(`[Baileys] Socket obsoleto (gen ${myGen} vs atual ${_socketGeneration}) — ignorando evento.`);
        return;
      }

      const { connection, lastDisconnect, qr } = update;

      // ── QR code emitted — ws.isOpen garantido neste ponto ───────────────────
      if (qr) {
        if (_pendingPhoneNumber) {
          // MODO PHONE PAIRING: não mostrar QR. Aproveitar que ws.isOpen=true
          // para chamar requestPairingCode() agora (timing determinístico).
          const digits = _normalizePhone(_pendingPhoneNumber);
          console.log(`[Baileys] 📱 Socket pronto — solicitando pairing code para +${digits}`);
          sock.requestPairingCode(digits)
            .then(code => {
              if (myGen !== _socketGeneration) return; // socket obsoleto
              _pairingCode        = code;
              _pendingPhoneNumber = null;
              waEvents.emit('pairing_code', code);
              console.log(`[Baileys] 📱 Pairing code gerado: ${code}`);
            })
            .catch(err => {
              console.error('[Baileys] requestPairingCode error:', err.message, '\n', err.stack);
              _isInitializing     = false;
              _pendingPhoneNumber = null;
              _status             = 'disconnected';
            });
          return; // não setar _qrDataUrl — modo phone não usa QR
        }

        // MODO QR NORMAL
        try {
          _qrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
          waEvents.emit('qr', _qrDataUrl);
          _status = 'awaiting_qr';
          console.log('[Baileys] 📷 QR pronto para scan');
          _rejectQueue('Sessão inválida. Necessário escanear novo QR Code.');
        } catch (err) {
          console.error('[Baileys] QR generation error:', err.message);
        }
      }

      // ── Successfully authenticated ────────────────────────────────────────
      if (connection === 'open') {
        _isInitializing = false; // libera o guard — conexão estabelecida
        _status    = 'connected';
        _qrDataUrl = null;
        _sock      = sock; // make sure reference is current
        _lastError = null; // limpa erros antigos (ex: "Sessão inválida" de QR anterior)

        const jid  = sock.user?.id || '';
        _phone     = jid.split(':')[0].split('@')[0] || null;

        const savedFiles = fs.readdirSync(SESSION_DIR);
        console.log(`[Baileys] ✅ Connected as +${_phone} | sessão salva: [${savedFiles.join(', ')}]`);
        if (savedFiles.length < 2) {
          console.warn('[Baileys] ⚠️  ATENÇÃO: poucos arquivos de sessão. Reconexão pode exigir novo QR.');
        }
        waEvents.emit('connected', { phone: _phone });

        // Flush any messages that were queued during reconnection
        setTimeout(_flushQueue, 500);
      }

      // ── Connection closed ─────────────────────────────────────────────────
      if (connection === 'close') {
        _isInitializing = false; // libera o guard — conexão encerrada
        const err    = lastDisconnect?.error;
        const reason = (err instanceof Boom) ? err.output?.statusCode : 0;
        const msg    = err?.message || 'unknown';
        const wasAwaiting = _status === 'awaiting_qr';

        console.log(`[Baileys] ⚡ Connection closed | reason: ${reason} | status: ${_status} | msg: ${msg}`);

        _sock = null;

        // 401 / 440 = logged out → limpa sessão, requer QR novo
        const isLoggedOut = reason === DisconnectReason.loggedOut || reason === 440;
        if (isLoggedOut) {
          console.log('[Baileys] 🚪 Logged out — clearing session.');
          _status    = 'disconnected';
          _phone     = null;
          _qrDataUrl = null;
          _clearSession();
          waEvents.emit('loggedOut');
          return;
        }

        // ── CRÍTICO: Se estava aguardando QR (status = awaiting_qr), NÃO reconectar.
        // Qualquer close durante awaiting_qr significa:
        //   - ninguém leu o QR (timeout 408)
        //   - pairing falhou (WA rejeitou — 428/connectionClosed, 500/badSession, etc.)
        // Em AMBOS os casos, paramos aqui. O usuário deve clicar "Vincular" novamente.
        // Reconectar automaticamente geraria novo QR → loop infinito.
        if (wasAwaiting) {
          const reasons = { 408: 'QR expirou (ninguém leu)', 428: 'Pairing rejeitado pelo WA', 500: 'Sessão inválida' };
          const desc = reasons[reason] || `Pairing falhou (código ${reason})`;
          console.warn(`[Baileys] ⛔ ${desc} — aguardando ação do usuário (não reconecta automaticamente).`);
          _status    = 'disconnected';
          _phone     = null;
          _qrDataUrl = null;
          _lastError = { time: new Date().toISOString(), message: desc };
          waEvents.emit('disconnected', { reason: 'pairing_failed', code: reason });
          return;
        }

        // Queda de rede após autenticação → reconectar
        if (_status === 'connected') _status = 'reconnecting';
        waEvents.emit('disconnected', { reason });
        _scheduleReconnect(reason);
      }
    });

    // ── Incoming messages ─────────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.key.fromMe) {
          handleIncomingMessage(msg).catch(err =>
            console.error('[Baileys] handleIncomingMessage error:', err.message)
          );
        }
      }
    });

  } catch (err) {
    console.error('[Baileys] initBaileys error:', err.message);
    _isInitializing = false; // libera o guard — erro ao criar socket
    _status = _status === 'connected' ? 'reconnecting' : 'disconnected';
    _sock   = null;
    _scheduleReconnect(0); // retry after 3 s
  }
}

// ─── Public API: getters ──────────────────────────────────────────────────────
function getStatus()       { return { status: _status, phone: _phone, isInitializing: _isInitializing }; }
function getQRDataUrl()    { return _qrDataUrl; }
function getLastSendInfo() { return { lastSuccess: _lastSuccess, lastError: _lastError }; }
function getPairingCode()  { return _pairingCode; }

// ─── Disconnect (intentional) ─────────────────────────────────────────────────
async function disconnect() {
  _isManuallyClosed = true;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_queueFlushTimer){ clearInterval(_queueFlushTimer); _queueFlushTimer = null; }
  _msgQueue = [];

  try { if (_sock) await _sock.logout(); } catch (_) {}

  _sock      = null;
  _status    = 'disconnected';
  _phone     = null;
  _qrDataUrl = null;
  _clearSession();
  console.log('[Baileys] Manually disconnected and session cleared.');
}

// Call this to allow re-connection after a manual disconnect
function resetManualClose() { _isManuallyClosed = false; }

function _clearSession() {
  try {
    const files = fs.readdirSync(SESSION_DIR);
    for (const f of files) fs.rmSync(path.join(SESSION_DIR, f), { force: true, recursive: true });
  } catch (err) {
    console.error('[Baileys] Failed to clear session:', err.message);
  }
}

// ─── Incoming message handler (extensible) ────────────────────────────────────
async function handleIncomingMessage(msg) {
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
  console.log('[Baileys] 📨 Incoming from', msg.key.remoteJid, ':', text.substring(0, 80));
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  initBaileys,
  getStatus,
  getQRDataUrl,
  getPairingCode,
  getLastSendInfo,
  disconnect,
  resetManualClose,
  sendWhatsAppMessage,
  notificarNovoPedido,
  notificarStatusPedido,
  waEvents,
  handleIncomingMessage,
};
