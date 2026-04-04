// Classe Base para Adaptadores de Plataformas de Delivery
class BaseDeliveryAdapter {
    constructor(platformName) {
        this.platformName = platformName;
    }

    // Handshake ou validação inicial de credenciais
    async connect(credentials) {
        throw new Error('Method connect() must be implemented');
    }

    // Ao invés de usar Webhooks fixos, se a plataforma usar pull (long-polling), ele é triggado aqui.
    async pullOrders() {
        return [];
    }

    // Traduz Payload Específico da plataforma para o Modelo Universal Pitombo
    normalizeOrder(externalPayload) {
        /* Formato Esperado Retornado:
        {
            origem: this.platformName,
            cliente_nome: string,
            cliente_telefone: string,
            endereco: string,
            itens: [{ sku: string, nome: string, quantidade: number, preco: number, notas: string }],
            observacoes_gerais: string,
            taxa_entrega: number,
            valor_total: number,
            pagamento: 'online_plataforma' | 'dinheiro' | 'online_loja',
            status: 'recebido'
        }
        */
        throw new Error('Method normalizeOrder() must be implemented');
    }

    // Atualiza status do pedido na plataforma (Ex: de "Aceito" para "Pronto")
    async updateOrderStatus(externalOrderId, newStatus) {
        throw new Error('Method updateOrderStatus() must be implemented');
    }
}

module.exports = BaseDeliveryAdapter;
