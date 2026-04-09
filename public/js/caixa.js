document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dataHoje').textContent = new Date().toLocaleDateString('pt-BR');

  async function carregarCaixa() {
    try {
      const res = await apiFetch('/api/pedidos');
      const pedidos = await res.json();
      
      // Filtra apenas do dia atual
      const hojeStr = new Date().toISOString().split('T')[0];
      const pedidosHoje = pedidos.filter(p => p.criado_em && p.criado_em.startsWith(hojeStr));
      
      let totPago = 0;
      let totPendente = 0;
      let qdtPedidos = pedidosHoje.length;
      let qdtEntregues = 0;
      
      let mDinheiro = 0, mPix = 0, mCartao = 0;

      pedidosHoje.forEach(p => {
        const val = Number(p.total) || 0;
        
        if (p.status === 'entregue') qdtEntregues++;
        
        if (p.payment_status === 'pago') {
          totPago += val;
          if (p.payment_method === 'dinheiro') mDinheiro += val;
          else if (p.payment_method === 'cartao') mCartao += val;
          else mPix += val;
        } else if (p.payment_status !== 'cancelado') {
          totPendente += val;
        }
      });

      document.getElementById('valTotalPago').textContent = `${window.formatCurrency(totPago)}`;
      document.getElementById('valPendente').textContent = `${window.formatCurrency(totPendente)}`;
      document.getElementById('valPedidos').textContent = qdtPedidos;
      document.getElementById('valEntregues').textContent = qdtEntregues;
      
      document.getElementById('mDinheiro').textContent = `${window.formatCurrency(mDinheiro)}`;
      document.getElementById('mPix').textContent = `${window.formatCurrency(mPix)}`;
      document.getElementById('mCartao').textContent = `${window.formatCurrency(mCartao)}`;
      
    } catch (err) {
      console.error('Erro ao carregar o caixa:', err);
    }
  }

  carregarCaixa();
  setInterval(carregarCaixa, 10000); // Atualiza a cada 10s
});
