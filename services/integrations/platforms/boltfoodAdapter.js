const BaseDeliveryAdapter = require('./baseAdapter');

class BoltFoodAdapter extends BaseDeliveryAdapter {
    constructor() {
        super('BOLTFOOD');
    }

    async connect(credentials) {
        // Padrão de Autenticação Típico da Bolt { client_id, access_token }
        if (!credentials.access_token) {
            throw new Error('Chave de Acesso Bolt Food inválida.');
        }
        console.log(\`[Integração] Bolt Food escutando os eventos do restaurante.\`);
        return true;
    }

    normalizeOrder(boltPayload) {
        return {
            origem: this.platformName,
            cliente_nome: boltPayload.user_name || 'Courier Bolt',
            cliente_telefone: boltPayload.user_phone || '---',
            endereco: boltPayload.delivery_address || 'Entrega Bolt',
            itens: (boltPayload.order_items || []).map(item => ({
                sku: item.sku,
                nome: item.title,
                quantidade: item.qty,
                preco: item.unit_price,
                notas: item.notes || ''
            })),
            observacoes_gerais: boltPayload.comment || '',
            taxa_entrega: boltPayload.delivery_cost || 0,
            valor_total: boltPayload.total_price || 0,
            pagamento: boltPayload.payment_method === 'CASH' ? 'dinheiro' : 'online_plataforma',
            status: 'recebido'
        };
    }

    async updateOrderStatus(externalOrderId, newStatus) {
        console.log(\`[BOLTFOOD] Repassando evento de \${newStatus} à plataforma da Bolt.\`);
        return true;
    }
}

module.exports = BoltFoodAdapter;
