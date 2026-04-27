/**
 * admin-chatbot.js
 * Chatbot WhatsApp — toggles + mensagens editáveis com persistência real no banco.
 *
 * Estado:
 *   _config    → booleans da chatbot_whatsapp_config (ativo, boas_vindas, etc.)
 *   _mensagens → textos de chatbot_mensagens { chave: 'texto' }
 *   _dirty     → rastreia alterações pendentes para o save bar honesto
 *   _waStatus  → status da conexão WhatsApp
 */

(function () {
  'use strict';

  let _config    = {};
  let _mensagens = {};
  let _dirty     = { toggles: false, mensagens: {} }; // mensagens: { chave: true }
  let _waStatus  = { status: 'disconnected', phone: null };

  let _saveTimer  = null;
  let _pollTimer  = null;
  let _qrTimer    = null;
  let _pairTimer  = null;
  let _modalOpen  = false;
  let _modalMode  = 'phone'; // 'qr' | 'phone' — padrão: phone-number pairing (mais confiável)

  // ─── Items de configuração ──────────────────────────────────────────────────
  // [chave_db, label, placeholder]
  const TOGGLE_ITEMS = [
    // Respostas automáticas
    { grupo: '💬 Respostas Automáticas', items: [
      ['boas_vindas',    '👋 Mensagem de boas-vindas',       'Ex: Olá! Bem-vindo(a)! Como posso ajudar?'],
      ['ausencia',       '🌙 Mensagem de ausência',           'Ex: Estamos fora do horário. Voltamos em breve!'],
      ['fazer_pedido',   '📦 Instrução para fazer pedido',    'Ex: Para pedir, acesse nosso link...'],
      ['promocoes',      '🎁 Promoções do dia',               'Ex: Confira nossas ofertas especiais!'],
      ['solicitar_info', '📍 Informações da loja',            'Ex: Nosso endereço, telefone...'],
      ['horarios',       '🕐 Horários de atendimento',        'Ex: Segunda a Sexta das 11h às 22h...'],
    ]},
    // Recuperador de vendas
    { grupo: '🔄 Recuperador de Vendas', items: [
      ['carrinho_abandonado',     '🛒 Carrinho abandonado',         'Ex: Você deixou itens no carrinho...'],
      ['desconto_novos_clientes', '🎉 Desconto para novos clientes','Ex: Use o cupom BEMVINDO...'],
    ]},
    // Avaliações
    { grupo: '⭐ Avaliações', items: [
      ['solicitar_avaliacao', '⭐ Solicitar uma avaliação', 'Ex: Como foi sua experiência?'],
    ]},
    // Fidelidade
    { grupo: '🏆 Programa de Fidelidade', items: [
      ['programa_fidelidade', '🎯 Mensagem de Fidelidade', 'Ex: Você acumulou pontos!'],
    ]},
    // Status do pedido
    { grupo: '📱 Notificações de Pedido', items: [
      ['pedido_recebido',    'Pedido recebido',    'Variáveis: {{cliente}} {{id}} {{total}}'],
      ['pedido_aceito',      'Pedido aceito',      'Variáveis: {{cliente}} {{id}}'],
      ['pedido_preparo',     'Pedido em preparo',  'Variáveis: {{id}}'],
      ['pedido_pronto',      'Pedido pronto (Delivery)', 'Variáveis: {{id}} {{tipo_msg}}'],
      ['pedido_pronto_retirada', 'Pedido pronto (Balcão)', 'Variáveis: {{id}}'],
      ['pedido_a_caminho',   'Pedido a caminho',   'Variáveis: {{id}}'],
      ['pedido_chegou',      'Pedido chegou',      'Variáveis: {{cliente}} {{id}} — enviado quando o entregador marca "Chegou"'],
      ['pedido_entregue',    'Pedido entregue',    'Variáveis: {{cliente}} {{id}}'],
      ['pedido_finalizado',  'Pedido finalizado',  'Variáveis: {{id}}'],
      ['pedido_cancelado',   'Pedido cancelado',   'Variáveis: {{id}}'],
      ['resumo_pedido',      'Resumo do pedido',   'Variáveis: {{id}} {{itens}} {{total}}'],
      ['solicitar_confirmacao', 'Solicitar confirmação', 'Variáveis: {{cliente}} {{id}}'],
    ]},
    // Entregador
    { grupo: '🛵 Notificação para Entregadores', items: [
      ['notificar_entregador_auto', 'Atribuição automática de pedido', 'Variáveis: {{id}} {{cliente}} {{endereco}}'],
    ]},
  ];

  // ─── Inicialização ──────────────────────────────────────────────────────────
  window.ChatbotManager = {

    async init() {
      await this.load();
      this.render();
      this._startStatusPoll(4_000);
    },

    async load() {
      try {
        const res  = await apiFetch('/api/chatbot-whatsapp');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data  = await res.json();
        _config     = data.chatbot    || {};
        _waStatus   = data.whatsapp   || { status: 'disconnected', phone: null };
        _mensagens  = data.mensagens  || {};
      } catch (err) {
        console.error('ChatbotManager load error:', err.message);
      }
    },

    // ─── Render principal ─────────────────────────────────────────────────────
    render() {
      const section = document.getElementById('chatbot-whatsapp');
      if (!section) return;

      const isAtivo     = !!_config.ativo;
      const isConnected = _waStatus.status === 'connected';

      section.innerHTML = `
        <div class="chatbot-page">

          <!-- HERO -->
          <div class="chatbot-hero">
            <div class="chatbot-hero-info">
              <div class="chatbot-hero-icon">💬</div>
              <div>
                <h2 class="chatbot-hero-title">Chatbot do WhatsApp</h2>
                <p class="chatbot-hero-subtitle">Configure mensagens automáticas e notificações de pedidos em tempo real.</p>
              </div>
            </div>
            <div class="chatbot-master-toggle">
              <label class="cb-switch-wrap">
                <span class="cb-switch-label" id="lbl-ativo">${
                  isConnected
                    ? (isAtivo ? '🟢 Chatbot Ativo' : '⭕ Chatbot Inativo')
                    : '🔌 Sem conexão WhatsApp'
                }</span>
                <div class="cb-switch ${isAtivo && isConnected ? 'cb-on' : ''}" data-field="ativo"
                  style="${!isConnected ? 'opacity:0.45;cursor:not-allowed;' : ''}">
                  <div class="cb-knob"></div>
                </div>
              </label>
            </div>
          </div>

          <!-- CONNECTION CARD -->
          <div class="chatbot-card chatbot-card--connection" id="wa-connection-card">
            ${this._renderConnectionCard(_waStatus)}
          </div>

          <div class="chatbot-body">
            <div class="chatbot-col-left">
              ${TOGGLE_ITEMS.map(grupo => `
                <div class="chatbot-card">
                  <div class="chatbot-card-header">
                    <h3>${grupo.grupo}</h3>
                  </div>
                  ${grupo.items.map(([chave, label, placeholder]) =>
                    this._toggleItem(chave, label, placeholder)
                  ).join('')}
                </div>
              `).join('')}
            </div>

            <div class="chatbot-col-right">
              <div class="chatbot-info-panel">
                <h3>📌 Variáveis disponíveis</h3>
                <p style="font-size:0.85rem;color:#555;margin-bottom:0.5rem;">Use nas mensagens de pedido:</p>
                <ul style="font-size:0.82rem;color:#374151;line-height:1.9;margin:0;padding-left:1.2rem;">
                  <li><code>{{cliente}}</code> — nome do cliente</li>
                  <li><code>{{id}}</code> — número do pedido</li>
                  <li><code>{{total}}</code> — valor total</li>
                  <li><code>{{itens}}</code> — lista de itens</li>
                  <li><code>{{endereco}}</code> — endereço de entrega</li>
                  <li><code>{{tipo_msg}}</code> — "Pode retirar!" ou "Saindo para entrega."</li>
                  <li><code>{{loja}}</code> — nome da loja</li>
                </ul>
              </div>

              <div class="chatbot-info-panel" style="margin-top:1rem;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-color:#bbf7d0;">
                <h3 style="color:#15803d;">📱 Como conectar via número</h3>
                <ol style="margin:0.5rem 0 0;padding-left:1.2rem;color:#374151;font-size:0.88rem;line-height:1.9;">
                  <li>Clique em "Vincular WhatsApp"</li>
                  <li>Selecione "Via Número de Telefone"</li>
                  <li>Digite o número e clique "Gerar Código"</li>
                  <li>Abra o WhatsApp → Aparelhos conectados → Vincular novo aparelho → <strong>Vincular com número de telefone</strong></li>
                  <li>Digite o código de 8 letras exibido na tela</li>
                </ol>
                <p style="font-size:0.78rem;color:#6b7280;margin-top:0.5rem;">
                  A sessão fica salva no servidor. Ao reiniciar, reconecta automaticamente sem pedir código novamente.
                </p>
              </div>
            </div>
          </div>

          <!-- SAVE BAR — aparece só quando há alteração real pendente -->
          <div class="chatbot-save-bar" id="chatbot-save-bar" style="display:none;">
            <span id="save-bar-msg">Alterações pendentes não salvas</span>
            <button class="chatbot-btn-save" id="btn-salvar-chatbot">💾 Salvar tudo</button>
          </div>

        </div>

        <!-- MODAL DE CONEXÃO (QR ou Número) -->
        <div id="modal-wa-qr" style="display:none;position:fixed;inset:0;z-index:99999;
          background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:1rem;">
          <div style="background:#fff;border-radius:16px;max-width:480px;width:100%;
            padding:2rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);position:relative;">
            <button id="btn-close-qr-modal" style="position:absolute;top:1rem;right:1rem;
              background:none;border:none;font-size:1.4rem;cursor:pointer;color:#6b7280;">✕</button>
            <h3 style="margin:0 0 1.2rem;font-size:1.1rem;font-weight:800;">Conectar WhatsApp</h3>

            <!-- Abas de modo -->
            <div style="display:flex;gap:8px;margin-bottom:1.25rem;">
              <button id="btn-mode-phone" style="flex:1;padding:0.55rem 0.5rem;border-radius:8px;font-size:0.85rem;
                font-weight:700;cursor:pointer;border:2px solid #25d366;background:#25d366;color:#fff;">
                📱 Via Número
              </button>
              <button id="btn-mode-qr" style="flex:1;padding:0.55rem 0.5rem;border-radius:8px;font-size:0.85rem;
                font-weight:700;cursor:pointer;border:2px solid #d1d5db;background:#fff;color:#6b7280;">
                📷 Via QR Code
              </button>
            </div>

            <!-- Área: Via Número (padrão) -->
            <div id="phone-area">
              <p style="margin:0 0 1rem;color:#374151;font-size:0.88rem;line-height:1.6;">
                Digite o número do WhatsApp que será o chatbot. Depois, entre no WhatsApp desse número →
                <strong>Aparelhos conectados → Vincular novo aparelho → Vincular com número de telefone</strong>
                e insira o código gerado.
              </p>
              <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
                <input id="wa-phone-input" type="tel" placeholder="5511999999999 (DDI + DDD + número)"
                  style="flex:1;padding:0.6rem 0.75rem;border:1.5px solid #d1d5db;border-radius:8px;
                  font-size:0.9rem;outline:none;">
                <button id="btn-gen-code" style="background:#25d366;color:#fff;border:none;border-radius:8px;
                  padding:0.6rem 1rem;font-weight:700;font-size:0.88rem;cursor:pointer;white-space:nowrap;">
                  Gerar Código
                </button>
              </div>
              <div id="pairing-code-display" style="display:none;text-align:center;
                background:#f0fdf4;border-radius:12px;padding:1.5rem;margin-bottom:0.75rem;">
                <div style="font-size:0.8rem;color:#6b7280;margin-bottom:0.5rem;">Código de vinculação:</div>
                <div id="pairing-code-text" style="font-size:2.2rem;letter-spacing:6px;font-weight:900;
                  color:#15803d;font-family:monospace;"></div>
                <div style="font-size:0.78rem;color:#374151;margin-top:0.75rem;line-height:1.6;">
                  Insira este código no WhatsApp em:<br>
                  <strong>Aparelhos conectados → Vincular → Vincular com número de telefone</strong>
                </div>
              </div>
              <div id="pairing-spinner" style="display:none;text-align:center;color:#6b7280;padding:1.5rem;">
                <div style="font-size:2rem;margin-bottom:0.5rem;">⏳</div>
                <div style="font-size:0.85rem;">Aguardando código...</div>
              </div>
            </div>

            <!-- Área: Via QR (alternativo) -->
            <div id="qr-area" style="display:none;">
              <ol style="margin:0 0 1rem;padding-left:1.3rem;color:#374151;font-size:0.88rem;line-height:1.9;">
                <li>Abra o WhatsApp no celular 📱</li>
                <li>Vá em <strong>Configurações → Dispositivos conectados → Conectar</strong></li>
                <li>Aponte a câmera para o QR abaixo</li>
              </ol>
              <div style="background:#f0fdf4;border-radius:12px;padding:1.5rem;
                display:flex;align-items:center;justify-content:center;min-height:200px;margin-bottom:1rem;">
                <div id="qr-spinner" style="text-align:center;color:#6b7280;">
                  <div style="font-size:2rem;margin-bottom:0.5rem;">⏳</div>
                  <div style="font-size:0.85rem;">Gerando QR Code...</div>
                </div>
                <img id="qr-img" src="" alt="QR Code" style="display:none;width:240px;height:240px;border-radius:8px;" />
              </div>
            </div>

          </div>
        </div>
      `;

      this.setupEvents();
    },

    // ─── Connection card ──────────────────────────────────────────────────────
    _renderConnectionCard(waData) {
      if (waData.status !== 'disconnected' && waData.status !== 'awaiting_qr') {
        const isReallyConnected = waData.status === 'connected';
        const chatbotOn = !!_config.ativo && isReallyConnected;
        const lastOk    = waData.lastSuccess
          ? `✅ Último envio: ${new Date(waData.lastSuccess).toLocaleTimeString('pt-BR')}`
          : '⏳ Nenhum envio ainda';
        const lastErr = waData.lastError
          ? `❌ Último erro (${new Date(waData.lastError.time).toLocaleTimeString('pt-BR')}): ${waData.lastError.message}`
          : '';

        let statusColor = '#16a34a', statusGlow = '#bbf7d0', statusText = 'WhatsApp Conectado';
        let badgeBg = chatbotOn ? '#dcfce7' : '#fee2e2';
        let badgeColor = chatbotOn ? '#15803d' : '#dc2626';
        let badgeText  = chatbotOn ? '🟢 Chatbot ON' : '⭕ Chatbot OFF';

        if (waData.status === 'connecting') {
          statusColor = '#eab308'; statusGlow = '#fef08a';
          statusText  = '⏳ Conectando...';
          badgeBg = '#fef9c3'; badgeColor = '#854d0e'; badgeText = '⏳ Aguardando';
        } else if (waData.status === 'reconnecting') {
          statusColor = '#f97316'; statusGlow = '#fed7aa';
          statusText  = '🔄 Reconectando...';
          badgeBg = '#ffedd5'; badgeColor = '#9a3412'; badgeText = '⏳ Aguardando';
        }

        return `
          <div style="display:flex;flex-direction:column;gap:0.8rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
              <div>
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;">
                  <span style="width:12px;height:12px;border-radius:50%;background:${statusColor};display:inline-block;box-shadow:0 0 0 3px ${statusGlow};"></span>
                  <span style="font-weight:800;font-size:1.05rem;color:#111;">${statusText}</span>
                  <span style="font-size:0.78rem;padding:0.2rem 0.6rem;border-radius:999px;background:${badgeBg};color:${badgeColor};font-weight:700;">${badgeText}</span>
                </div>
                <div style="font-size:0.88rem;color:#6b7280;">Número: <strong style="color:#111;">+${waData.phone || '—'}</strong></div>
                <div style="font-size:0.8rem;color:#6b7280;margin-top:0.25rem;">${lastOk}</div>
                ${lastErr ? `<div style="font-size:0.78rem;color:#dc2626;margin-top:0.2rem;">${lastErr}</div>` : ''}
              </div>
              <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
                <button id="btn-wa-send-test" class="chatbot-btn-save"
                  style="background:#25d366;width:auto;padding:0.6rem 1.1rem;white-space:nowrap;font-size:0.85rem;">
                  🧪 Testar Envio
                </button>
                <button id="btn-wa-disconnect" class="chatbot-btn-save"
                  style="background:#ef4444;width:auto;padding:0.6rem 1.1rem;white-space:nowrap;font-size:0.85rem;">
                  🔌 Desconectar
                </button>
              </div>
            </div>
            <div id="send-test-row" style="display:none;align-items:center;gap:0.5rem;">
              <input id="send-test-phone" type="tel" placeholder="5511999999999 (com DDI)"
                style="flex:1;padding:0.5rem 0.75rem;border:1.5px solid #d1d5db;border-radius:8px;font-size:0.85rem;">
              <button id="btn-wa-send-test-go" class="chatbot-btn-save"
                style="background:#16a34a;width:auto;padding:0.5rem 1rem;font-size:0.85rem;white-space:nowrap;">Enviar</button>
            </div>
          </div>`;
      }

      return `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1.5rem;">
          <div>
            <div style="font-weight:800;font-size:1.05rem;color:#111;margin-bottom:0.4rem;">📲 WhatsApp não vinculado</div>
            <p style="margin:0;color:#6b7280;font-size:0.88rem;max-width:400px;">
              Vincule seu WhatsApp para ativar o chatbot e enviar notificações automáticas de pedidos.
            </p>
          </div>
          <button id="btn-wa-connect" class="chatbot-btn-save"
            style="background:#25d366;width:auto;padding:0.8rem 1.6rem;white-space:nowrap;font-size:1rem;">
            <i class="fab fa-whatsapp" style="margin-right:0.5rem;"></i> Vincular WhatsApp
          </button>
        </div>`;
    },

    // ─── Toggle item com textarea editável ────────────────────────────────────
    _toggleItem(chave, label, placeholder) {
      const isOn  = !!_config[chave];
      const texto = _mensagens[chave] || '';

      return `
        <div class="chatbot-toggle-item" style="flex-direction:column;align-items:flex-start;gap:0.6rem;padding:1rem 0;">
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:0.75rem;">
            <div class="chatbot-toggle-label" style="font-weight:600;color:#111;font-size:0.92rem;">${label}</div>
            <div class="cb-switch ${isOn ? 'cb-on' : ''}" data-field="${chave}" style="flex-shrink:0;">
              <div class="cb-knob"></div>
            </div>
          </div>
          <div style="width:100%;">
            <textarea
              class="chatbot-msg-textarea"
              data-key="${chave}"
              rows="2"
              placeholder="${placeholder}"
              style="width:100%;box-sizing:border-box;padding:0.5rem 0.7rem;border:1.5px solid #e5e7eb;
                border-radius:8px;font-size:0.83rem;color:#374151;resize:vertical;
                font-family:inherit;background:${isOn ? '#fff' : '#f9fafb'};
                transition:border-color 0.2s;"
            >${_escHtml(texto)}</textarea>
            <div style="display:flex;justify-content:flex-end;margin-top:0.3rem;">
              <button class="btn-salvar-msg" data-key="${chave}"
                style="background:#1976d2;color:#fff;border:none;padding:4px 12px;border-radius:6px;
                  font-size:0.78rem;font-weight:700;cursor:pointer;opacity:0.5;pointer-events:none;"
                disabled>
                💾 Salvar
              </button>
            </div>
          </div>
        </div>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:0;">`;
    },

    // ─── Events ───────────────────────────────────────────────────────────────
    setupEvents() {
      const section = document.getElementById('chatbot-whatsapp');
      if (!section) return;

      // Toggle switches
      section.addEventListener('click', (e) => {
        const sw = e.target.closest('.cb-switch');
        if (!sw || !sw.dataset.field) return;
        const field = sw.dataset.field;
        const nowOn = sw.classList.contains('cb-on');

        if (field === 'ativo') {
          if (_waStatus.status !== 'connected') {
            this._showToast('⚠️ Conecte o WhatsApp antes de ativar o chatbot.', true);
            return;
          }
          sw.classList.toggle('cb-on', !nowOn);
          _config[field] = !nowOn;
          const lbl = document.getElementById('lbl-ativo');
          if (lbl) lbl.textContent = !nowOn ? '🟢 Chatbot Ativo' : '⭕ Chatbot Inativo';
          this._saveField('ativo', !nowOn);
          return;
        }

        sw.classList.toggle('cb-on', !nowOn);
        _config[field] = !nowOn;
        // Escurece/clareia textarea junto com o toggle
        const ta = section.querySelector(`.chatbot-msg-textarea[data-key="${field}"]`);
        if (ta) ta.style.background = !nowOn ? '#fff' : '#f9fafb';
        this._markDirtyToggle();
      });

      // Textarea edição — ativa botão "Salvar" do item
      section.addEventListener('input', (e) => {
        const ta = e.target.closest('.chatbot-msg-textarea');
        if (!ta) return;
        const chave = ta.dataset.key;
        _mensagens[chave] = ta.value;
        _dirty.mensagens[chave] = true;
        // Habilita o botão salvar deste item
        const btn = section.querySelector(`.btn-salvar-msg[data-key="${chave}"]`);
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
        this._showSaveBar();
      });

      // Botão salvar por item
      section.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-salvar-msg');
        if (!btn) return;
        const chave = btn.dataset.key;
        await this._saveMensagem(chave, btn);
      });

      // Botão salvar-tudo (save bar)
      document.getElementById('btn-salvar-chatbot')?.addEventListener('click', () => this._saveAll());

      // Connection buttons (rebind após cada render do card)
      this._bindConnectionButtons();

      // Modal de conexão — fechar
      document.getElementById('btn-close-qr-modal')?.addEventListener('click', () => this._closeQRModal());
      document.getElementById('modal-wa-qr')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-wa-qr')) this._closeQRModal();
      });

      // Abas do modal
      document.getElementById('btn-mode-phone')?.addEventListener('click', () => this._switchModalMode('phone'));
      document.getElementById('btn-mode-qr')?.addEventListener('click',    () => this._switchModalMode('qr'));

      // Gerar código de pareamento via número
      document.getElementById('btn-gen-code')?.addEventListener('click', () => this._doGenPairingCode());
    },

    _bindConnectionButtons() {
      document.getElementById('btn-wa-connect')?.addEventListener('click', () => this._openQRModal());
      document.getElementById('btn-wa-disconnect')?.addEventListener('click', () => this._doDisconnect());
      document.getElementById('btn-wa-send-test')?.addEventListener('click', () => {
        const row = document.getElementById('send-test-row');
        if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
      });
      document.getElementById('btn-wa-send-test-go')?.addEventListener('click', () => this._doSendTest());
    },

    // ─── Salvar mensagem individual ───────────────────────────────────────────
    async _saveMensagem(chave, btnEl) {
      const texto = _mensagens[chave] ?? '';
      const btn   = btnEl || document.querySelector(`.btn-salvar-msg[data-key="${chave}"]`);
      if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
      try {
        const res = await apiFetch('/api/chatbot-whatsapp/mensagens', {
          method: 'PUT',
          body: { [chave]: texto },
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        delete _dirty.mensagens[chave];
        if (btn) { btn.textContent = '✅ Salvo'; btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; }
        setTimeout(() => { if (btn) { btn.textContent = '💾 Salvar'; btn.disabled = false; } }, 2000);
        if (!Object.keys(_dirty.mensagens).length && !_dirty.toggles) this._hideSaveBar();
      } catch (err) {
        this._showToast('❌ Erro ao salvar mensagem: ' + err.message, true);
        if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar'; }
      }
    },

    // ─── Salvar tudo (toggles + mensagens com alterações) ────────────────────
    async _saveAll() {
      clearTimeout(_saveTimer);
      const btn = document.getElementById('btn-salvar-chatbot');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Salvando...'; }

      let ok = true;
      try {
        // 1. Salvar toggles (sempre, mesmo que não dirty, para garantir sync)
        if (_dirty.toggles) {
          const res = await apiFetch('/api/chatbot-whatsapp', { method: 'PUT', body: _config });
          if (!res.ok) throw new Error('Falha ao salvar toggles: HTTP ' + res.status);
          _dirty.toggles = false;
        }

        // 2. Salvar mensagens com alterações pendentes
        const chavesDirty = Object.keys(_dirty.mensagens);
        if (chavesDirty.length > 0) {
          const payload = {};
          chavesDirty.forEach(k => { payload[k] = _mensagens[k] ?? ''; });
          const res = await apiFetch('/api/chatbot-whatsapp/mensagens', { method: 'PUT', body: payload });
          if (!res.ok) throw new Error('Falha ao salvar mensagens: HTTP ' + res.status);
          _dirty.mensagens = {};
          // Desabilita todos os botões salvar de item
          document.querySelectorAll('.btn-salvar-msg').forEach(b => {
            b.disabled = true; b.style.opacity = '0.5'; b.style.pointerEvents = 'none'; b.textContent = '💾 Salvar';
          });
        }

        this._hideSaveBar();
        this._showToast('✅ Configurações salvas com sucesso!');
      } catch (err) {
        ok = false;
        this._showToast('❌ ' + err.message, true);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar tudo'; }
      }
      return ok;
    },

    // ─── Salvar campo único imediatamente (toggle ativo) ──────────────────────
    async _saveField(field, value) {
      try {
        const res = await apiFetch('/api/chatbot-whatsapp', { method: 'PUT', body: { [field]: value } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _config[field] = value;
        this._showToast(value ? '🟢 Chatbot ativado!' : '⭕ Chatbot desativado.');
      } catch (err) {
        this._showToast('❌ Erro ao salvar: ' + err.message, true);
      }
    },

    // ─── Dirty tracking / Save bar ────────────────────────────────────────────
    _markDirtyToggle() {
      _dirty.toggles = true;
      this._showSaveBar();
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => this._saveAll(), 3_000);
    },

    _showSaveBar() {
      const bar = document.getElementById('chatbot-save-bar');
      if (bar) bar.style.display = 'flex';
      const nMsg = Object.keys(_dirty.mensagens).length;
      const msg  = document.getElementById('save-bar-msg');
      if (msg) {
        const parts = [];
        if (_dirty.toggles) parts.push('toggles');
        if (nMsg > 0) parts.push(`${nMsg} mensagem(s)`);
        msg.textContent = parts.length ? `Alterações pendentes: ${parts.join(' e ')}` : 'Alterações pendentes';
      }
    },

    _hideSaveBar() {
      const bar = document.getElementById('chatbot-save-bar');
      if (bar) bar.style.display = 'none';
    },

    // ─── Modal de conexão ─────────────────────────────────────────────────────
    async _openQRModal() {
      const modal = document.getElementById('modal-wa-qr');
      if (!modal) return;
      modal.style.display = 'flex';
      _modalOpen = true;
      this._switchModalMode(_modalMode);   // aplica modo atual (phone por padrão)
      this._startStatusPoll(2_000);
    },

    _switchModalMode(mode) {
      _modalMode = mode;
      // Atualiza botões de aba
      const btnPhone = document.getElementById('btn-mode-phone');
      const btnQr    = document.getElementById('btn-mode-qr');
      if (btnPhone && btnQr) {
        const activeStyle   = 'background:#25d366;color:#fff;border-color:#25d366;';
        const inactiveStyle = 'background:#fff;color:#6b7280;border-color:#d1d5db;';
        btnPhone.style.cssText += mode === 'phone' ? activeStyle : inactiveStyle;
        btnQr.style.cssText    += mode === 'qr'    ? activeStyle : inactiveStyle;
      }
      // Mostra/esconde áreas
      const phoneArea = document.getElementById('phone-area');
      const qrArea    = document.getElementById('qr-area');
      if (phoneArea) phoneArea.style.display = mode === 'phone' ? 'block' : 'none';
      if (qrArea)    qrArea.style.display    = mode === 'qr'    ? 'block' : 'none';

      // Para timers do outro modo
      clearTimeout(_qrTimer);
      clearTimeout(_pairTimer);

      if (mode === 'qr') {
        this._startQRFlow();
      }
      // Modo phone: aguarda usuário digitar número e clicar "Gerar Código"
    },

    async _startQRFlow() {
      const { status, isInitializing } = _waStatus;
      if (status !== 'connected' && status !== 'connecting' && status !== 'reconnecting' && !isInitializing) {
        try {
          await apiFetch('/api/chatbot-whatsapp/connect', { method: 'POST', body: {} });
        } catch (err) {
          console.error('[ChatbotManager] connect error:', err.message);
        }
      }
      this._fetchAndShowQR();
    },

    // Gera código via número de telefone
    async _doGenPairingCode() {
      const input = document.getElementById('wa-phone-input');
      const phone = input?.value.trim().replace(/\D/g, '');
      if (!phone || phone.length < 8) {
        this._showToast('❌ Digite o número completo com DDI (ex: 5511999999999)', true);
        return;
      }
      const btn = document.getElementById('btn-gen-code');
      if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

      // Mostra spinner enquanto aguarda
      const display  = document.getElementById('pairing-code-display');
      const spinner  = document.getElementById('pairing-spinner');
      if (display) display.style.display = 'none';
      if (spinner) spinner.style.display = 'block';

      try {
        await apiFetch('/api/chatbot-whatsapp/connect', { method: 'POST', body: { phone } });
      } catch (err) {
        console.error('[ChatbotManager] connect error:', err.message);
      }

      if (btn) { btn.disabled = false; btn.textContent = 'Gerar Código'; }
      this._fetchAndShowPairingCode();
    },

    async _fetchAndShowPairingCode() {
      clearTimeout(_pairTimer);
      if (!_modalOpen || _modalMode !== 'phone') return;
      try {
        const res  = await apiFetch('/api/chatbot-whatsapp/pairing-code');
        const data = await res.json();
        if (res.ok && data.code) {
          const display  = document.getElementById('pairing-code-display');
          const codeEl   = document.getElementById('pairing-code-text');
          const spinner  = document.getElementById('pairing-spinner');
          if (spinner) spinner.style.display = 'none';
          if (codeEl)  codeEl.textContent = data.code;
          if (display) display.style.display = 'block';
          return; // código exibido — polling de status cuidará do fechamento quando conectar
        }
      } catch (err) {
        console.error('[ChatbotManager] pairing-code fetch error:', err.message);
      }
      // Ainda sem código — tentar de novo em 2s
      _pairTimer = setTimeout(() => this._fetchAndShowPairingCode(), 2_000);
    },

    _closeQRModal() {
      const modal = document.getElementById('modal-wa-qr');
      if (modal) modal.style.display = 'none';
      _modalOpen = false;
      clearTimeout(_qrTimer);
      clearTimeout(_pairTimer);
      this._startStatusPoll(4_000);
    },

    async _fetchAndShowQR() {
      clearTimeout(_qrTimer);
      if (!_modalOpen) return;
      try {
        const res  = await apiFetch('/api/chatbot-whatsapp/qr');
        const data = await res.json();

        if (data.connected) { this._closeQRModal(); await this._refreshStatus(); return; }

        const img     = document.getElementById('qr-img');
        const spinner = document.getElementById('qr-spinner');

        if (data.qr) {
          if (img && spinner) { img.src = data.qr; img.style.display = 'block'; spinner.style.display = 'none'; }
        } else {
          if (img) img.style.display = 'none';
          if (spinner) {
            if (_waStatus.status === 'disconnected') {
              spinner.innerHTML = `
                <div style="text-align:center;color:#6b7280;">
                  <div style="font-size:1.5rem;margin-bottom:0.5rem;">⏳</div>
                  <div style="font-size:0.85rem;margin-bottom:0.75rem;">QR Code expirou.</div>
                  <button id="btn-qr-retry" style="background:#25d366;color:#fff;border:none;border-radius:8px;
                    padding:0.5rem 1.2rem;font-weight:700;cursor:pointer;font-size:0.9rem;">
                    🔄 Gerar novo QR
                  </button>
                </div>`;
              spinner.style.display = 'block';
              document.getElementById('btn-qr-retry')?.addEventListener('click', async () => {
                spinner.innerHTML = '<div style="font-size:2rem;margin-bottom:0.5rem;">⏳</div><div>Gerando...</div>';
                await apiFetch('/api/chatbot-whatsapp/connect', { method: 'POST', body: {} });
                this._fetchAndShowQR();
              });
              return;
            } else {
              spinner.innerHTML = '<div style="font-size:2rem;margin-bottom:0.5rem;">⏳</div><div style="font-size:0.85rem;">Aguardando QR...</div>';
              spinner.style.display = 'block';
            }
          }
        }
      } catch (err) {
        console.error('[ChatbotManager] QR fetch error:', err.message);
      }
      _qrTimer = setTimeout(() => this._fetchAndShowQR(), 3_000);
    },

    // ─── Status polling ───────────────────────────────────────────────────────
    _startStatusPoll(interval) {
      clearInterval(_pollTimer);
      _pollTimer = setInterval(() => this._refreshStatus(), interval);
    },

    async _refreshStatus() {
      try {
        const res  = await apiFetch('/api/chatbot-whatsapp/status');
        if (!res.ok) return;
        const data = await res.json();
        const wasConnected = _waStatus.status === 'connected';
        _waStatus = data;

        const card = document.getElementById('wa-connection-card');
        if (card) {
          card.innerHTML = this._renderConnectionCard(data);
          this._bindConnectionButtons();
        }
        this._updateMasterToggle();

        if (!wasConnected && data.status === 'connected' && _modalOpen) {
          this._closeQRModal();
          this._showToast('✅ WhatsApp conectado com sucesso!');
        }
      } catch (err) {
        console.error('[ChatbotManager] Status poll error:', err.message);
      }
    },

    _updateMasterToggle() {
      const isConnected = _waStatus.status === 'connected';
      const isAtivo     = !!_config.ativo;
      const sw  = document.querySelector('.cb-switch[data-field="ativo"]');
      const lbl = document.getElementById('lbl-ativo');
      if (!sw || !lbl) return;
      sw.classList.toggle('cb-on', isAtivo && isConnected);
      sw.style.opacity = isConnected ? '1' : '0.45';
      sw.style.cursor  = isConnected ? 'pointer' : 'not-allowed';
      lbl.textContent  = isConnected
        ? (isAtivo ? '🟢 Chatbot Ativo' : '⭕ Chatbot Inativo')
        : '🔌 Sem conexão WhatsApp';
    },

    // ─── Send test ────────────────────────────────────────────────────────────
    async _doSendTest() {
      const input = document.getElementById('send-test-phone');
      const phone = input?.value.trim();
      if (!phone || phone.replace(/\D/g,'').length < 8) {
        this._showToast('❌ Digite um número válido com DDI (ex: 5511999999999)', true);
        return;
      }
      const btn = document.getElementById('btn-wa-send-test-go');
      if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
      try {
        const res  = await apiFetch('/api/chatbot-whatsapp/send-test', { method: 'POST', body: { phone } });
        const data = await res.json();
        if (res.ok && data.success) {
          this._showToast(`✅ Mensagem enviada para ${phone}!`);
          const row = document.getElementById('send-test-row');
          if (row) row.style.display = 'none';
        } else {
          this._showToast('❌ ' + (data.error || 'Falha no envio'), true);
        }
      } catch (err) {
        this._showToast('❌ Erro: ' + err.message, true);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
      }
    },

    // ─── Disconnect ───────────────────────────────────────────────────────────
    async _doDisconnect() {
      if (!confirm('Deseja desconectar o WhatsApp? O chatbot ficará inativo.')) return;
      try {
        const res = await apiFetch('/api/chatbot-whatsapp/disconnect', { method: 'POST', body: {} });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _waStatus = { status: 'disconnected', phone: null };
        const card = document.getElementById('wa-connection-card');
        if (card) { card.innerHTML = this._renderConnectionCard(_waStatus); this._bindConnectionButtons(); }
        this._updateMasterToggle();
        this._showToast('✅ WhatsApp desconectado.');
      } catch (err) {
        this._showToast('❌ Erro ao desconectar: ' + err.message, true);
      }
    },

    // ─── Toast ────────────────────────────────────────────────────────────────
    _showToast(msg, isError = false) {
      const t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = `
        position:fixed;bottom:2rem;right:2rem;z-index:999999;
        background:${isError ? '#dc2626' : '#16a34a'};color:#fff;
        padding:0.9rem 1.5rem;border-radius:12px;font-weight:700;
        box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:0.95rem;
        max-width:380px;word-break:break-word;
      `;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 4_000);
    },
  };

  // ─── Escape HTML para textarea ────────────────────────────────────────────
  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
