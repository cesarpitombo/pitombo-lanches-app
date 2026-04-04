const BaseDeliveryAdapter = require('./baseAdapter');

class GlovoAdapter extends BaseDeliveryAdapter {
    constructor() {
        super('GLOVO');
    }

    async connect(credentials) {
        // Validação para Glovo Partners: { api_key, store_id }
        if (!credentials.api_key || !credentials.store_id) {
            throw new Error('API Key ou Store ID do Glovo ausentes.');
        }
        console.log(\`[Integração] Conexão Glovo autenticada para a loja: \${credentials.store_id}\`);
        return true;
    }

    normalizeOrder(glovoPayload) {
        // Exemplo fictício do payload Glovo
        return {
            origem: this.platformName,
            cliente_nome: glovoPayload.customer?.name || 'Cliente Glovo',
            cliente_telefone: glovoPayload.customer?.phone_number || 'Sem Telefone',
            endereco: glovoPayload.delivery_address?.label || 'Balcão/Glovo',
            itens: (glovoPayload.products || []).map(p => ({
                sku: p.id,
                nome: p.name,
                quantidade: p.quantity,
                preco: p.price,
                notas: p.attributes ? p.attributes.map(a => a.name).join(', ') : ''
            })),
            observacoes_gerais: glovoPayload.allergies || '',
            taxa_entrega: glovoPayload.delivery_fee || 0,
            valor_total: glovoPayload.total_amount || 0,
            pagamento: 'online_plataforma', // A Glovo costuma reter o pagamento digitalmente
            status: 'recebido'
        };
    }

    async updateOrderStatus(externalOrderId, newStatus) {
        // O mapeamento exato das mutations da Glovo (ex: ACCEPTED, READY_FOR_PICKUP)
        console.log(\`[GLOVO] Alterando o workflow do pedido \${externalOrderId} para \${newStatus}\`);
        return true;
    }
}

module.exports = GlovoAdapter;
