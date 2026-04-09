/**
 * services/whatsappBot.js
 * Serviço de Chatbot WhatsApp — integração base com Meta Cloud API
 */

const { query } = require('../db/connection');

// ─── Enviar mensagem via Meta Cloud API ────────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  const cfg = await getWhatsAppConfig();
  if (!cfg || !cfg.phone_number_id || !cfg.access_token) {
    console.warn('[WhatsAppBot] sendWhatsAppMessage: config incompleta — mensagem não enviada.');
    return null;
  }

  const url = `https://graph.facebook.com/v18.0/${cfg.phone_number_id}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: to.replace(/\D/g, ''), // só dígitos
    type: 'text',
    text: { body: text },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[WhatsAppBot] Erro ao enviar mensagem:', data);
      return null;
    }
    console.log(`[WhatsAppBot] ✅ Mensagem enviada para ${to}`);
    return data;
  } catch (err) {
    console.error('[WhatsAppBot] Falha de rede ao enviar mensagem:', err.message);
    return null;
  }
}

// ─── Buscar configuração do WhatsApp ──────────────────────────────────────────
async function getWhatsAppConfig() {
  try {
    const { rows } = await query('SELECT * FROM whatsapp_config LIMIT 1');
    return rows[0] || null;
  } catch (err) {
    console.error('[WhatsAppBot] Erro ao buscar whatsapp_config:', err.message);
    return null;
  }
}

// ─── Buscar config do chatbot ──────────────────────────────────────────────────
async function getChatbotConfig() {
  try {
    const { rows } = await query('SELECT * FROM chatbot_whatsapp_config LIMIT 1');
    return rows[0] || null;
  } catch (err) {
    console.error('[WhatsAppBot] Erro ao buscar chatbot_whatsapp_config:', err.message);
    return null;
  }
}

// ─── Buscar configurações da loja ─────────────────────────────────────────────
async function getStoreSettings() {
  try {
    const { rows } = await query('SELECT * FROM configuracoes LIMIT 1');
    return rows[0] || {};
  } catch {
    return {};
  }
}

// ─── Processar mensagem recebida ──────────────────────────────────────────────
async function handleIncomingMessage(message) {
  const bot = await getChatbotConfig();
  if (!bot || !bot.ativo) {
    console.log('[WhatsAppBot] Chatbot inativo — mensagem ignorada.');
    return;
  }

  const from = message.from;  // número do remetente
  const msgText = (message.text?.body || '').toLowerCase().trim();
  const store = await getStoreSettings();
  const nomeLoja = store.nome_loja || 'nossa loja';

  console.log(`[WhatsAppBot] 📨 Mensagem de ${from}: "${msgText}"`);

  // ─── Lógica de regras simples ─────────────────────────────────────────────

  // Detectar horário de atendimento
  const agora = new Date();
  const hora = agora.getHours();
  const dentroHorario = hora >= 11 && hora < 23; // 11h-23h (padrão)

  if (!dentroHorario && bot.ausencia) {
    await sendWhatsAppMessage(from,
      `Olá! 🌙 Estamos fora do horário de atendimento.\n` +
      `Nosso horário é das 11h às 23h.\n` +
      `Em breve retornaremos! — ${nomeLoja} 🍔`
    );
    return;
  }

  // Primeira mensagem / saudação
  const gatilhosSaudacao = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi'];
  if (bot.boas_vindas && (gatilhosSaudacao.some(g => msgText.startsWith(g)) || msgText.length < 3)) {
    await sendWhatsAppMessage(from,
      `Olá! 👋 Bem-vindo(a) ao ${nomeLoja}!\n\n` +
      `Estou aqui para te ajudar. Veja o que posso fazer:\n` +
      `📦 *pedido* — Ver cardápio e fazer pedido\n` +
      `🕐 *horarios* — Ver horários de funcionamento\n` +
      `📍 *info* — Informações sobre nós\n` +
      `🎁 *promocoes* — Ver promoções do dia\n\n` +
      `Como posso te ajudar? 😊`
    );
    return;
  }

  // Cardápio / fazer pedido
  if (bot.fazer_pedido && (msgText.includes('pedido') || msgText.includes('cardapio') || msgText.includes('cardápio') || msgText.includes('menu') || msgText.includes('quero'))) {
    await sendWhatsAppMessage(from,
      `🍔 *Cardápio ${nomeLoja}*\n\n` +
      `Acesse nosso cardápio online e faça seu pedido:\n` +
      `👉 ${store.url_loja || 'https://pitombolanches.com/cardapio'}\n\n` +
      `Ou me diga o que deseja e vou te ajudar! 😊`
    );
    return;
  }

  // Horários
  if (bot.horarios && (msgText.includes('horario') || msgText.includes('horário') || msgText.includes('hora') || msgText.includes('funciona'))) {
    await sendWhatsAppMessage(from,
      `🕐 *Horários de Atendimento*\n\n` +
      `${store.horario_atendimento || 'Segunda a Domingo: 11h às 23h'}\n\n` +
      `Estamos te esperando! 🍕`
    );
    return;
  }

  // Informações
  if (bot.solicitar_info && (msgText.includes('info') || msgText.includes('endereço') || msgText.includes('endereco') || msgText.includes('onde') || msgText.includes('localizacao') || msgText.includes('localização'))) {
    await sendWhatsAppMessage(from,
      `📍 *${nomeLoja}*\n\n` +
      `${store.endereco || 'Endereço não configurado'}\n` +
      `📞 ${store.telefone || 'Não informado'}\n` +
      `🌐 ${store.url_loja || ''}\n\n` +
      `Ficamos felizes em te receber! 😊`
    );
    return;
  }

  // Promoções
  if (bot.promocoes && (msgText.includes('promo') || msgText.includes('desconto') || msgText.includes('oferta') || msgText.includes('especial'))) {
    await sendWhatsAppMessage(from,
      `🎁 *Promoções de hoje no ${nomeLoja}*\n\n` +
      `Fique de olho no nosso cardápio para ver as ofertas especiais:\n` +
      `👉 ${store.url_loja || 'https://pitombolanches.com/cardapio'}\n\n` +
      `Aproveite! 🔥`
    );
    return;
  }

  // Fallback — resposta padrão
  await sendWhatsAppMessage(from,
    `Obrigado pela mensagem! 😊\n\n` +
    `Para ver nosso cardápio: ${store.url_loja || 'https://pitombolanches.com/cardapio'}\n\n` +
    `Em breve um atendente irá te responder. — ${nomeLoja}`
  );
}

// ─── Notificar cliente sobre mudança de status do pedido ─────────────────────
async function notificarStatusPedido(pedido, novoStatus) {
  const bot = await getChatbotConfig();
  if (!bot || !bot.ativo) return;

  const telefone = pedido.telefone;
  if (!telefone || telefone.trim().length < 8) {
    console.log('[WhatsAppBot] notificarStatusPedido: telefone inválido, pulando.');
    return;
  }

  const store = await getStoreSettings();
  const nomePedido = `*Pedido #${pedido.id}*`;
  const nomeCliente = pedido.cliente || 'Cliente';

  const mensagens = {
    em_preparo: bot.pedido_aceito ? `✅ ${nomePedido} foi *aceito* e está sendo preparado!\n👨‍🍳 Nossa cozinha já está trabalhando no seu pedido.\n\n— ${store.nome_loja || 'Pitombo Lanches'}` : null,
    pronto:     bot.pedido_pronto ? `🔔 ${nomePedido} está *pronto*!\n${pedido.tipo === 'delivery' ? '🛵 Seu entregador vai buscá-lo em breve.' : '📍 Pode retirar no balcão!'}\n\n— ${store.nome_loja || 'Pitombo Lanches'}` : null,
    em_entrega: bot.pedido_a_caminho ? `🛵 ${nomePedido} saiu para entrega!\n⏱️ Estará na sua porta em breve.\n\n— ${store.nome_loja || 'Pitombo Lanches'}` : null,
    entregue:   bot.pedido_entregue ? `🎉 ${nomePedido} foi *entregue*!\nObrigado pela preferência, ${nomeCliente}! 😊\n\n— ${store.nome_loja || 'Pitombo Lanches'}` : null,
    cancelado:  bot.pedido_cancelado ? `❌ ${nomePedido} foi *cancelado*.\nSe tiver dúvidas, entre em contato conosco.\n\n— ${store.nome_loja || 'Pitombo Lanches'}` : null,
    rejeitado:  bot.pedido_cancelado ? `❌ ${nomePedido} não pôde ser aceito no momento.\nSentimos muito! Tente novamente mais tarde.\n\n— ${store.nome_loja || 'Pitombo Lanches'}` : null,
  };

  const msg = mensagens[novoStatus];
  if (!msg) return;

  console.log(`[WhatsAppBot] 📤 Notificando ${telefone} sobre status: ${novoStatus}`);
  await sendWhatsAppMessage(telefone, msg);
}

module.exports = {
  sendWhatsAppMessage,
  handleIncomingMessage,
  notificarStatusPedido,
  getWhatsAppConfig,
  getChatbotConfig,
};
