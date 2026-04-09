/**
 * admin-chatbot.js
 * Módulo de Chatbot WhatsApp para o painel admin
 */

(function () {
  'use strict';

  // Estado local
  let _config = {};
  let _waCfg  = {};       // { phone_number_id, business_account_id, webhook_verify_token, has_token }
  let _saveTimer = null;

  // ─── Inicialização ────────────────────────────────────────────────────────
  window.ChatbotManager = {
    async init() {
      console.log('🤖 ChatbotManager: inicializando...');
      await this.load();
      this.render();
      this.setupEvents();
    },

    async load() {
      try {
        const res = await apiFetch('/api/chatbot-whatsapp');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        _config = data.chatbot || {};
        _waCfg  = data.whatsapp || {};
        console.log('🤖 ChatbotManager: config carregada', { chatbot: _config, whatsapp: _waCfg });
      } catch (err) {
        console.error('ChatbotManager load error:', err.message);
        _config = {};
        _waCfg  = {};
      }
    },

    render() {
      const section = document.getElementById('chatbot-whatsapp');
      if (!section) return;

      const isAtivo   = !!_config.ativo;
      const hasToken  = !!_waCfg.has_token;
      const hasPhone  = !!_waCfg.phone_number_id;
      const isConfigured = hasToken && hasPhone;

      section.innerHTML = `
        <div class="chatbot-page">

          <!-- HERO HEADER -->
          <div class="chatbot-hero">
            <div class="chatbot-hero-info">
              <div class="chatbot-hero-icon">💬</div>
              <div>
                <h2 class="chatbot-hero-title">Chatbot do WhatsApp</h2>
                <p class="chatbot-hero-subtitle">Responda automaticamente os clientes pelo WhatsApp e envie atualizações de pedidos em tempo real.</p>
              </div>
            </div>
            <div class="chatbot-master-toggle">
              <label class="cb-switch-wrap">
                <span class="cb-switch-label" id="lbl-ativo">${isAtivo ? '🟢 Chatbot Ativo' : '⭕ Chatbot Inativo'}</span>
                <div class="cb-switch ${isAtivo ? 'cb-on' : ''}" data-field="ativo">
                  <div class="cb-knob"></div>
                </div>
              </label>
            </div>
          </div>

          <!-- BANNER: credenciais não configuradas -->
          ${!isConfigured ? `
          <div class="chatbot-alert-banner">
            ⚠️ <strong>Credenciais da Meta não configuradas.</strong>
            Preencha o Phone Number ID e o Access Token abaixo para ativar o envio real de mensagens.
            <a href="#wa-credentials-card" onclick="document.getElementById('wa-credentials-card').scrollIntoView({behavior:'smooth'})">Ir para configuração →</a>
          </div>
          ` : `
          <div class="chatbot-alert-banner chatbot-alert-banner--ok">
            ✅ <strong>WhatsApp configurado.</strong>
            Phone: <code>${_waCfg.phone_number_id}</code> · Token: <code>••••••••••••</code>
          </div>
          `}

          <div class="chatbot-body">
            <!-- COLUNA ESQUERDA: Configurações -->
            <div class="chatbot-col-left">

              <!-- ═══ SEÇÃO CREDENCIAIS — primeiro e destacado ═══ -->
              <div class="chatbot-card chatbot-card--connection" id="wa-credentials-card">
                <div class="chatbot-card-header">
                  <h3>🔗 Credenciais da Meta Cloud API</h3>
                  <p class="chatbot-card-desc">Configure aqui para habilitar o envio e recebimento real de mensagens WhatsApp.</p>
                </div>

                <div class="wa-status-row">
                  <div class="wa-status-item ${hasPhone ? 'ok' : 'missing'}">
                    ${hasPhone ? '✅' : '❌'} Phone Number ID
                  </div>
                  <div class="wa-status-item ${hasToken ? 'ok' : 'missing'}">
                    ${hasToken ? '✅' : '❌'} Access Token
                  </div>
                  <div class="wa-status-item ok">
                    ✅ Verify Token
                  </div>
                </div>

                <div class="chatbot-form-grid">
                  <div class="chatbot-form-field chatbot-form-field--full">
                    <label>📱 Phone Number ID <span class="wa-required">*obrigatório</span></label>
                    <input type="text" id="wa-phone-number-id"
                      placeholder="Ex: 123456789012345"
                      value="${_waCfg.phone_number_id || ''}"
                      autocomplete="off">
                    <small>Encontrado em Meta Business Manager → WhatsApp → Configuration</small>
                  </div>

                  <div class="chatbot-form-field chatbot-form-field--full">
                    <label>🔑 Access Token Permanente <span class="wa-required">*obrigatório</span></label>
                    <div class="wa-token-row">
                      <input type="password" id="wa-access-token"
                        placeholder="${hasToken ? 'Token salvo — cole um novo para substituir' : 'EAAxxxxxxxxxxxxxx...'}"
                        autocomplete="new-password">
                      <button type="button" class="wa-btn-eye" id="btn-toggle-token" title="Mostrar/ocultar">👁</button>
                    </div>
                    ${hasToken
                      ? '<small class="wa-token-saved">🔒 Token já configurado. Deixe em branco para manter o atual.</small>'
                      : '<small>Token permanente do App Meta. Nunca compartilhe publicamente.</small>'
                    }
                  </div>

                  <div class="chatbot-form-field chatbot-form-field--full">
                    <label>🔐 Webhook Verify Token</label>
                    <input type="text" id="wa-verify-token"
                      placeholder="token_de_verificacao"
                      value="${_waCfg.webhook_verify_token || 'pitombo_webhook_2024'}"
                      autocomplete="off">
                    <small>Use este token ao registrar o webhook no painel da Meta.</small>
                  </div>

                  <div class="chatbot-form-field">
                    <label>🏢 Business Account ID <span style="color:#aaa;font-size:0.75rem;">(opcional)</span></label>
                    <input type="text" id="wa-business-account-id"
                      placeholder="Ex: 987654321098765"
                      value="${_waCfg.business_account_id || ''}"
                      autocomplete="off">
                  </div>
                </div>

                <div class="chatbot-webhook-box">
                  <strong>🌐 Configure no painel Meta (Developers):</strong>
                  <p>Webhook URL: <code id="webhook-full-url"></code></p>
                  <p>Verify Token: <strong id="verify-token-display">${_waCfg.webhook_verify_token || 'pitombo_webhook_2024'}</strong></p>
                  <p style="margin-top:0.5rem; font-size:0.75rem; color:#6b7280;">
                    Caminho: Meta → My Apps → Webhooks → WhatsApp → Subscribe → messages
                  </p>
                </div>

                <button class="chatbot-btn-save chatbot-btn-wa" id="btn-save-wa">
                  💾 Salvar Credenciais WhatsApp
                </button>

                <!-- Teste de envio -->
                <div class="wa-test-section" id="wa-test-section" style="${isConfigured ? '' : 'display:none'}">
                  <div class="wa-test-header">🧪 Testar envio de mensagem</div>
                  <div class="wa-test-row">
                    <input type="tel" id="wa-test-phone"
                      placeholder="5511999999999 (com código do país)"
                      style="flex:1; padding:0.65rem 0.85rem; border:1.5px solid #d1d5db; border-radius:8px; font-size:0.9rem; font-family:inherit;">
                    <button type="button" class="chatbot-btn-save" id="btn-test-send"
                      style="width:auto; padding:0.65rem 1.2rem; white-space:nowrap; background:#25d366;">
                      📤 Enviar teste
                    </button>
                  </div>
                  <div id="wa-test-result" style="margin-top:0.5rem; font-size:0.82rem; display:none;"></div>
                </div>
              </div>

              <!-- SEÇÃO: Respostas Automáticas -->
              <div class="chatbot-card">
                <div class="chatbot-card-header">
                  <h3>💬 Respostas Automáticas</h3>
                  <p class="chatbot-card-desc">O bot responde automaticamente quando os clientes enviam mensagens.</p>
                </div>
                ${this._toggleItem('boas_vindas', '👋 Mensagem de boas-vindas', 'Olá! Bem-vindo(a)! Como posso ajudar você hoje?')}
                ${this._toggleItem('ausencia', '🌙 Mensagem de ausência', 'Estamos fora do horário. Voltamos em breve!')}
                ${this._toggleItem('fazer_pedido', '📦 Instrução para fazer pedido', 'Acesse nosso cardápio e realize seu pedido pelo link.')}
                ${this._toggleItem('promocoes', '🎁 Promoções do dia', 'Confira nossas ofertas e promoções especiais!')}
                ${this._toggleItem('solicitar_info', '📍 Informações da loja', 'Endereço, telefone e redes sociais da loja.')}
                ${this._toggleItem('horarios', '🕐 Horários de atendimento', 'Informa o horário de funcionamento automaticamente.')}
              </div>

              <!-- SEÇÃO: Recuperador de Vendas -->
              <div class="chatbot-card">
                <div class="chatbot-card-header">
                  <h3>🔄 Recuperador de Vendas</h3>
                  <p class="chatbot-card-desc">Reconquiste clientes que não finalizaram o pedido.</p>
                </div>
                ${this._toggleItem('carrinho_abandonado', '🛒 Carrinho abandonado', 'Olá! Você deixou itens no carrinho. Posso te ajudar?')}
                ${this._toggleItem('desconto_novos_clientes', '🎉 Desconto para novos clientes', 'Bem-vindo! Use seu cupom de primeiro pedido.')}
              </div>

              <!-- SEÇÃO: Avaliações -->
              <div class="chatbot-card">
                <div class="chatbot-card-header">
                  <h3>⭐ Obtenha avaliações dos seus clientes</h3>
                  <p class="chatbot-card-desc">Peça feedback automaticamente após a entrega.</p>
                </div>
                ${this._toggleItem('solicitar_avaliacao', '⭐ Solicitar uma avaliação', 'Muito obrigado! Como foi sua experiência conosco? 😊')}
              </div>

              <!-- SEÇÃO: Fidelidade -->
              <div class="chatbot-card">
                <div class="chatbot-card-header">
                  <h3>🏆 Ative seu programa de fidelidade</h3>
                  <p class="chatbot-card-desc">Engaje clientes com recompensas e pontos.</p>
                </div>
                ${this._toggleItem('programa_fidelidade', '🎯 Mensagem do Programa de Fidelidade', 'Você acumulou pontos! Confira suas recompensas.')}
              </div>

              <!-- SEÇÃO: Status do Pedido -->
              <div class="chatbot-card">
                <div class="chatbot-card-header">
                  <h3>📱 Notificações de status do pedido</h3>
                  <p class="chatbot-card-desc">O cliente recebe notificações em tempo real pelo WhatsApp.</p>
                  <div class="chatbot-badge-safe">🔒 Mensagens geradas automaticamente, em conformidade com as políticas do Meta.</div>
                </div>
                ${this._toggleItem('pedido_recebido',   'Pedido recebido',   '✅ Seu pedido foi recebido!')}
                ${this._toggleItem('pedido_aceito',     'Pedido aceito',     '👨‍🍳 Seu pedido foi aceito e está sendo preparado!')}
                ${this._toggleItem('pedido_preparo',    'Pedido em preparo', '🍳 Seu pedido está sendo preparado!')}
                ${this._toggleItem('pedido_pronto',     'Pedido pronto',     '🔔 Seu pedido está pronto!')}
                ${this._toggleItem('pedido_a_caminho',  'Pedido a caminho',  '🛵 Seu pedido saiu para entrega!')}
                ${this._toggleItem('pedido_entregue',   'Pedido entregue',   '🎉 Pedido entregue! Obrigado!')}
                ${this._toggleItem('pedido_finalizado', 'Pedido finalizado', '✅ Pedido finalizado com sucesso!')}
                ${this._toggleItem('pedido_cancelado',  'Pedido cancelado',  '❌ Seu pedido foi cancelado.')}
                ${this._toggleItem('resumo_pedido',     'Resumo do pedido',  '📋 Resumo detalhado do pedido enviado.')}
                ${this._toggleItem('solicitar_confirmacao', 'Solicitar confirmação', '❓ Por favor, confirme seu pedido!')}
              </div>

              <!-- SEÇÃO: Entregador -->
              <div class="chatbot-card">
                <div class="chatbot-card-header">
                  <h3>🛵 Notifique seus Entregadores sobre cada entrega</h3>
                  <p class="chatbot-card-desc">Esta mensagem é enviada ao entregador quando um pedido é atribuído.</p>
                </div>
                ${this._toggleItem('notificar_entregador_auto', 'Atribuição automática de Pedido', 'Novo pedido atribuído a você! Confira os detalhes.')}
              </div>

            </div>

            <!-- COLUNA DIREITA: Painel informativo -->
            <div class="chatbot-col-right">
              <div class="chatbot-info-panel">
                <h3>🤖 Respostas automáticas com o Chatbot</h3>
                <p>Seu chatbot responde automaticamente quando os clientes escrevem pelo WhatsApp.</p>
                <ul class="chatbot-feature-list">
                  <li>✅ Mensagem de boas-vindas</li>
                  <li>✅ Mensagem de ausência</li>
                  <li>✅ Instrução para fazer pedido</li>
                  <li>✅ Mensagem de promoções</li>
                  <li>✅ Informações da loja</li>
                  <li>✅ Horários de atendimento</li>
                </ul>
              </div>

              <div class="chatbot-faq-panel">
                <h3>❓ Perguntas Frequentes</h3>
                ${this._faqItem('De onde pego o Phone Number ID?', 'No Meta Business Suite → Configurações → WhatsApp → Phone Numbers. O ID numérico aparece ao lado do número.')}
                ${this._faqItem('Como gerar o Access Token permanente?', 'Acesse developers.facebook.com → My Apps → seu app → WhatsApp → API Setup. Gere um token de sistema permanente e dê permissão whatsapp_business_messaging.')}
                ${this._faqItem('O que é o Webhook Verify Token?', 'É uma string aleatória que você define. Use o mesmo valor no campo "Verify Token" ao registrar o webhook no painel Meta.')}
                ${this._faqItem('Posso usar meu número atual?', 'Sim. Registre o número na Meta Cloud API e migre a linha. Não é necessário comprar outro número.')}
              </div>
            </div>
          </div>

          <div class="chatbot-save-bar" id="chatbot-save-bar" style="display:none;">
            <span>Alterações nos toggles não salvas</span>
            <button class="chatbot-btn-save" id="btn-salvar-chatbot">💾 Salvar configurações</button>
          </div>
        </div>
      `;

      this._updateWebhookUrls();
      this._setupTokenToggle();
    },

    _toggleItem(field, label, preview) {
      const isOn = !!_config[field];
      return `
        <div class="chatbot-toggle-item">
          <div class="chatbot-toggle-info">
            <div class="chatbot-toggle-label">${label}</div>
            <div class="chatbot-toggle-preview">${preview}</div>
          </div>
          <div class="cb-switch ${isOn ? 'cb-on' : ''}" data-field="${field}">
            <div class="cb-knob"></div>
          </div>
        </div>
      `;
    },

    _faqItem(q, a) {
      return `
        <div class="chatbot-faq-item">
          <div class="chatbot-faq-q" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'">
            📌 ${q}
          </div>
          <div class="chatbot-faq-a" style="display:none">${a}</div>
        </div>
      `;
    },

    _updateWebhookUrls() {
      const base = window.location.origin;
      const webhookUrl = `${base}/api/chatbot-whatsapp/webhook`;
      const elFull = document.getElementById('webhook-full-url');
      if (elFull) elFull.textContent = webhookUrl;
    },

    _setupTokenToggle() {
      const btnEye   = document.getElementById('btn-toggle-token');
      const inputTok = document.getElementById('wa-access-token');
      if (!btnEye || !inputTok) return;
      btnEye.addEventListener('click', () => {
        const isHidden = inputTok.type === 'password';
        inputTok.type = isHidden ? 'text' : 'password';
        btnEye.textContent = isHidden ? '🙈' : '👁';
      });
    },

    setupEvents() {
      const section = document.getElementById('chatbot-whatsapp');
      if (!section) return;

      // Toggles de configuração
      section.addEventListener('click', (e) => {
        const sw = e.target.closest('.cb-switch');
        if (!sw) return;
        const field = sw.dataset.field;
        if (!field) return;

        const isOn = sw.classList.contains('cb-on');
        sw.classList.toggle('cb-on', !isOn);
        _config[field] = !isOn;

        if (field === 'ativo') {
          const lbl = document.getElementById('lbl-ativo');
          if (lbl) lbl.textContent = !isOn ? '🟢 Chatbot Ativo' : '⭕ Chatbot Inativo';
        }

        this._scheduleSave();
      });

      // Salvar credenciais
      document.getElementById('btn-save-wa')?.addEventListener('click', () =>
        this._saveWhatsAppCredentials()
      );

      // Salvar toggles
      document.getElementById('btn-salvar-chatbot')?.addEventListener('click', () =>
        this._saveAll()
      );

      // Testar envio
      document.getElementById('btn-test-send')?.addEventListener('click', () =>
        this._testSend()
      );

      // Atualizar display do verify token em tempo real
      document.getElementById('wa-verify-token')?.addEventListener('input', (e) => {
        const el = document.getElementById('verify-token-display');
        if (el) el.textContent = e.target.value || 'pitombo_webhook_2024';
      });
    },

    _scheduleSave() {
      const bar = document.getElementById('chatbot-save-bar');
      if (bar) bar.style.display = 'flex';
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => this._saveAll(), 2000);
    },

    async _saveAll() {
      clearTimeout(_saveTimer);
      const btn = document.getElementById('btn-salvar-chatbot');
      const bar = document.getElementById('chatbot-save-bar');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Salvando...'; }

      try {
        const res = await apiFetch('/api/chatbot-whatsapp', {
          method: 'PUT',
          body: _config,
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (bar) bar.style.display = 'none';
        this._showToast('✅ Configurações salvas!');
      } catch (err) {
        console.error('ChatbotManager _saveAll error:', err.message);
        this._showToast('❌ Erro ao salvar. Tente novamente.', true);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar configurações'; }
      }
    },

    async _saveWhatsAppCredentials() {
      const phoneNumberId     = document.getElementById('wa-phone-number-id')?.value.trim();
      const businessAccountId = document.getElementById('wa-business-account-id')?.value.trim();
      const accessToken       = document.getElementById('wa-access-token')?.value.trim();
      const verifyToken       = document.getElementById('wa-verify-token')?.value.trim();

      // Validação mínima
      if (!phoneNumberId) {
        this._showToast('❌ Phone Number ID é obrigatório.', true);
        document.getElementById('wa-phone-number-id')?.focus();
        return;
      }

      const waCfg = {};
      if (phoneNumberId)                      waCfg.phone_number_id     = phoneNumberId;
      if (businessAccountId)                  waCfg.business_account_id = businessAccountId;
      if (accessToken)                        waCfg.access_token        = accessToken;   // enviamos qualquer valor não-vazio
      if (verifyToken)                        waCfg.webhook_verify_token = verifyToken;

      const btn = document.getElementById('btn-save-wa');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Salvando...'; }

      try {
        const res = await apiFetch('/api/chatbot-whatsapp', {
          method: 'PUT',
          body: { whatsapp: waCfg },
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);

        // Atualizar estado local
        if (phoneNumberId) _waCfg.phone_number_id = phoneNumberId;
        if (accessToken)   _waCfg.has_token = true;
        if (verifyToken)   _waCfg.webhook_verify_token = verifyToken;

        // Atualizar display token salvo
        const verifyDisplay = document.getElementById('verify-token-display');
        if (verifyDisplay && verifyToken) verifyDisplay.textContent = verifyToken;

        // Limpar campo do token (não exibir em texto claro)
        const tokenInput = document.getElementById('wa-access-token');
        if (tokenInput && accessToken) {
          tokenInput.value = '';
          tokenInput.type = 'password';
          tokenInput.placeholder = 'Token salvo — cole um novo para substituir';
          document.getElementById('btn-toggle-token').textContent = '👁';
          // Mostrar aviso de token salvo
          const small = tokenInput.nextElementSibling?.nextElementSibling || tokenInput.nextElementSibling;
          if (small && small.tagName === 'SMALL') {
            small.innerHTML = '🔒 Token salvo com sucesso!';
            small.className = 'wa-token-saved';
          }
        }

        // Mostrar área de teste se tiver phone + token
        const testSection = document.getElementById('wa-test-section');
        if (testSection && phoneNumberId) testSection.style.display = '';

        this._showToast('✅ Credenciais WhatsApp salvas!');
      } catch (err) {
        console.error('ChatbotManager _saveWhatsAppCredentials error:', err.message);
        this._showToast('❌ Erro ao salvar credenciais. Verifique e tente novamente.', true);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar Credenciais WhatsApp'; }
      }
    },

    async _testSend() {
      const phone  = document.getElementById('wa-test-phone')?.value.trim();
      const result = document.getElementById('wa-test-result');
      const btn    = document.getElementById('btn-test-send');

      if (!phone || phone.length < 10) {
        this._showToast('❌ Digite um número válido com código do país (ex: 5511999999999)', true);
        return;
      }

      if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }
      if (result) { result.style.display = 'none'; }

      try {
        const res = await apiFetch('/api/chatbot-whatsapp/test-send', {
          method: 'POST',
          body: { phone },
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (result) {
            result.style.display = 'block';
            result.style.color   = '#16a34a';
            result.textContent   = `✅ Mensagem enviada para ${phone}! Verifique o WhatsApp.`;
          }
          this._showToast('✅ Mensagem de teste enviada!');
        } else {
          throw new Error(data.error || 'Erro desconhecido');
        }
      } catch (err) {
        if (result) {
          result.style.display = 'block';
          result.style.color   = '#dc2626';
          result.textContent   = `❌ Falha: ${err.message}`;
        }
        this._showToast('❌ ' + err.message, true);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📤 Enviar teste'; }
      }
    },

    _showToast(msg, isError = false) {
      const t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = `
        position:fixed; bottom:2rem; right:2rem;
        background:${isError ? '#dc2626' : '#16a34a'};
        color:#fff; padding:0.9rem 1.5rem; border-radius:12px;
        font-weight:700; z-index:99999;
        box-shadow:0 4px 20px rgba(0,0,0,0.2);
        font-size:0.95rem; animation: slideInRight 0.3s ease;
      `;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 4000);
    },
  };

})();
