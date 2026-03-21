document.addEventListener('DOMContentLoaded', () => {
  console.log('Painel do Entregador Iniciado');

  const lista = document.getElementById('listaEntregas');

  async function carregarEntregas() {
    try {
      const res = await fetch('/api/pedidos');
      const pedidos = await res.json();
      
      // Filtra apenas 'pronto' e 'em_entrega'
      const entregas = pedidos.filter(p => ['pronto', 'em_entrega'].includes(p.status));

      if (entregas.length === 0) {
        lista.innerHTML = '<div class="loading">Nenhuma entrega pendente no momento. 🛵💨</div>';
        return;
      }

      lista.innerHTML = entregas.map(p => {
        const timeStr = new Date(p.criado_em).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit'
        });
        
        // Items HTML
        let itemsHtml = '<ul class="items-list">';
        p.itens.forEach(i => {
          itemsHtml += `<li><span>${i.quantidade}x ${i.nome_produto}</span></li>`;
        });
        itemsHtml += '</ul>';

        // Address logic - check if exist in observections or explicit var (not in schema)
        let enderecoHtml = '<span class="address-warning">Endereço não informado</span>';
        if (p.endereco) enderecoHtml = p.endereco;

        // Button action logic
        let actionBtn = '';
        if (p.status === 'pronto') {
          actionBtn = `<button class="btn btn-em_entrega_action" onclick="alterarStatus(${p.id}, 'em_entrega', '${p.payment_method || 'dinheiro'}', '${p.payment_status || 'pendente'}')">Sair para entrega</button>`;
        } else if (p.status === 'em_entrega') {
          actionBtn = `<button class="btn btn-entregue_action" onclick="alterarStatus(${p.id}, 'entregue', '${p.payment_method || 'dinheiro'}', '${p.payment_status || 'pendente'}')">Marcar como entregue</button>`;
        }

        const statusLabel = p.status === 'pronto' ? 'Aguardando Coleta' : 'Em Rota de Entrega';

        // Geração dos botões de contato e rota
        let actionsHtml = '';
        if (p.telefone || p.endereco) {
          actionsHtml += '<div class="fast-actions-container">';
          if (p.telefone) {
            const rawPhone = p.telefone.replace(/\D/g, '');
            const waPhone = rawPhone.length >= 10 && !rawPhone.startsWith('55') ? '55' + rawPhone : rawPhone;
            const msg = encodeURIComponent(`Olá ${p.cliente}, sou o entregador do seu pedido da Pitombo Lanches.`);
            actionsHtml += `
              <a href="https://wa.me/${waPhone}?text=${msg}" target="_blank" class="btn-fast btn-whats">
                💬 Whats
              </a>
              <a href="tel:${rawPhone}" class="btn-fast btn-phone">
                📞 Ligar
              </a>
            `;
          }
          if (p.endereco) {
            const endCoord = encodeURIComponent(p.endereco);
            const endSafe = p.endereco.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            actionsHtml += `
              <a href="https://www.google.com/maps/search/?api=1&query=${endCoord}" target="_blank" class="btn-fast btn-maps">
                📍 Maps
              </a>
              <a href="https://waze.com/ul?q=${endCoord}&navigate=yes" target="_blank" class="btn-fast btn-waze">
                🚗 Waze
              </a>
              <button onclick="copiarEndereco('${endSafe}')" class="btn-fast btn-copy">
                📋 Copiar
              </button>
            `;
          }
          actionsHtml += '</div>';
        }

        const pMetodo = p.payment_method ? p.payment_method.toUpperCase() : 'DINHEIRO';
        const pStatusStr = p.payment_status || 'pendente';
        const pColor = pStatusStr === 'pago' ? 'green' : (pStatusStr === 'cancelado' ? '#888' : 'red');

        return `
          <div class="delivery-card status-${p.status}">
            <div class="card-header">
              <span class="card-id">Pedido #${p.id}</span>
              <span class="card-status">${statusLabel}</span>
            </div>
            
            <div class="card-body">
              <div class="customer-info">
                <div class="customer-name">${p.cliente}</div>
                <div class="info-line">
                  <strong>Telefone:</strong> ${p.telefone ? p.telefone : 'Não informado'}
                </div>
                <div class="info-line">
                  <strong>Endereço:</strong> ${enderecoHtml}
                </div>
                <div class="info-line">
                  <strong>Horário:</strong> ${timeStr}
                </div>
                <div class="info-line">
                  <strong>Pagamento:</strong> ${pMetodo} <span style="color:#fff;background:${pColor};padding:0.15rem 0.4rem;border-radius:4px;font-size:0.75rem;margin-left:0.3rem;text-transform:uppercase">${pStatusStr}</span>
                </div>
                ${p.payment_method === 'dinheiro' && p.troco_para ? `<div class="info-line" style="color:#e8420a;font-weight:bold;font-size:1.1rem;background:rgba(232,66,10,0.1);padding:0.5rem;border-radius:6px;width:fit-content;display:inline-block;">⚠️ Troco para: R$ ${Number(p.troco_para).toFixed(2).replace('.',',')} <br>(Levar R$ ${Number(p.valor_troco || 0).toFixed(2).replace('.',',')})</div>` : ''}
                ${p.observacoes ? `<div class="info-line"><strong>Obs:</strong> ${p.observacoes}</div>` : ''}
                ${actionsHtml}
              </div>

              <div class="items-section">
                <div style="font-weight:600;margin-bottom:0.5rem;color:var(--text-light)">Itens do Pedido:</div>
                ${itemsHtml}
              </div>
            </div>

            <div class="card-footer">
              <div class="total-line">
                <span>Total a cobrar:</span>
                <strong>R$ ${Number(p.total).toFixed(2).replace('.', ',')}</strong>
              </div>
              ${actionBtn}
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error(err);
      if (lista.innerHTML.includes('loading')) {
        lista.innerHTML = '<div class="loading" style="color:red">Erro ao buscar entregas.</div>';
      }
    }
  }

  window.alterarStatus = async function(id, novoStatus, pMethod, pStatus) {
    if (novoStatus === 'entregue' && pMethod !== 'dinheiro' && pStatus !== 'pago') {
      if(!confirm(`⚠️ ATENÇÃO: Pagamento via ${pMethod.toUpperCase()} (Status atual: ${pStatus.toUpperCase()}).\n\nConfirme que o valor já foi RECEBIDO pelo cliente, para poder marcar o pedido como Entregue.`)) {
        return;
      }
    } else {
      if(!confirm(`Confirmar mudança de status do pedido #${id}?`)) return;
    }
    
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
    navigator.clipboard.writeText(end).then(() => {
      alert('Endereço copiado!');
    }).catch(err => alert('Erro ao copiar'));
  };

  carregarEntregas();
  
  // Realiza refresh apenas a cada 10 segundos
  setInterval(carregarEntregas, 10000);
});
