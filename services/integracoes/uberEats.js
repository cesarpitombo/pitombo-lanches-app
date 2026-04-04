// Arquivo: services/integracoes/uberEats.js

function connect(credentials = {}) {
    console.log('[UberEats] Conectando com credenciais...');
    return { ok: true, status: 'connected' };
}

function disconnect() {
    console.log('[UberEats] Desconectando...');
    return { ok: true, status: 'disconnected' };
}

function formatOrder(data) {
    console.log('[UberEats] Formatando pedido para o Pitombo...');
    return {
        origem: 'UBEREATS',
        cliente: data.eater?.first_name || 'Cliente UberEats',
        itens: data.cart || [],
        total: data.payment?.charges?.total || 0,
        status: 'recebido'
    };
}

function handleWebhook(data) {
    console.log('[UberEats] Webhook recebido!');
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
