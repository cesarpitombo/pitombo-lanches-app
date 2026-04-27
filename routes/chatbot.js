/**
 * routes/chatbot.js
 * Chatbot WhatsApp — QR-code connection via Baileys (WhatsApp Web protocol)
 * Replaces Meta Cloud API approach entirely.
 */

const express = require('express');
const router  = express.Router();
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getStatus, getQRDataUrl, getPairingCode, disconnect, getLastSendInfo, sendWhatsAppMessage, resetManualClose, initBaileys } = require('../services/whatsappBot');

const ADMIN_MANAGER = ['Admin', 'Manager'];

// ─── Textos padrão por chave ──────────────────────────────────────────────────
const MSG_DEFAULTS = {
  boas_vindas:               'Olá! Bem-vindo(a) ao {{loja}}! 😊 Como posso te ajudar hoje?',
  ausencia:                  'Olá! Estamos fora do horário de atendimento no momento. Voltamos em breve!',
  fazer_pedido:              'Para fazer seu pedido, acesse nosso cardápio digital pelo link abaixo. 📦',
  promocoes:                 'Confira nossas promoções e ofertas especiais de hoje! 🎁',
  solicitar_info:            'Olá! Nosso endereço, telefone e redes sociais estão disponíveis no link abaixo. 📍',
  horarios:                  'Nosso horário de atendimento: Segunda a Sexta das 11h às 22h | Sábados e Domingos das 11h às 23h.',
  carrinho_abandonado:       'Olá! 🛒 Você deixou itens no seu carrinho. Posso te ajudar a finalizar seu pedido?',
  desconto_novos_clientes:   'Bem-vindo(a)! 🎉 É a sua primeira compra? Use o cupom BEMVINDO e ganhe desconto!',
  solicitar_avaliacao:       'Muito obrigado pelo pedido! ⭐ Como foi sua experiência conosco? Sua avaliação é muito importante!',
  programa_fidelidade:       'Você acumulou pontos em seus pedidos! 🏆 Acesse nosso app para ver suas recompensas.',
  pedido_recebido:           '✅ Olá {{cliente}}! Recebemos seu pedido *#{{id}}* e ele está aguardando confirmação. Em breve retornaremos!',
  pedido_aceito:             '👨‍🍳 Ótima notícia! Seu pedido *#{{id}}* foi aceito e já está sendo preparado com carinho!',
  pedido_preparo:            '🍳 Seu pedido *#{{id}}* está sendo preparado agora! Em breve estará pronto.',
  pedido_pronto:             '🔔 Seu pedido *#{{id}}* está pronto! {{tipo_msg}}',
  pedido_pronto_retirada:    '✅ Seu pedido #{{id}} está pronto para retirada no balcão.',
  pedido_a_caminho:          '🛵 Seu pedido *#{{id}}* saiu para entrega! Fique de olho, já vamos chegar! 📍',
  pedido_chegou:             '📍 Seu pedido *#{{id}}* chegou ao local da entrega! Se puder, desça/venha receber agora. Obrigado, {{cliente}}! 😊',
  pedido_entregue:           '🎉 Pedido *#{{id}}* entregue! Obrigado pela preferência, {{cliente}}! Volte sempre 😊',
  pedido_finalizado:         '✅ Pedido *#{{id}}* finalizado com sucesso! Obrigado pela preferência!',
  pedido_cancelado:          '❌ Infelizmente seu pedido *#{{id}}* foi cancelado. Entre em contato se tiver dúvidas.',
  resumo_pedido:             '📋 Resumo do seu pedido *#{{id}}*:\n{{itens}}\nTotal: R$ {{total}}',
  solicitar_confirmacao:     '❓ Olá {{cliente}}! Poderia confirmar os dados do seu pedido *#{{id}}*? Responda SIM para confirmar.',
  notificar_entregador_auto: '🛵 Novo pedido *#{{id}}* atribuído a você! Cliente: {{cliente}} | Endereço: {{endereco}}. Boa entrega!',
};

