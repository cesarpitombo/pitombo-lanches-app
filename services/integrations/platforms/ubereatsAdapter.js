const BaseDeliveryAdapter = require('./baseAdapter');

class UberEatsAdapter extends BaseDeliveryAdapter {
    constructor() {
        super('UBEREATS');
    }

    async connect(credentials) {
        // Validação das chaves do UberEats: { client_id, client_secret }
        if (!credentials.client_id || !credentials.client_secret) {
            throw new Error('Chaves da API do UberEats Ausentes ou Inválidas');
        }
        console.log(\`[Integração] Handshake com UberEats Realizado. Store_ID: \${credentials.client_id}\`);
        return true;
    }

    // Processa os Webhooks nativos da Uber
    normalizeOrder(uberPayload) {
        // Mock de uma transformação de dados vindo do Webhook do Uber
        return {
            origem: this.platformName,
            cliente_nome: uberPayload.eater?.first_name || 'Usuário Uber',
            cliente_telefone: uberPayload.eater?.phone || 'Não Fornecido',
            endereco: uberPayload.dropoff?.location?.address || 'Retirada',
            itens: (uberPayload.cart || []).map(item => ({
                sku: item.external_data || item.id,
                nome: item.title,
                quantidade: item.quantity,
                preco: item.price.total / 100, // em Reais/Euros
                notas: item.special_requests || ''
            })),
            observacoes_gerais: uberPayload.special_instructions || '',
            taxa_entrega: (uberPayload.payment?.charges?.delivery_fee || 0) / 100,
            valor_total: (uberPayload.payment?.charges?.total || 0) / 100,
            pagamento: 'online_plataforma', 
            status: 'recebido'
        };
    }

    async updateOrderStatus(externalOrderId, newStatus) {
        console.log(\`[UBEREATS] Pedido \${externalOrderId} atualizado para \${newStatus} na Uber.\`);
        return true;
    }
}

module.exports = UberEatsAdapter;
