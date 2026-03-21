document.addEventListener('DOMContentLoaded', () => {
  console.log('Cozinha Iniciada');

  // Relogio
  setInterval(() => {
    document.getElementById('relogio').textContent = new Date().toLocaleTimeString('pt-BR');
  }, 1000);

  const grid = document.getElementById('gridPedidos');

  // Controle de alertas sonoros
  window.somAtivado = false;
  window.audioCtx = null;
  let pedidosConhecidos = new Set();
  let primeiraCarga = true;

  window.ativarSom = function() {
    window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    window.somAtivado = true;
    document.getElementById('btnAtivarSom').style.display = 'none';
  };

  function tocarSom() {
    if (!window.somAtivado || !window.audioCtx) return;
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
    
    // Reproduz um ding simples duplo
    const time = window.audioCtx.currentTime;
    
    // Primeiro ding
    const osc1 = window.audioCtx.createOscillator();
    const gain1 = window.audioCtx.createGain();
    osc1.connect(gain1); gain1.connect(window.audioCtx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, time);
    osc1.frequency.exponentialRampToValueAtTime(1760, time + 0.1);
    gain1.gain.setValueAtTime(0, time);
    gain1.gain.linearRampToValueAtTime(0.3, time + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc1.start(time); osc1.stop(time + 0.3);
    
    // Segundo ding
    const osc2 = window.audioCtx.createOscillator();
    const gain2 = window.audioCtx.createGain();
    osc2.connect(gain2); gain2.connect(window.audioCtx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1108.73, time + 0.15); // C#6
    osc2.frequency.exponentialRampToValueAtTime(2217.46, time + 0.25);
    gain2.gain.setValueAtTime(0, time + 0.15);
    gain2.gain.linearRampToValueAtTime(0.3, time + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    osc2.start(time + 0.15); osc2.stop(time + 0.5);
  }

  async function carregarPedidos() {
    try {
      const res = await fetch('/api/pedidos');
      const pedidos = await res.json();
      
      let fila = pedidos.filter(p => ['recebido', 'em_preparo'].includes(p.status));
      let prontos = pedidos.filter(p => p.status === 'pronto');

      const sortPedidos = (a, b) => {
        const aDelay = Math.floor((new Date() - new Date(a.criado_em)) / 60000) >= 20;
        const bDelay = Math.floor((new Date() - new Date(b.criado_em)) / 60000) >= 20;
        if (aDelay && !bDelay) return -1;
        if (!aDelay && bDelay) return 1;
        return a.id - b.id; 
      };
      fila.sort(sortPedidos);
      prontos.sort(sortPedidos);

      document.getElementById('count-fila').textContent = fila.length;
      document.getElementById('count-pronto').textContent = prontos.length;
      
      let atrasadosCont = 0;
      fila.forEach(p => {
        if (Math.floor((new Date() - new Date(p.criado_em)) / 60000) >= 20) atrasadosCont++;
      });
      const elAtrasados = document.getElementById('count-atrasados');
      if (elAtrasados) elAtrasados.textContent = atrasadosCont;

      let temNovo = false;
      fila.forEach(p => {
        if (!pedidosConhecidos.has(p.id)) {
          if (!primeiraCarga && p.status === 'recebido') temNovo = true;
          pedidosConhecidos.add(p.id);
        }
      });
      
      if (temNovo) {
        tocarSom();
      }
      primeiraCarga = false;

      const renderizarCards = (listaArray, ehPronto) => {
        if (listaArray.length === 0) {
          return `<div class="loading">${ehPronto ? 'Nenhum pedido aguardando retirada.' : 'Fila limpa! 🍻'}</div>`;
        }

        return listaArray.map(p => {
          const createdAt = new Date(p.criado_em);
          const timeStr = createdAt.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
          const diffMinutes = Math.floor((new Date() - createdAt) / 60000);
          
          const isAtrasado = diffMinutes >= 20;
          const isAtencao = diffMinutes >= 10 && diffMinutes < 20;

          let tempoElapsed = diffMinutes > 0 ? `(${diffMinutes} min)` : '(Agora)';
          if (isAtrasado) tempoElapsed = `<span class="text-pulse" style="color:#ff4d4d; font-weight:800; margin-left:0.4rem; letter-spacing:0.5px">(${diffMinutes} min) ATRASADO</span>`;
          else if (isAtencao) tempoElapsed = `<span style="color:#ffc107; font-weight:700; margin-left:0.4rem">(${diffMinutes} min)</span>`;
          else tempoElapsed = `<span style="color:#aaa; margin-left:0.4rem; font-weight:normal">${tempoElapsed}</span>`;
          
          const cardClassAdd = isAtrasado ? 'card-atrasado' : '';
          
          let itemsHtml = '<ul class="item-list">';
          p.itens.forEach(i => {
            itemsHtml += `<li><span class="qtd">${i.quantidade}x</span> ${i.nome_produto}</li>`;
          });
          if (p.observacoes) {
            itemsHtml += `<li style="color:#e8420a;font-weight:bold;margin-top:0.5rem">⚠️ Obs: ${p.observacoes}</li>`;
          }
          itemsHtml += '</ul>';

          let actionBtn = '';
          if (p.status === 'recebido') {
            actionBtn = `<button class="btn-action btn-preparar" onclick="alterarStatus(${p.id}, 'em_preparo')">Começar Preparo</button>`;
          } else if (p.status === 'em_preparo') {
            actionBtn = `<button class="btn-action btn-pronto" onclick="alterarStatus(${p.id}, 'pronto')">Marcar como Pronto</button>`;
          }

          let statusLabel = 'Na Fila';
          if (p.status === 'em_preparo') statusLabel = 'Em Preparo';
          if (p.status === 'pronto') statusLabel = 'Pronto';

          return `
            <div class="order-card status-${p.status} ${cardClassAdd}">
              <div class="order-header">
                <span class="order-id" style="font-size:1.3rem">#${p.id}</span>
                <span class="order-time" style="font-weight:700; color:#fff; font-size:1.1rem">${timeStr} ${tempoElapsed}</span>
                <span class="order-status">${statusLabel}</span>
              </div>
              <div class="order-body">
                <strong style="display:block;margin-bottom:0.5rem;color:#ccc;font-size:1.1rem">${p.cliente}</strong>
                ${itemsHtml}
              </div>
              ${actionBtn ? `<div class="order-footer">${actionBtn}</div>` : ''}
            </div>
          `;
        }).join('');
      };

      const gridFila = document.getElementById('gridPedidos');
      const gridProntos = document.getElementById('gridProntos');

      if (gridFila) gridFila.innerHTML = renderizarCards(fila, false);
      if (gridProntos) gridProntos.innerHTML = renderizarCards(prontos, true);

    } catch (err) {
      console.error(err);
      if (grid.innerHTML.includes('loading')) {
        grid.innerHTML = '<div class="loading" style="color:var(--recebido)">Erro ao conectar com servidor.</div>';
      }
    }
  }

  window.alterarStatus = async function(id, novoStatus) {
    try {
      const res = await fetch(`/api/pedidos/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus, origem: 'cozinha' })
      });
      
      if (res.ok) {
        carregarPedidos();
      }
    } catch (err) {
      console.error('Erro ao atualizar status', err);
    }
  };

  carregarPedidos();
  // Poll a cada 5 segundos
  setInterval(carregarPedidos, 5000);
});
