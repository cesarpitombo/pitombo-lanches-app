/**
 * routes/chatbot.js
 * API para configuração do Chatbot WhatsApp + Webhook Meta Cloud API
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const { handleIncomingMessage } = require('../services/whatsappBot');

const ADMIN_MANAGER = ['Admin', 'Manager'];

// ─── Auto-migrate: criar tabelas se não existirem ─────────────────────────────
(async () => {
  try {
    // Tabela de configuração do chatbot
    await query(`
      CREATE TABLE IF NOT EXISTS chatbot_whatsapp_config (
        id                          SERIAL PRIMARY KEY,
        loja_id                     INTEGER DEFAULT 1,
        ativo                       BOOLEAN DEFAULT FALSE,
        -- Respostas automáticas
        boas_vindas                 BOOLEAN DEFAULT TRUE,
        ausencia                    BOOLEAN DEFAULT TRUE,
        fazer_pedido                BOOLEAN DEFAULT TRUE,
        promocoes                   BOOLEAN DEFAULT FALSE,
        solicitar_info              BOOLEAN DEFAULT TRUE,
        horarios                    BOOLEAN DEFAULT TRUE,
        -- Recuperação de vendas
        carrinho_abandonado         BOOLEAN DEFAULT FALSE,
        desconto_novos_clientes     BOOLEAN DEFAULT FALSE,
        -- Avaliações
        solicitar_avaliacao         BOOLEAN DEFAULT FALSE,
        -- Fidelidade
        programa_fidelidade         BOOLEAN DEFAULT FALSE,
        -- Status do pedido
        pedido_recebido             BOOLEAN DEFAULT TRUE,
        pedido_aceito               BOOLEAN DEFAULT TRUE,
        pedido_preparo              BOOLEAN DEFAULT TRUE,
        pedido_pronto               BOOLEAN DEFAULT TRUE,
        pedido_a_caminho            BOOLEAN DEFAULT TRUE,
        pedido_entregue             BOOLEAN DEFAULT TRUE,
        pedido_finalizado           BOOLEAN DEFAULT TRUE,
        pedido_cancelado            BOOLEAN DEFAULT TRUE,
        resumo_pedido               BOOLEAN DEFAULT FALSE,
        solicitar_confirmacao       BOOLEAN DEFAULT FALSE,
        -- Entregador
        notificar_entregador_auto   BOOLEAN DEFAULT FALSE,
        created_at                  TIMESTAMPTZ DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Tabela de configuração da conexão WhatsApp (Meta Cloud API)
    await query(`
      CREATE TABLE IF NOT EXISTS whatsapp_config (
        id                    SERIAL PRIMARY KEY,
        phone_number_id       VARCHAR(100),
        business_account_id   VARCHAR(100),
        access_token          TEXT,
        webhook_verify_token  VARCHAR(255) DEFAULT 'pitombo_webhook_2024',
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Garantir que existe pelo menos 1 row padrão em cada tabela
    const { rows: cbRows } = await query('SELECT id FROM chatbot_whatsapp_config LIMIT 1');
    if (cbRows.length === 0) {
      await query('INSERT INTO chatbot_whatsapp_config (loja_id) VALUES (1)');
    }

    const { rows: waRows } = await query('SELECT id FROM whatsapp_config LIMIT 1');
    if (waRows.length === 0) {
      await query('INSERT INTO whatsapp_config (webhook_verify_token) VALUES ($1)', ['pitombo_webhook_2024']);
    }

    console.log('✅ chatbot_whatsapp_config + whatsapp_config: tabelas verificadas.');
  } catch (e) {
    console.error('⚠️ Migration chatbot/whatsapp:', e.message);
  }
})();

// ─── GET /api/chatbot-whatsapp ─────────────────────────────────────────────────
router.get('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const { rows: botRows } = await query('SELECT * FROM chatbot_whatsapp_config LIMIT 1');
    const { rows: waRows }  = await query(
      'SELECT id, phone_number_id, business_account_id, webhook_verify_token, (access_token IS NOT NULL AND access_token != \'\') AS has_token FROM whatsapp_config LIMIT 1'
    );

    res.json({
      chatbot: botRows[0] || {},
      whatsapp: waRows[0] || {},   // access_token NUNCA é exposto no GET
    });
  } catch (err) {
    console.error('[ChatbotAPI] GET:', err.message);
    res.status(500).json({ error: 'Erro ao buscar configurações do chatbot' });
  }
});

// ─── PUT /api/chatbot-whatsapp ─────────────────────────────────────────────────
router.put('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const body = req.body;

    const boolFields = [
      'ativo', 'boas_vindas', 'ausencia', 'fazer_pedido', 'promocoes',
      'solicitar_info', 'horarios', 'carrinho_abandonado', 'desconto_novos_clientes',
      'solicitar_avaliacao', 'programa_fidelidade', 'pedido_recebido', 'pedido_aceito',
      'pedido_preparo', 'pedido_pronto', 'pedido_a_caminho', 'pedido_entregue',
      'pedido_finalizado', 'pedido_cancelado', 'resumo_pedido', 'solicitar_confirmacao',
      'notificar_entregador_auto',
    ];

    const setClauses = boolFields
      .filter(f => f in body)
      .map((f, i) => `${f} = $${i + 1}`)
      .join(', ');

    const values = boolFields
      .filter(f => f in body)
      .map(f => Boolean(body[f]));

    if (values.length > 0) {
      values.push(new Date()); // updated_at
      const { rows } = await query(
        `UPDATE chatbot_whatsapp_config SET ${setClauses}, updated_at = $${values.length} WHERE id = (SELECT id FROM chatbot_whatsapp_config LIMIT 1) RETURNING *`,
        values
      );

      // Atualizar config WhatsApp se enviado
      if (body.whatsapp) {
        const wa = body.whatsapp;
        await query(
          `UPDATE whatsapp_config SET
            phone_number_id     = COALESCE(NULLIF($1, ''), phone_number_id),
            business_account_id = COALESCE(NULLIF($2, ''), business_account_id),
            access_token        = COALESCE(NULLIF($3, ''), access_token),
            webhook_verify_token = COALESCE(NULLIF($4, ''), webhook_verify_token),
            updated_at = NOW()
          WHERE id = (SELECT id FROM whatsapp_config LIMIT 1)`,
          [wa.phone_number_id || '', wa.business_account_id || '', wa.access_token || '', wa.webhook_verify_token || '']
        );
      }


      return res.json({ success: true, chatbot: rows[0] });
    }

    // Se body.whatsapp apenas (sem flags de chatbot)
    if (body.whatsapp) {
      const wa = body.whatsapp;
      // NULLIF: string vazia → NULL → COALESCE mantém valor existente
      await query(
        `UPDATE whatsapp_config SET
          phone_number_id     = COALESCE(NULLIF($1, ''), phone_number_id),
          business_account_id = COALESCE(NULLIF($2, ''), business_account_id),
          access_token        = COALESCE(NULLIF($3, ''), access_token),
          webhook_verify_token = COALESCE(NULLIF($4, ''), webhook_verify_token),
          updated_at = NOW()
        WHERE id = (SELECT id FROM whatsapp_config LIMIT 1)`,
        [wa.phone_number_id || '', wa.business_account_id || '', wa.access_token || '', wa.webhook_verify_token || '']
      );
      console.log('[ChatbotAPI] WhatsApp config atualizada:', { phone: wa.phone_number_id, hasToken: !!wa.access_token });
      return res.json({ success: true });
    }

    res.json({ success: true, message: 'Nenhuma field atualizada.' });
  } catch (err) {
    console.error('[ChatbotAPI] PUT:', err.message);
    res.status(500).json({ error: 'Erro ao salvar configurações do chatbot' });
  }
});

// ─── POST /api/chatbot-whatsapp/test-send ─────────────────────────────────────
router.post('/test-send', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Número de telefone inválido.' });
  }

  try {
    const { rows } = await query('SELECT phone_number_id, access_token FROM whatsapp_config LIMIT 1');
    const cfg = rows[0];
    if (!cfg || !cfg.phone_number_id || !cfg.access_token) {
      return res.status(400).json({ error: 'Credenciais WhatsApp não configuradas. Salve o Phone Number ID e o Access Token primeiro.' });
    }

    const url = `https://graph.facebook.com/v18.0/${cfg.phone_number_id}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: phone.replace(/\D/g, ''),
      type: 'text',
      text: { body: '🤖 Mensagem de teste do Pitombo Lanches! Chatbot configurado com sucesso. ✅' },
    };

    const fetchRes = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await fetchRes.json();

    if (!fetchRes.ok) {
      console.error('[ChatbotAPI] test-send Meta error:', data);
      const metaError = data?.error?.message || JSON.stringify(data);
      return res.status(400).json({ error: `Meta API: ${metaError}` });
    }

    console.log('[ChatbotAPI] ✅ Mensagem de teste enviada para', phone);
    res.json({ success: true, messageId: data.messages?.[0]?.id });
  } catch (err) {
    console.error('[ChatbotAPI] test-send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/chatbot-whatsapp/webhook (verificação Meta) ─────────────────────
router.get('/webhook', async (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  try {
    const { rows } = await query('SELECT webhook_verify_token FROM whatsapp_config LIMIT 1');
    const savedToken = rows[0]?.webhook_verify_token || 'pitombo_webhook_2024';

    if (mode === 'subscribe' && token === savedToken) {
      console.log('[WhatsApp Webhook] ✅ Webhook verificado pela Meta!');
      return res.status(200).send(challenge);
    }
    console.warn('[WhatsApp Webhook] ⚠️ Token inválido:', token, '≠', savedToken);
    res.sendStatus(403);
  } catch (err) {
    console.error('[WhatsApp Webhook] Erro na verificação:', err.message);
    res.sendStatus(500);
  }
});

// ─── POST /api/chatbot-whatsapp/webhook (receber mensagens) ───────────────────
router.post('/webhook', async (req, res) => {
  // Responder 200 imediatamente (requisito Meta)
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return;

    for (const message of messages) {
      console.log('[WhatsApp Webhook] 📨 Mensagem recebida:', JSON.stringify(message));
      // Processar em background sem bloquear a resposta
      handleIncomingMessage(message).catch(err =>
        console.error('[WhatsApp Webhook] Erro ao processar mensagem:', err.message)
      );
    }
  } catch (err) {
    console.error('[WhatsApp Webhook] Erro ao processar evento:', err.message);
  }
});

module.exports = router;