// ─── Auto-migrate: chatbot settings table ─────────────────────────────────────
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS chatbot_whatsapp_config (
        id                          SERIAL PRIMARY KEY,
        loja_id                     INTEGER DEFAULT 1,
        ativo                       BOOLEAN DEFAULT FALSE,
        boas_vindas                 BOOLEAN DEFAULT TRUE,
        ausencia                    BOOLEAN DEFAULT TRUE,
        fazer_pedido                BOOLEAN DEFAULT TRUE,
        promocoes                   BOOLEAN DEFAULT FALSE,
        solicitar_info              BOOLEAN DEFAULT TRUE,
        horarios                    BOOLEAN DEFAULT TRUE,
        carrinho_abandonado         BOOLEAN DEFAULT FALSE,
        desconto_novos_clientes     BOOLEAN DEFAULT FALSE,
        solicitar_avaliacao         BOOLEAN DEFAULT FALSE,
        programa_fidelidade         BOOLEAN DEFAULT FALSE,
        pedido_recebido             BOOLEAN DEFAULT TRUE,
        pedido_aceito               BOOLEAN DEFAULT TRUE,
        pedido_preparo              BOOLEAN DEFAULT TRUE,
        pedido_pronto               BOOLEAN DEFAULT TRUE,
        pedido_pronto_retirada      BOOLEAN DEFAULT TRUE,
        pedido_a_caminho            BOOLEAN DEFAULT TRUE,
        pedido_chegou               BOOLEAN DEFAULT TRUE,
        pedido_entregue             BOOLEAN DEFAULT TRUE,
        pedido_finalizado           BOOLEAN DEFAULT TRUE,
        pedido_cancelado            BOOLEAN DEFAULT TRUE,
        resumo_pedido               BOOLEAN DEFAULT FALSE,
        solicitar_confirmacao       BOOLEAN DEFAULT FALSE,
        notificar_entregador_auto   BOOLEAN DEFAULT FALSE,
        created_at                  TIMESTAMPTZ DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Migration: garante que toggles novos (ex: pedido_chegou) sejam adicionados em
    // instalações antigas que já tinham a tabela criada antes da coluna existir.
    await query(`ALTER TABLE chatbot_whatsapp_config
      ADD COLUMN IF NOT EXISTS pedido_chegou BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS pedido_pronto_retirada BOOLEAN DEFAULT TRUE`);

    const { rows } = await query('SELECT id FROM chatbot_whatsapp_config LIMIT 1');
    if (rows.length === 0) {
      await query('INSERT INTO chatbot_whatsapp_config (loja_id) VALUES (1)');
    }

    // ── Tabela de textos editáveis por chave ──────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS chatbot_mensagens (
        chave      TEXT        PRIMARY KEY,
        mensagem   TEXT        NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed: insere defaults apenas se a chave ainda não existir
    for (const [chave, mensagem] of Object.entries(MSG_DEFAULTS)) {
      await query(
        `INSERT INTO chatbot_mensagens (chave, mensagem) VALUES ($1, $2) ON CONFLICT (chave) DO NOTHING`,
        [chave, mensagem]
      );
    }

    // ── Tabela de regras (origem,status) → enviar/skip ────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS chatbot_whatsapp_rules (
        origem  TEXT    NOT NULL,
        status  TEXT    NOT NULL,
        enviar  BOOLEAN NOT NULL DEFAULT TRUE,
        PRIMARY KEY (origem, status)
      )
    `);
    const RULE_SEED = [
      ['cozinha',    'em_preparo', false],
      ['cozinha',    'pronto',     false],
      ['entregador', 'em_entrega', true],
      ['entregador', 'chegou',     true],
      ['entregador', 'entregue',   true],
      ['admin',      'pronto',     true],
      ['admin',      'em_entrega', true],
      ['admin',      'chegou',     true],
      ['admin',      'entregue',   true],
      ['pdv',        'pronto',     true],
      ['pdv',        'chegou',     true],
      ['sistema',    'pronto',     true],
      ['sistema',    'chegou',     true],
    ];
    for (const [origem, status, enviar] of RULE_SEED) {
      await query(
        `INSERT INTO chatbot_whatsapp_rules (origem, status, enviar) VALUES ($1, $2, $3) ON CONFLICT (origem, status) DO NOTHING`,
        [origem, status, enviar]
      );
    }

    console.log('✅ chatbot_whatsapp_config + chatbot_mensagens + chatbot_whatsapp_rules: tabelas verificadas.');
  } catch (e) {
    console.error('⚠️ Migration chatbot:', e.message);
  }
})();

// ─── GET /api/chatbot-whatsapp/status ────────────────────────────────────────────────────
// Returns WhatsApp connection status + last send audit trail.
router.get('/status', requireAuth, requireRole(ADMIN_MANAGER), (req, res) => {
  const st   = getStatus();
  const info = getLastSendInfo();
  res.json({ ...st, ...info });
});

// ─── POST /api/chatbot-whatsapp/connect ─────────────────────────────────────────
// Inicia a conexão Baileys.
// Body opcional: { phone: "5511999999999" } → ativa phone-number pairing em vez de QR.
router.post('/connect', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { phone } = req.body || {};
  const { status, isInitializing } = getStatus();
  console.log(`[ChatbotAPI] POST /connect | phone=${phone || 'null'} | status=${status} | isInit=${isInitializing}`);
  if (status === 'connected') {
    return res.json({ ok: true, already: true });
  }
  // Phone pairing permite override: cancela QR em andamento e reinicia com número.
  // Sem phone: respeita o guard para evitar sockets duplos.
  if (isInitializing && !phone) {
    return res.json({ ok: true, already: true, message: 'Conexão já em andamento.' });
  }
  resetManualClose();
  initBaileys(phone || null).catch(err => console.error('[ChatbotAPI] initBaileys error:', err.message));
  res.json({ ok: true, phoneMode: !!phone });
});

// ─── GET /api/chatbot-whatsapp/pairing-code ──────────────────────────────────
// Retorna o código de 8 chars gerado por requestPairingCode() (phone-number pairing).
// Retorna 202 enquanto o código ainda não está disponível.
router.get('/pairing-code', requireAuth, requireRole(ADMIN_MANAGER), (_req, res) => {
  const code = getPairingCode();
  if (!code) return res.status(202).json({ message: 'Código ainda não disponível.' });
  res.json({ code });
});

// ─── GET /api/chatbot-whatsapp/qr ────────────────────────────────────────────────────
// Retorna o QR code atual como PNG data-url. NÃO inicia conexão — use POST /connect.
router.get('/qr', requireAuth, requireRole(ADMIN_MANAGER), (req, res) => {
  const { status } = getStatus();
  if (status === 'connected') {
    return res.status(200).json({ connected: true });
  }
  const qr = getQRDataUrl();
  if (!qr) {
    return res.status(202).json({ message: 'QR não disponível ainda.' });
  }
  res.json({ qr });
});

// ─── POST /api/chatbot-whatsapp/send-test ────────────────────────────────────────────────────
// Envia mensagem de teste sem precisar criar pedido real.
router.post('/send-test', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
  try {
    const ok = await sendWhatsAppMessage(String(phone).replace(/\D/g,''), '🤖 Teste Pitombo Lanches! Chatbot operacional. ✅');
    if (ok) res.json({ success: true });
    else res.status(503).json({ error: `Não foi possível enviar. Status: ${getStatus().status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/chatbot-whatsapp/disconnect ────────────────────────────────────────────────────
router.post('/disconnect', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    await disconnect();
    res.json({ success: true });
  } catch (err) {
    console.error('[ChatbotAPI] disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/chatbot-whatsapp/mensagens ─────────────────────────────────────
// Retorna objeto { chave: mensagem } de todas as mensagens editáveis.
router.get('/mensagens', requireAuth, requireRole(ADMIN_MANAGER), async (_req, res) => {
  try {
    const { rows } = await query('SELECT chave, mensagem FROM chatbot_mensagens ORDER BY chave');
    const mensagens = {};
    rows.forEach(r => { mensagens[r.chave] = r.mensagem; });
    res.json(mensagens);
  } catch (err) {
    console.error('[ChatbotAPI] GET /mensagens:', err.message);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// ─── PUT /api/chatbot-whatsapp/mensagens ─────────────────────────────────────
// Salva textos das mensagens. Body: { boas_vindas: '...', pedido_aceito: '...', ... }
router.put('/mensagens', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const entries = Object.entries(req.body || {}).filter(([k]) => k in MSG_DEFAULTS);
    if (!entries.length) return res.json({ success: true, updated: 0 });

    for (const [chave, mensagem] of entries) {
      await query(
        `INSERT INTO chatbot_mensagens (chave, mensagem, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (chave) DO UPDATE SET mensagem = EXCLUDED.mensagem, updated_at = NOW()`,
        [chave, String(mensagem)]
      );
    }
    res.json({ success: true, updated: entries.length });
  } catch (err) {
    console.error('[ChatbotAPI] PUT /mensagens:', err.message);
    res.status(500).json({ error: 'Erro ao salvar mensagens' });
  }
});

// ─── GET /api/chatbot-whatsapp ────────────────────────────────────────────────
// Returns chatbot toggle config + WA status + mensagens (combined for UI load).
router.get('/', requireAuth, requireRole(ADMIN_MANAGER), async (_req, res) => {
  try {
    const [cfgResult, msgResult] = await Promise.all([
      query('SELECT * FROM chatbot_whatsapp_config LIMIT 1'),
      query('SELECT chave, mensagem FROM chatbot_mensagens'),
    ]);
    const mensagens = {};
    msgResult.rows.forEach(r => { mensagens[r.chave] = r.mensagem; });
    res.json({
      chatbot:    cfgResult.rows[0] || {},
      whatsapp:   getStatus(),
      mensagens,
    });
  } catch (err) {
    console.error('[ChatbotAPI] GET:', err.message);
    res.status(500).json({ error: 'Erro ao buscar configurações do chatbot' });
  }
});

// ─── PUT /api/chatbot-whatsapp ────────────────────────────────────────────────
// Saves chatbot toggle settings.
router.put('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const body = req.body;
    const boolFields = [
      'ativo', 'boas_vindas', 'ausencia', 'fazer_pedido', 'promocoes',
      'solicitar_info', 'horarios', 'carrinho_abandonado', 'desconto_novos_clientes',
      'solicitar_avaliacao', 'programa_fidelidade', 'pedido_recebido', 'pedido_aceito',
      'pedido_preparo', 'pedido_pronto', 'pedido_pronto_retirada', 'pedido_a_caminho', 'pedido_chegou',
      'pedido_entregue', 'pedido_finalizado', 'pedido_cancelado', 'resumo_pedido',
      'solicitar_confirmacao', 'notificar_entregador_auto',
    ];

    const fields = boolFields.filter(f => f in body);
    if (fields.length === 0) return res.json({ success: true, message: 'Nenhum campo atualizado.' });

    const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values     = fields.map(f => Boolean(body[f]));
    values.push(new Date());

    const { rows } = await query(
      `UPDATE chatbot_whatsapp_config SET ${setClauses}, updated_at = $${values.length} WHERE id = (SELECT id FROM chatbot_whatsapp_config LIMIT 1) RETURNING *`,
      values
    );
    res.json({ success: true, chatbot: rows[0] });
  } catch (err) {
    console.error('[ChatbotAPI] PUT:', err.message);
    res.status(500).json({ error: 'Erro ao salvar configurações do chatbot' });
  }
});

module.exports = router;
