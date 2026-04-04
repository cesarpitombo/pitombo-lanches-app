// Arquivo: services/integracoes/bolt.js

function connect(credentials = {}) {
    console.log('[Bolt Food] Conectando com credenciais...');
    return { ok: true, status: 'connected' };
}

function disconnect() {
    console.log('[Bolt Food] Desconectando...');
    return { ok: true, status: 'disconnected' };
}

function formatOrder(data) {
    console.log('[Bolt Food] Formatando pedido para o Pitombo...');
    return {
        origem: 'BOLTFOOD',
        cliente: data.user_name || 'Cliente Bolt',
        itens: data.order_items || [],
        total: data.total_price || 0,
        status: 'recebido'
    };
}

function handleWebhook(data) {
    console.log('[Bolt Food] Webhook recebido!');
    const pedidoPadronizado = formatOrder(data);
    // Aqui seria salvo no banco de dados e notificado à cozinha
    return { ok: true, data: pedidoPadronizado };
}

module.exports = {
    connect,
    disconnect,
    handleWebhook,
    formatOrder
};
