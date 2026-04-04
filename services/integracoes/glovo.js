// Arquivo: services/integracoes/glovo.js

function connect(credentials = {}) {
    console.log('[Glovo] Conectando com credenciais...');
    return { ok: true, status: 'connected' };
}

function disconnect() {
    console.log('[Glovo] Desconectando...');
    return { ok: true, status: 'disconnected' };
}

function formatOrder(data) {
    console.log('[Glovo] Formatando pedido para o Pitombo...');
    return {
        origem: 'GLOVO',
        cliente: data.customer?.name || 'Cliente Glovo',
        itens: data.products || [],
        total: data.total_amount || 0,
        status: 'recebido'
    };
}

function handleWebhook(data) {
    console.log('[Glovo] Webhook recebido!');
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
