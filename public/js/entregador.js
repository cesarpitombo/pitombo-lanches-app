document.addEventListener('DOMContentLoaded', () => {
  console.log('Painel do Entregador Iniciado');

  const lista     = document.getElementById('listaEntregas');
  const listaHist = document.getElementById('listaHistorico');
  let abaAtual = 'ativas';

  // ─── Troca de aba ──────────────────────────────────────────
  window.trocarAba = function(aba) {
    abaAtual = aba;
    document.getElementById('tab-ativas').style.display    = aba === 'ativas'    ? 'block' : 'none';
    document.getElementById('tab-historico').style.display = aba === 'historico' ? 'block' : 'none';
    document.querySelectorAll('.etab-btn').forEach(b => b.classList.remove('etab-ativo'));
    document.querySelector(`.etab-btn[data-tab="${aba}"]`).classList.add('etab-ativo');
    if (aba === 'historico') renderHistorico();
  };

  // ─── Helpers ──────────────────────────────────────────────
  function buildItensHtml(itens) {
    let html = '<ul class="items-list">';
    itens.forEach(i => { html += `<li><span>${i.quantidade}x ${i.nome_produto}</span></li>`; });
    return html + '</ul>';
  }

  function buildActionsHtml(p) {
    if (!p.telefone && !p.endereco) return '';
    let html = '<div class="fast-actions-container">';
    if (p.telefone) {
      const raw = p.telefone.replace(/\D/g, '');
      const wa  = raw.length >= 10 && !raw.startsWith('55') ? '55' + raw : raw;
      const msg = encodeURIComponent(`Olá ${p.cliente}, sou o entregador do seu pedido da Pitombo Lanches.`);
      html += `
        <a href="https://wa.me/${wa}?text=${msg}" target="_blank" class="btn-fast btn-whats">💬 Whats</a>
        <a href="tel:${raw}" class="btn-fast btn-phone">📞 Ligar</a>`;
    }
    if (p.endereco) {
      const enc  = encodeURIComponent(p.endereco);
      const safe = p.endereco.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      html += `
        <a href="https://www.google.com/maps/search/?api=1&query=${enc}" target="_blank" class="btn-fast btn-maps">📍 Maps</a>
        <a href="https://waze.com/ul?q=${enc}&navigate=yes" target="_blank" class="btn-fast btn-waze">🚗 Waze</a>
        <button onclick="copiarEndereco('${safe}')" class="btn-fast btn-copy">📋 Copiar</button>`;
    }
    return html + '</div>';
  }

  function buildCard(p) {
    const timeStr = new Date(p.criado_em).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const enderecoHtml = p.endereco || '<span class="address-warning">Endereço não informado</span>';
    const pMetodo      = p.payment_method ? p.payment_method.toUpperCase() : 'DINHEIRO';
    const pStatusStr   = p.payment_status || 'pendente';
    const pColor       = pStatusStr === 'pago' ? 'green' : (pStatusStr === 'cancelado' ? '#888' : 'red');

    let actionBtn = '';
    let statusLabel = '';
    if (p.status === 'pronto') {
      statusLabel = 'Aguardando Coleta';
      actionBtn   = `<button class="btn btn-em_entrega_action" onclick="alterarStatus(${p.id},'em_entrega','${p.payment_method||'dinheiro'}','${p.payment_status||'pendente'}')">Sair para entrega</button>`;
    } else if (p.status === 'em_entrega') {
      statusLabel = 'Em Rota de Entrega';
      actionBtn   = `<button class="btn btn-entregue_action" onclick="alterarStatus(${p.id},'entregue','${p.payment_method||'dinheiro'}','${p.payment_status||'pendente'}')">Marcar como entregue</button>`;
    } else if (p.status === 'entregue') {
      statusLabel = '✅ Entregue';
    }

    return `
      <div class="delivery-card status-${p.status}">
        <div class="card-header">
          <span class="card-id">Pedido #${p.id}</span>
          <span class="card-status">${statusLabel}</span>
        </div>
        <div class="card-body">
          <div class="customer-info">
            <div class="customer-name">${p.cliente}</div>
            <div class="info-line"><strong>Telefone:</strong> ${p.telefone || 'Não informado'}</div>
            <div class="info-line"><strong>Endereço:</strong> ${enderecoHtml}</div>
            <div class="info-line"><strong>Horário:</strong> ${timeStr}</div>
            <div class="info-line">
              <strong>Pagamento:</strong> ${pMetodo}
              <span style="color:#fff;background:${pColor};padding:0.15rem 0.4rem;border-radius:4px;font-size:0.75rem;margin-left:0.3rem;text-transform:uppercase">${pStatusStr}</span>
            </div>
            ${p.payment_method === 'dinheiro' && p.troco_para
              ? `<div class="info-line" style="color:#e8420a;font-weight:bold;font-size:1.1rem;background:rgba(232,66,10,0.1);padding:0.5rem;border-radius:6px;width:fit-content;display:inline-block;">⚠️ Troco para: ${window.formatCurrency(p.troco_para)} <br>(Levar ${window.formatCurrency(p.valor_troco || 0)})</div>`
              : ''}
            ${p.observacoes ? `<div class="info-line"><strong>Obs:</strong> ${p.observacoes}</div>` : ''}
            ${buildActionsHtml(p)}
          </div>
          <div class="items-section">
            <div style="font-weight:600;margin-bottom:0.5rem;color:var(--text-light)">Itens do Pedido:</div>
            ${buildItensHtml(p.itens || [])}
          </div>
        </div>
        <div class="card-footer">
          <div class="total-line">
            <span>Total a cobrar:</span>
            <strong>${window.formatCurrency(p.total)}</strong>
          </div>
          ${actionBtn}
        </div>
      </div>`;
  }

  // ─── Aba "Em Entrega" ──────────────────────────────────────
  async function carregarEntregas() {
    try {
      const res     = await fetch('/api/pedidos');
      const pedidos = await res.json();
      const ativas  = pedidos.filter(p => ['pronto', 'em_entrega'].includes(p.status));

      if (ativas.length === 0) {
        lista.innerHTML = '<div class="loading">Nenhuma entrega pendente no momento. 🛵💨</div>';
      } else {
        lista.innerHTML = ativas.map(buildCard).join('');
      }

      // Atualiza histórico se estiver visível
      if (abaAtual === 'historico') renderHistorico();

    } catch (err) {
      console.error(err);
      lista.innerHTML = '<div class="loading" style="color:red">Erro ao buscar entregas.</div>';
    }
  }

  // ─── Aba "Histórico" ──────────────────────────────────────
  async function renderHistorico() {
    listaHist.innerHTML = '<div class="loading">Carregando histórico...</div>';
    try {
      const res        = await fetch('/api/pedidos');
      const pedidos    = await res.json();
      const entregues  = pedidos.filter(p => p.status === 'entregue');

      if (entregues.length === 0) {
        listaHist.innerHTML = '<div class="loading">Nenhuma entrega concluída ainda.</div>';
        return;
      }

      listaHist.innerHTML = entregues.map(buildCard).join('');
    } catch (err) {
      listaHist.innerHTML = '<div class="loading" style="color:red">Erro ao carregar histórico.</div>';
    }
  }

  // ─── Alterar status ───────────────────────────────────────
  window.alterarStatus = async function(id, novoStatus) {
    try {
      const res = await fetch(`/api/pedidos/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus, origem: 'entregador' })
      });
      if (res.ok) {
        carregarEntregas();
      } else {
        alert('Erro ao atualizar status');
      }
    } catch (err) {
      console.error('Erro ao atualizar status', err);
      alert('Erro de conexão ao atualizar status');
    }
  };

  window.copiarEndereco = function(end) {
    navigator.clipboard.writeText(end).then(() => alert('Endereço copiado!')).catch(() => alert('Erro ao copiar'));
  };

  carregarEntregas();
  setInterval(carregarEntregas, 10000);
});
