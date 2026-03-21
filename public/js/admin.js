document.addEventListener('DOMContentLoaded', () => {
  console.log('Admin Dashboard Iniciado');

  // Tabs logic
  const menuItems = document.querySelectorAll('.menu-item');
  const tabContents = document.querySelectorAll('.tab-content');
  const pageTitle = document.getElementById('pageTitle');

  menuItems.forEach(btn => {
    btn.addEventListener('click', () => {
      menuItems.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
      
      if(pageTitle) pageTitle.textContent = btn.innerText.replace(/📦|🍔/g, '').trim();
      
      if (btn.dataset.target === 'produtos') {
        carregarCardapioGeral();
      } else if (btn.dataset.target === 'configuracoes') {
        carregarConfiguracoesAdmin();
      }
    });
  });

  // ========== VIEW TOGGLE ============
  window.viewMode = 'cards';
  const btnCards = document.getElementById('btnViewCards');
  const btnList = document.getElementById('btnViewList');
  const viewLista = document.getElementById('viewListaPedidos');
  const viewCards = document.getElementById('listaPedidos');

  if(btnCards && btnList) {
    btnCards.addEventListener('click', () => {
      window.viewMode = 'cards';
      btnCards.classList.add('active');
      btnCards.style.background = '#fff';
      btnCards.style.color = '#333';
      btnList.classList.remove('active');
      btnList.style.background = 'transparent';
      btnList.style.color = '#555';
      viewCards.style.display = 'grid';
      viewLista.style.display = 'none';
      renderPedidos();
    });
    btnList.addEventListener('click', () => {
      window.viewMode = 'list';
      btnList.classList.add('active');
      btnList.style.background = '#fff';
      btnList.style.color = '#333';
      btnCards.classList.remove('active');
      btnCards.style.background = 'transparent';
      btnCards.style.color = '#555';
      viewLista.style.display = 'block';
      viewCards.style.display = 'none';
      renderPedidos();
    });
  }

  const statusMap = {
    'recebido': { label: 'Recebido', class: 'status-recebido' },
    'em_preparo': { label: 'Em Preparo', class: 'status-em_preparo' },
    'pronto': { label: 'Pronto', class: 'status-pronto' },
    'em_entrega': { label: 'Em Entrega', class: 'status-em_entrega' },
    'entregue': { label: 'Entregue', class: 'status-entregue' },
    'cancelado': { label: 'Cancelado', class: 'status-cancelado' }
  };

  const acoesMap = {
    'recebido': ['em_preparo', 'cancelado'],
    'em_preparo': ['pronto', 'cancelado'],
    'pronto': ['em_entrega', 'cancelado'],
    'em_entrega': ['entregue', 'cancelado'],
    'entregue': []
  };

  window.pedidosAtuais = [];
  let currentTypeFilter = 'todos';
  let currentStatusFilter = 'todos';
  let searchTerm = '';
  
  // Busca e Filtros
  const inputBusca = document.getElementById('inputBusca');
  if (inputBusca) {
    inputBusca.addEventListener('input', (e) => {
      searchTerm = e.target.value.toLowerCase();
      renderPedidos();
    });
  }

  document.querySelectorAll('.type-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.type-tab').forEach(b => {
         b.classList.remove('active');
         b.style.border = '1px solid transparent';
         b.style.background = 'transparent';
         b.style.color = '#666';
         b.style.borderBottom = 'none';
      });
      const target = e.currentTarget;
      target.classList.add('active');
      target.style.border = 'none';
      target.style.background = '#eee';
      target.style.color = '#333';
      target.style.borderBottom = 'none';
      
      currentTypeFilter = target.dataset.type;
      renderPedidos();
    });
  });

  document.querySelectorAll('.status-filter').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.status-filter').forEach(b => {
         b.classList.remove('active');
         b.style.border = '1px solid #ddd';
         b.style.background = '#fff';
         b.style.color = '#555';
         const badge = b.querySelector('span');
         if(badge) {
             if(b.dataset.status === 'pendente') { badge.style.background = '#ffd54f'; badge.style.color = '#000'; }
             else if(b.dataset.status === 'em_curso') { badge.style.background = '#4caf50'; badge.style.color = '#fff'; }
             else if(b.dataset.status === 'atrasados') { badge.style.background = '#dc3545'; badge.style.color = '#fff'; }
             else { badge.style.background = '#eee'; badge.style.color = '#555'; }
         }
      });
      const target = e.currentTarget;
      target.classList.add('active');
      target.style.border = '2px solid #333';
      target.style.background = '#333';
      target.style.color = '#fff';
      const badgeT = target.querySelector('span');
      if(badgeT) { badgeT.style.background = '#555'; badgeT.style.color = '#fff'; }
      
      currentStatusFilter = target.dataset.status;
      renderPedidos();
    });
  });

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

  function tocarSom(tipo = 'novo') {
    if (!window.somAtivado || !window.audioCtx) return;
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
    
    const time = window.audioCtx.currentTime;
    
    if (tipo === 'atraso') {
      // Som de Alerta Vermelho Pulsante (Atraso)
      const osc = window.audioCtx.createOscillator();
      const gain = window.audioCtx.createGain();
      osc.connect(gain); gain.connect(window.audioCtx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, time);
      osc.frequency.setValueAtTime(660, time + 0.2);
      osc.frequency.setValueAtTime(440, time + 0.4);
      osc.frequency.setValueAtTime(660, time + 0.6);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.4, time + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.8);
      osc.start(time); osc.stop(time + 0.8);
    } else {
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
  }

  async function carregarPedidos() {
    const lista = document.getElementById('listaPedidos');
    lista.innerHTML = '<div class="loading">Carregando pedidos...</div>';
    
    try {
      const res = await fetch('/api/pedidos');
      const pedidos = await res.json();
      window.pedidosAtuais = pedidos;
      
      let temNovo = false;
      let temAtraso = false;
      pedidos.forEach(p => {
        if (!pedidosConhecidos.has(p.id)) {
          if (!primeiraCarga) temNovo = true;
          pedidosConhecidos.add(p.id);
        }
        const isActive = !['entregue', 'cancelado'].includes(p.status);
        const diffMinutes = Math.floor((new Date() - new Date(p.criado_em))/60000);
        if (isActive && diffMinutes >= 20) {
           if (!pedidosConhecidos.has(p.id + '_atraso')) {
              if (!primeiraCarga) temAtraso = true;
              pedidosConhecidos.add(p.id + '_atraso');
           }
        }
      });
      
      if (temAtraso) {
        tocarSom('atraso');
      } else if (temNovo) {
        tocarSom('novo');
      }
      primeiraCarga = false;

      renderPedidos();
      
    } catch (err) {
      console.error(err);
      lista.innerHTML = '<div class="loading" style="color:red">Erro ao carregar pedidos.</div>';
    }
  }

  function renderPedidos() {
    const lista = document.getElementById('listaPedidos');
    let pedidos = window.pedidosAtuais || [];

    // Contadores Operacionais e KPIs
    const counts = { 
        type: { todos: 0, balcao: 0, delivery: 0 },
        status: { todos: 0, pendente: 0, em_curso: 0, atrasados: 0, concluidos: 0 }
    };
    let fatHoje = 0;
    
    // Zera tudo pra evitar NaN se backend mandar lixo
    counts.type.todos = pedidos.length;

    pedidos.forEach(p => {
      const isActive = !['entregue', 'cancelado'].includes(p.status);
      const isAtrasado = isActive && Math.floor((new Date() - new Date(p.criado_em)) / 60000) >= 20;

      if (p.tipo === 'balcao') counts.type.balcao++;
      if (p.tipo === 'delivery') counts.type.delivery++;
      
      if (currentTypeFilter === 'todos' || currentTypeFilter === p.tipo) {
         counts.status.todos++;
         if (p.status === 'recebido') counts.status.pendente++;
         if (['em_preparo', 'pronto', 'em_entrega'].includes(p.status)) counts.status.em_curso++;
         if (isAtrasado) counts.status.atrasados++;
         if (['entregue', 'cancelado'].includes(p.status)) counts.status.concluidos++;
      }
      
      // Se tiver pago ou entregue que pressupoe pago (se dinheiro ja recebido).
      if (p.payment_status === 'pago' || p.status === 'entregue') {
         fatHoje += Number(p.total) || 0;
      }
    });
    
    // Atualiza badges
    if(document.getElementById('cnt-type-todos')) document.getElementById('cnt-type-todos').textContent = counts.type.todos;
    if(document.getElementById('cnt-type-balcao')) document.getElementById('cnt-type-balcao').textContent = counts.type.balcao;
    if(document.getElementById('cnt-type-delivery')) document.getElementById('cnt-type-delivery').textContent = counts.type.delivery;

    if(document.getElementById('cnt-status-todos')) document.getElementById('cnt-status-todos').textContent = counts.status.todos;
    if(document.getElementById('cnt-status-pendente')) document.getElementById('cnt-status-pendente').textContent = counts.status.pendente;
    if(document.getElementById('cnt-status-em_curso')) document.getElementById('cnt-status-em_curso').textContent = counts.status.em_curso;
    if(document.getElementById('cnt-status-atrasados')) document.getElementById('cnt-status-atrasados').textContent = counts.status.atrasados;
    if(document.getElementById('cnt-status-concluidos')) document.getElementById('cnt-status-concluidos').textContent = counts.status.concluidos;
    
    // Atualiza Dashboard Superior
    const elFaturamento = document.getElementById('dash-faturamento');
    const elHoje = document.getElementById('dash-hoje');
    const elAtivos = document.getElementById('dash-ativos');
    const elAtrasados = document.getElementById('dash-atrasados');
    
    if (elFaturamento) elFaturamento.textContent = `R$ ${fatHoje.toFixed(2).replace('.',',')}`;
    if (elHoje) elHoje.textContent = counts.type.todos;
    if (elAtivos) elAtivos.textContent = counts.status.todos - counts.status.concluidos;
    if (elAtrasados) elAtrasados.textContent = counts.status.atrasados;

    // Filtros
    let filtered = pedidos.filter(p => {
      if (currentTypeFilter !== 'todos' && p.tipo !== currentTypeFilter) return false;
      
      const isActive = !['entregue', 'cancelado'].includes(p.status);
      const diffMinutes = Math.floor((new Date() - new Date(p.criado_em)) / 60000);
      const isAtrasado = isActive && diffMinutes >= 20;

      if (currentStatusFilter === 'pendente' && p.status !== 'recebido') return false;
      if (currentStatusFilter === 'em_curso' && !['em_preparo', 'pronto', 'em_entrega'].includes(p.status)) return false;
      if (currentStatusFilter === 'concluidos' && isActive) return false;
      if (currentStatusFilter === 'atrasados' && !isAtrasado) return false;
      
      if (searchTerm) {
        const termo = searchTerm;
        const nome = p.cliente.toLowerCase();
        const tel = p.telefone ? p.telefone.replace(/\D/g, '') : '';
        const idStr = p.id.toString();
        return nome.includes(termo) || tel.includes(termo) || idStr.includes(termo);
      }
      return true;
    });

    if (filtered.length === 0) {
      lista.innerHTML = '<div class="loading">Nenhum pedido encontrado.</div>';
      const tbl = document.getElementById('listaPedidosTabela');
      if(tbl) tbl.innerHTML = '<tr><td colspan="9" class="loading">Nenhum pedido encontrado.</td></tr>';
      return;
    }

    // Ordenação Operacional SLA
    filtered.sort((a, b) => {
      const aActive = !['entregue', 'cancelado'].includes(a.status);
      const bActive = !['entregue', 'cancelado'].includes(b.status);
      
      // Regra 1: Inativos (Entregues/Cancelados) sempre no final
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      // Regra 2: Atrasados no topo
      if (aActive && bActive) {
        const aDelay = Math.floor((new Date() - new Date(a.criado_em)) / 60000) >= 20;
        const bDelay = Math.floor((new Date() - new Date(b.criado_em)) / 60000) >= 20;
        if (aDelay && !bDelay) return -1;
        if (!aDelay && bDelay) return 1;
      }

      // Desempate: Mais novos antes (ou seja, IDs maiores emcima, exceto atrasados onde os mais atrasados (menor ID) lideram)
      return b.id - a.id;
    });

    // Descobrir ID Prioritario para AUTO-FOCO (Pedido mais antigo dentre os ativos, se houver atrasados, foca no mais atrasado)
    let idPrioritario = null;
    if (filtered.length > 0) {
       for (let i = 0; i < filtered.length; i++) {
          if (!['entregue', 'cancelado'].includes(filtered[i].status)) {
             idPrioritario = filtered[i].id;
             break;
          }
       }
    }

    // Identificar clientes com mais de 1 pedido ativo para agrupamento de entrega
    const phonesActive = {};
    pedidos.forEach(p => {
       if(!['entregue', 'cancelado'].includes(p.status) && p.telefone && p.telefone.length > 5) {
          phonesActive[p.telefone] = (phonesActive[p.telefone] || 0) + 1;
       }
    });

    lista.innerHTML = filtered.map(p => {
        const isActive = !['entregue', 'cancelado'].includes(p.status);
        const diffMinutes = Math.floor((new Date() - new Date(p.criado_em))/60000);
        const isAtrasado = isActive && diffMinutes >= 20;
        const isAtencao = isActive && diffMinutes >= 10 && diffMinutes < 20;

        const timeStr = new Date(p.criado_em).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        
        let labelCounter = `<span class="rt-timer" data-time="${p.criado_em}">${diffMinutes}m 00s</span>`;
        if(!isActive) labelCounter = `${diffMinutes}m`;

        let tempoHtml = `<span style="color:#666; font-size:1em; margin-left:0.3rem">(${labelCounter})</span>`;
        if (!isActive) tempoHtml = '';
        else if (isAtrasado) tempoHtml = `<span class="text-pulse" style="font-weight:900; font-size:1.4em; margin-left:0.5rem;">(${labelCounter})</span>`;
        else if (isAtencao) tempoHtml = `<span style="color:#e8420a; font-weight:800; font-size:1.2em; margin-left:0.4rem">(${labelCounter})</span>`;

        let headerBadge = '';
        if (isAtrasado) headerBadge = `<span class="text-pulse" style="background:#fff; color:#dc3545; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.8rem; font-weight:900; margin-left:0.5rem; letter-spacing:0.5px;">ATRASADO</span>`;

        const cardClassAdd = isAtrasado ? 'card-atrasado' : '';
        const stInfo = statusMap[p.status] || { label: p.status, class: '' };
        
        let itensHtml = '<ul class="item-list">';
        p.itens.forEach(i => {
          itensHtml += `<li><span class="qtd">${i.quantidade}x</span> ${i.nome_produto}</li>`;
        });
        if (p.observacoes) {
          itensHtml += `<li class="obs-item">⚠️ Obs: ${p.observacoes}</li>`;
        }
        itensHtml += '</ul>';

        // Botoes rápidos miniaturizados
        let inlineBtnWhats = '';
        if (p.telefone) {
          const rawP = p.telefone.replace(/\D/g, '');
          const wa = rawP.length >= 10 && !rawP.startsWith('55') ? '55' + rawP : rawP;
          inlineBtnWhats = `<a href="https://wa.me/${wa}" target="_blank" title="WhatsApp" class="btn-icon" style="text-decoration:none;">💬</a>`;
        }

        let inlineBtnMapa = '';
        if (p.endereco) {
          inlineBtnMapa = `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}" target="_blank" title="Mapa" class="btn-icon" style="text-decoration:none;">📍</a>`;
        }

        // Logic para Auto-foco e Agrupamento
        const isPrioridade = p.id === idPrioritario;
        const prioridadeHtml = isPrioridade ? `<div style="position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:#dc3545; color:white; padding:0.2rem 0.8rem; border-radius:50px; font-size:0.75rem; font-weight:bold; box-shadow:0 2px 10px rgba(220,53,69,0.4); z-index:2; text-transform:uppercase; animation:pulse-text 1.5s infinite;">🔥 Foco Operacional</div>` : '';
        const cardStyleAdd = isPrioridade ? `box-shadow: 0 0 0 4px rgba(220,53,69,0.5); transform:scale(1.02); z-index:1;` : '';

        // Agrupamento Inteligente
        let agrupamentoHtml = '';
        if (isActive && p.telefone && phonesActive[p.telefone] > 1) {
           agrupamentoHtml = `<div style="background:#fff3cd; color:#856404; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.75rem; margin-top:0.5rem; margin-bottom:0.5rem; border:1px solid #ffeeba; font-weight:bold;">⚠️ Cliente possui ${phonesActive[p.telefone]} pedidos ativos na fila. Considere agrupar a entrega.</div>`;
        }

        // Botão Principal Dominante (Único)
        let botoesHtml = '';
        if (p.status === 'recebido') {
           botoesHtml = `<button class="btn-action btn-em_preparo" onclick="alterarStatus(${p.id}, 'em_preparo')">ENVIAR PARA PREPARO</button>`;
        } else if (p.status === 'em_preparo') {
           botoesHtml = `<button class="btn-action btn-pronto" onclick="alterarStatus(${p.id}, 'pronto')">MARCAR COMO PRONTO</button>`;
        } else if (p.status === 'pronto') {
           botoesHtml = `<button class="btn-action btn-em_entrega" onclick="alterarStatus(${p.id}, 'em_entrega')">SAIU P/ ENTREGA</button>`;
        } else if (p.status === 'em_entrega') {
           botoesHtml = `<button class="btn-action btn-entregue" onclick="alterarStatus(${p.id}, 'entregue')">CONFIRMAR RECEBIMENTO</button>`;
        }

        const pMethod = p.payment_method ? p.payment_method.toUpperCase() : 'DINHEIRO';
        const pStatusStr = p.payment_status || 'pendente';
        let pColor = pStatusStr === 'pago' ? 'green' : (pStatusStr === 'cancelado' ? '#888' : 'red');
        
        let financialInfo = `
          <div style="margin-top: 1rem; padding: 0.6rem; background: rgba(0,0,0,0.04); border-radius: 6px; font-size: 0.9rem; border: 1px solid #eee;">
            <strong style="color:#333">Pagamento:</strong> ${pMethod} 
            <span style="color: white; background: ${pColor}; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem; margin-left:0.5rem; text-transform:uppercase">${pStatusStr}</span>
        `;
        if (p.payment_status !== 'pago') {
          financialInfo += ` <button onclick="marcarPago(${p.id})" style="background:#198754;color:white;border:none;border-radius:4px;padding:0.2rem 0.6rem;font-size:0.75rem;cursor:pointer;margin-left:0.5rem;font-weight:bold;">✔ Marcar Pago</button>`;
        }
        if (p.payment_method === 'dinheiro' && p.troco_para) {
          financialInfo += `<br><span style="color:#e8420a; display:inline-block; margin-top:0.4rem; font-weight:bold;">Troco para: R$ ${Number(p.troco_para).toFixed(2).replace('.',',')} (Levar R$ ${Number(p.valor_troco || 0).toFixed(2).replace('.',',')})</span>`;
        }
        financialInfo += `</div>`;

        const isBalcao = p.tipo === 'balcao';
        const tipoBadge = isBalcao ? '🏪 Balcão' : '🛵 Delivery';

        // CRM Inteligente
        const count = parseInt(p.cliente_pedidos_count) || 1;
        let crmBadge = '';
        if (count >= 10) crmBadge = '<span style="background:linear-gradient(45deg,#ffd700,#f79d00); color:#000; font-size:0.7rem; padding:0.15rem 0.4rem; border-radius:4px; margin-left:0.5rem; font-weight:800; border:1px solid #cfaa00;">🏆 TOP CLIENTE</span>';
        else if (count >= 3) crmBadge = '<span style="background:#e3f2fd; color:#1565c0; font-size:0.7rem; padding:0.15rem 0.4rem; border-radius:4px; margin-left:0.5rem; font-weight:800; border:1px solid #90caf9;">🔄 FREQUENTE</span>';
        else if (count === 1) crmBadge = '<span style="background:#e8f5e9; color:#2e7d32; font-size:0.7rem; padding:0.15rem 0.4rem; border-radius:4px; margin-left:0.5rem; font-weight:800; border:1px solid #a5d6a7;">🌱 NOVO</span>';

        return `
          <div class="order-card status-${p.status} ${cardClassAdd}" style="position:relative; ${cardStyleAdd}">
            ${prioridadeHtml}
            <div class="order-header">
              <span class="order-id">#${p.id}</span>
              <span class="order-time">${timeStr} ${tempoHtml} ${headerBadge}</span>
              <span class="order-status-lbl">${stInfo.label}</span>
            </div>
            <div class="order-body">
              <div class="order-client" style="flex-wrap:wrap;">
                <div>
                  <strong>${p.cliente}</strong>
                  ${crmBadge}
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:nowrap;">
                  <span style="font-size:0.8rem; background:#eee; padding:0.1rem 0.4rem; border-radius:4px;">${tipoBadge}</span>
                  ${inlineBtnWhats}
                  ${inlineBtnMapa}
                  <button class="btn-icon btn-detalhes" onclick="abrirDetalhes(${p.id})" title="Detalhes Completos">🔍</button>
                </div>
              </div>
              ${agrupamentoHtml}
              <div class="order-items-container">
                ${itensHtml}
              </div>
              ${financialInfo}
            </div>
            <div class="order-footer">
              <div class="order-total">Total: R$ ${Number(p.total).toFixed(2).replace('.', ',')}</div>
              <div class="action-buttons-container">
                ${botoesHtml}
              </div>
            </div>
          </div>
        `;
      }).join('');
      
    // Renderiza Lista (Table)
    const tblBody = document.getElementById('listaPedidosTabela');
    if (tblBody) {
      tblBody.innerHTML = filtered.map(p => {
        const isActive = !['entregue', 'cancelado'].includes(p.status);
        const diffMinutes = Math.floor((new Date() - new Date(p.criado_em))/60000);
        const isAtrasado = isActive && diffMinutes >= 20;
        
        const timeStr = new Date(p.criado_em).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        const isBalcao = p.tipo === 'balcao';
        const tipoBadge = isBalcao ? '🏪 Balcão' : '🛵 Delivery';
        const stInfo = statusMap[p.status] || { label: p.status, class: '' };
        
        let actions = `<button onclick="abrirDetalhes(${p.id})" style="padding:0.2rem 0.5rem; border:none; border-radius:4px; background:#ddd; cursor:pointer;" title="Detalhes">🔍</button>`;
        const proxStatus = acoesMap[p.status] || [];
        if(proxStatus.length > 0) {
           proxStatus.forEach(st => {
             actions += ` <button onclick="alterarStatus(${p.id}, '${st}')" style="padding:0.2rem 0.5rem; border:none; border-radius:4px; background:#007bff; color:white; cursor:pointer; font-size:0.8rem" title="Mudar p/ ${statusMap[st].label}">➔ ${statusMap[st].label}</button>`;
           });
        }
        
        const pMethod = p.payment_method ? p.payment_method.toUpperCase() : 'DINHEIRO';
        const pStatusStr = p.payment_status || 'pendente';
        let pColor = pStatusStr === 'pago' ? 'green' : (pStatusStr === 'cancelado' ? '#888' : 'red');

        const count = parseInt(p.cliente_pedidos_count) || 1;
        let crmBadge = '';
        if (count >= 10) crmBadge = '<span style="background:linear-gradient(45deg,#ffd700,#f79d00); color:#000; font-size:0.6rem; padding:0.1rem 0.2rem; border-radius:4px; margin-left:0.3rem;">🏆 TOP</span>';
        else if (count >= 3) crmBadge = '<span style="background:#e3f2fd; color:#1565c0; font-size:0.6rem; padding:0.1rem 0.2rem; border-radius:4px; margin-left:0.3rem;">🔄 FREQ</span>';
        else if (count === 1) crmBadge = '<span style="background:#e8f5e9; color:#2e7d32; font-size:0.6rem; padding:0.1rem 0.2rem; border-radius:4px; margin-left:0.3rem;">🌱 NOVO</span>';

        let agrupamentoIcon = (isActive && p.telefone && phonesActive[p.telefone] > 1) ? `<span title="Cliente com múltiplos pedidos ativos" style="margin-left:0.3rem; font-size:0.8rem;">📦+</span>` : '';
        const isPrioridade = p.id === idPrioritario;

        return `
          <tr style="${isAtrasado ? 'background:rgba(220,53,69,0.05);' : ''} ${isPrioridade ? 'box-shadow:inset 4px 0 0 0 red; background:rgba(220,53,69,0.08);' : ''}">
            <td style="font-weight:bold" class="td-id">#${p.id} ${isPrioridade ? '🔥' : ''}</td>
            <td class="td-cliente"><strong>${p.cliente}</strong> ${crmBadge} ${agrupamentoIcon}</td>
            <td class="td-telefone">${p.telefone || '-'}</td>
            <td class="td-tipo"><span style="font-size:0.8rem; background:#eee; padding:0.2rem 0.4rem; border-radius:4px">${tipoBadge}</span></td>
            <td class="td-status"><span class="status-badge status-${p.status}">${stInfo.label}</span></td>
            <td class="td-tempo" style="${isAtrasado ? 'color:var(--danger); font-weight:bold' : ''}">${timeStr} ${isActive ? `(${diffMinutes}m)` : ''} ${isAtrasado ? '⚠️' : ''}</td>
            <td class="td-total" style="font-weight:bold">R$ ${Number(p.total).toFixed(2).replace('.', ',')}</td>
            <td class="td-pgto"><span style="font-size:0.8rem">${pMethod}</span> <span style="color:white; background:${pColor}; padding:0.15rem 0.3rem; border-radius:4px; font-size:0.7rem; text-transform:uppercase">${pStatusStr}</span></td>
            <td class="td-acoes">${actions}</td>
          </tr>
        `;
      }).join('');
    }
  }

  async function carregarProdutos() {
    const lista = document.getElementById('listaProdutos');
    
    try {
      const res = await fetch('/api/produtos');
      const produtos = await res.json();
      
      if (produtos.length === 0) {
        lista.innerHTML = '<tr><td colspan="5" class="loading">Nenhum produto cadastrado.</td></tr>';
        return;
      }

      lista.innerHTML = produtos.map(p => `
        <tr>
          <td>#${p.id}</td>
          <td>${p.nome}</td>
          <td>${p.categoria}</td>
          <td>R$ ${Number(p.preco).toFixed(2).replace('.', ',')}</td>
          <td><span class="status-badge status-entregue">${p.disponivel ? 'Ativo' : 'Inativo'}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
      lista.innerHTML = '<tr><td colspan="5" class="loading" style="color:red">Erro ao carregar produtos.</td></tr>';
    }
  }

  window.alterarStatus = async function(id, novoStatus) {
    if(!confirm(`Mudar pedido #${id} para ${statusMap[novoStatus] ? statusMap[novoStatus].label : 'Cancelado'}?`)) return;
    
    try {
      const res = await fetch(`/api/pedidos/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus, origem: 'admin' })
      });
      
      if (res.ok) {
        carregarPedidos();
      } else {
        alert('Erro ao atualizar status');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao atualizar status');
    }
  };

  window.abrirDetalhes = function(id) {
    const p = window.pedidosAtuais.find(x => x.id === id);
    if (!p) return;

    document.getElementById('detalheId').textContent = `#${p.id}`;
    
    let itensHtml = '<ul style="padding-left:1.5rem; margin:0.5rem 0;" class="item-list">';
    p.itens.forEach(i => {
      itensHtml += `<li><strong>${i.quantidade}x</strong> ${i.nome_produto} (R$ ${Number(i.preco_unitario).toFixed(2).replace('.', ',')})</li>`;
    });
    itensHtml += '</ul>';

    let btnWhats = '';
    if (p.telefone) {
      const rawPhone = p.telefone.replace(/\D/g, '');
      const waPhone = rawPhone.length >= 10 && !rawPhone.startsWith('55') ? '55' + rawPhone : rawPhone;
      const msg = encodeURIComponent('Olá, aqui é da Pitombo Lanches.');
      btnWhats = `<a href="https://wa.me/${waPhone}?text=${msg}" target="_blank" style="display:inline-flex; align-items:center; gap:0.4rem; padding:0.4rem 0.8rem; background:#25D366; color:#fff; text-decoration:none; border-radius:6px; font-weight:600; font-size:0.85rem; margin-top:0.4rem; box-shadow:0 2px 5px rgba(0,0,0,0.1);">💬 WhatsApp</a>`;
    }

    let btnMapa = '';
    if (p.endereco) {
      btnMapa = `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}" target="_blank" style="display:inline-flex; align-items:center; gap:0.4rem; padding:0.4rem 0.8rem; background:#1a73e8; color:#fff; text-decoration:none; border-radius:6px; font-weight:600; font-size:0.85rem; margin-top:0.4rem; margin-left:0.5rem; box-shadow:0 2px 5px rgba(0,0,0,0.1);">🗺️ Google Maps</a>`;
    }

    const html = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; font-size:0.95rem;">
        <div style="background:#f8f9fa; padding:1rem; border-radius:8px;">
          <h4 style="margin-bottom:0.8rem; color:#333; border-bottom:1px solid #ddd; padding-bottom:0.5rem;">Dados do Cliente</h4>
          <p style="margin-bottom:0.6rem; color:#555;"><strong>Nome:</strong><br><span style="color:#111; font-size:1.1rem;">${p.cliente}</span></p>
          <p style="margin-bottom:0.6rem; color:#555;"><strong>Telefone:</strong><br><span style="color:#111;">${p.telefone || 'Não informado'}</span><br>${btnWhats}</p>
          <p style="margin-bottom:0.6rem; color:#555;"><strong>Endereço:</strong><br><span style="color:#111; display:block; line-height:1.4;">${p.endereco || 'Não informado'}</span>${btnMapa}</p>
        </div>
        <div style="background:#f8f9fa; padding:1rem; border-radius:8px;">
          <h4 style="margin-bottom:0.8rem; color:#333; border-bottom:1px solid #ddd; padding-bottom:0.5rem;">Resumo do Pedido</h4>
          <p style="margin-bottom:0.6rem; color:#555;"><strong>Data:</strong><br><span style="color:#111;">${new Date(p.criado_em).toLocaleString('pt-BR')}</span></p>
          <p style="margin-bottom:0.6rem; color:#555;"><strong>Pagamento:</strong><br><span style="color:#111; font-weight:600">${p.forma_pagamento || 'N/A'}</span></p>
          <p style="margin-bottom:0.6rem; color:#555;"><strong>Status:</strong><br><span class="status-badge status-${p.status}" style="margin-top:0.2rem;">${p.status.replace('_', ' ')}</span></p>
          ${p.observacoes ? `<div style="margin-top:0.8rem; padding:0.6rem; background:#fff3cd; border-left:4px solid #ffc107; border-radius:4px;"><strong style="color:#856404;">Observações:</strong><br><span style="color:#856404;">${p.observacoes}</span></div>` : ''}
        </div>
      </div>
      <div style="margin-top:1.5rem; background:#f8f9fa; padding:1rem; border-radius:8px;">
        <h4 style="margin-bottom:0.8rem; color:#333; border-bottom:1px solid #ddd; padding-bottom:0.5rem;">Itens</h4>
        ${itensHtml}
        <div style="text-align:right; font-size:1.3rem; color:#e8420a; margin-top:1rem; padding-top:1rem; border-top:1px solid #ddd;">
          <strong>Total: R$ ${Number(p.total).toFixed(2).replace('.', ',')}</strong>
        </div>
      </div>
    `;

    document.getElementById('detalheConteudo').innerHTML = html;
    document.getElementById('modalDetalhes').style.display = 'flex';
  };

  window.fecharDetalhes = function() {
    document.getElementById('modalDetalhes').style.display = 'none';
  };

  window.marcarPago = async function(id) {
    if(!confirm(`Confirma o recebimento do pagamento para o pedido #${id}?`)) return;
    
    try {
      const res = await fetch(`/api/pedidos/${id}/pagamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: 'pago' })
      });
      if(res.ok) {
        carregarPedidos();
      } else {
        alert('Erro ao confirmar pagamento.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão.');
    }
  };

  document.getElementById('btnAtualizarPedidos').addEventListener('click', carregarPedidos);

  // ========== PDV MANUAL LOGIC ==========
  const btnAppNovoPedido = document.getElementById('btnAppNovoPedido');
  const modalPdv = document.getElementById('modalPdv');
  window.cardapioGlobal = [];
  window.pdvItens = [];
  let loadedUltimoPedido = null;

  // ==== MODO OPERADOR RÁPIDO ====
  const btnModoRapido = document.getElementById('btnModoRapido');
  if (btnModoRapido) {
     btnModoRapido.addEventListener('click', () => {
        document.body.classList.toggle('modo-rapido');
        if (document.body.classList.contains('modo-rapido')) {
           btnModoRapido.style.background = '#dc3545';
           btnModoRapido.style.boxShadow = '0 4px 0 #b02a37';
           btnModoRapido.innerText = '🔴 SAIR MODO PRESSÃO';
        } else {
           btnModoRapido.style.background = '#111';
           btnModoRapido.style.boxShadow = '0 4px 0 #000';
           btnModoRapido.innerText = '🔥 MODO PRESSÃO';
        }
     });
  }

  // ==== AUTO-PREENCHIMENTO INTELIGENTE PDV ====
  const pdvFone = document.getElementById('pdvFone');
  if (pdvFone) {
     pdvFone.addEventListener('blur', async (e) => {
        const val = e.target.value.replace(/\D/g, '');
        if (val.length >= 8) {
           try {
              const res = await fetch('/api/clientes/' + val + '/ultimo');
              if (res.ok) {
                 const data = await res.json();
                 loadedUltimoPedido = data;
                 document.getElementById('pdvSugestaoBox').style.display = 'block';
                 document.getElementById('pdvSugestaoBox').innerHTML = `
                   <div style="font-weight:bold; margin-bottom:0.4rem;">👋 Cliente Encontrado: ${data.cliente}</div>
                   <div style="margin-bottom:0.4rem; color:#444;">Último Endereço: ${data.endereco || 'Retirada'}</div>
                   <button type="button" id="btnAutoFill" style="background:#0d47a1; color:white; border:none; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.8rem;">✨ Preencher Dados</button>
                   <button type="button" id="btnAutoFillItems" style="background:#198754; color:white; border:none; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-weight:bold; margin-left:0.5rem; font-size:0.8rem;">🍔 Repetir Último Pedido</button>
                 `;
                 
                 document.getElementById('btnAutoFill').addEventListener('click', () => {
                    document.getElementById('pdvNome').value = data.cliente;
                    if (data.endereco) document.getElementById('pdvEnd').value = data.endereco;
                    if (data.forma_pagamento) document.getElementById('pdvPagto').value = data.forma_pagamento;
                 });
                 
                 document.getElementById('btnAutoFillItems').addEventListener('click', () => {
                    document.getElementById('pdvNome').value = data.cliente;
                    if (data.endereco) document.getElementById('pdvEnd').value = data.endereco;
                    if (data.forma_pagamento) document.getElementById('pdvPagto').value = data.forma_pagamento;
                    window.pdvItens = data.itens.map(i => ({
                       id: i.produto_id,
                       nome: i.nome_produto,
                       quantidade: i.quantidade,
                       preco: i.preco_unitario
                    }));
                    renderPdvItens();
                 });
              } else {
                 document.getElementById('pdvSugestaoBox').style.display = 'none';
              }
           } catch(err) { console.error('Erro ao buscar cliente', err); }
        } else {
           document.getElementById('pdvSugestaoBox').style.display = 'none';
        }
     });
  }

  async function carregarCardapioGeral() {
    try {
      const res = await fetch('/api/produtos');
      window.cardapioGlobal = await res.json();
      
      const sel = document.getElementById('pdvProdutoSelect');
      if (sel) {
        sel.innerHTML = '<option value="">-- Escolha um Produto --</option>' + window.cardapioGlobal.map(p => 
          `<option value="${p.id}" data-preco="${p.preco}">${p.nome} (R$ ${Number(p.preco).toFixed(2).replace('.',',')})</option>`
        ).join('');
      }
    } catch(err) {
      console.error('Erro ao carregar cardapio PDV', err);
    }
  }

  if (btnAppNovoPedido) {
    btnAppNovoPedido.addEventListener('click', () => {
      // Limpar form
      document.getElementById('formPdv').reset();
      window.pdvItens = [];
      renderPdvItens();
      togglePdvEnd('delivery');
      
      modalPdv.style.display = 'flex';
      
      // Carregar produtos se vazio
      if (window.cardapioGlobal.length === 0) carregarCardapioGeral();
    });
  }

  window.togglePdvEnd = function(tipo) {
    const endBox = document.getElementById('pdvEndBox');
    const endInput = document.getElementById('pdvEnd');
    if (tipo === 'balcao') {
      endBox.style.display = 'none';
      endInput.removeAttribute('required');
      endInput.value = 'Retirada no Balcão';
    } else {
      endBox.style.display = 'block';
      endInput.setAttribute('required', 'required');
      endInput.value = '';
    }
  }

  window.addPdvItem = function() {
    const sel = document.getElementById('pdvProdutoSelect');
    const qtdNode = document.getElementById('pdvProdutoQtd');
    
    if(!sel.value) return alert('Selecione um produto.');
    const q = parseInt(qtdNode.value);
    if(q < 1) return alert('Quantidade invalida');
    
    const opt = sel.options[sel.selectedIndex];
    const preco = parseFloat(opt.dataset.preco);
    const nomeOriginal = opt.text.split(' (R$')[0]; // Quick hack
    
    window.pdvItens.push({
      id: parseInt(sel.value),
      nome: nomeOriginal,
      quantidade: q,
      preco: preco
    });
    
    sel.value = "";
    qtdNode.value = "1";
    renderPdvItens();
  }

  window.removerPdvItem = function(index) {
    window.pdvItens.splice(index, 1);
    renderPdvItens();
  }

  function renderPdvItens() {
    const lista = document.getElementById('pdvItensLista');
    let total = 0;
    
    if (window.pdvItens.length === 0) {
      lista.innerHTML = '<li style="color:#999; text-align:center; padding:1rem 0;">Nenhum item adicionado ainda.</li>';
    } else {
      lista.innerHTML = window.pdvItens.map((item, idx) => {
        const sub = item.quantidade * item.preco;
        total += sub;
        return `
          <li style="display:flex; justify-content:space-between; margin-bottom:0.5rem; padding-bottom:0.5rem; border-bottom:1px dashed #ddd;">
            <span><strong>${item.quantidade}x</strong> ${item.nome}</span>
            <span>R$ ${sub.toFixed(2).replace('.',',')} <button type="button" onclick="removerPdvItem(${idx})" style="color:red; background:none; border:none; cursor:pointer;" title="Remover">❌</button></span>
          </li>
        `;
      }).join('');
    }
    
    document.getElementById('pdvTotalLabel').textContent = `R$ ${total.toFixed(2).replace('.',',')}`;
  }

  const formPdv = document.getElementById('formPdv');
  if(formPdv) {
    formPdv.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if(window.pdvItens.length === 0) return alert('Adicione pelo menos um item à venda.');
      
      const btnSalvar = document.getElementById('btnSalvarPdv');
      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Aguarde...';
      
      const total = window.pdvItens.reduce((acc, i) => acc + (i.quantidade * i.preco), 0);
      
      const payload = {
        tipo: document.getElementById('pdvTipo').value,
        cliente: document.getElementById('pdvNome').value.trim(),
        telefone: document.getElementById('pdvFone').value.trim(),
        endereco: document.getElementById('pdvEnd').value.trim() || 'Balcão',
        forma_pagamento: document.getElementById('pdvPagto').value,
        itens: window.pdvItens,
        total: total,
        observacoes: 'Pedido inserido via PDV Admin',
        troco_para: null // PDV assume recebido no caixa se dinheiro ou pendente para maquina se cartao. Simplificado no caixa.
      };
      
      try {
        const res = await fetch('/api/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if(res.ok) {
          modalPdv.style.display = 'none';
          carregarPedidos();
          // Marcar como pago se for din/cartao e for balcao?
          // Simplificado: apenas cria o pedido com pendente e o admin clica "Marcar Pago".
        } else {
          const b = await res.json();
          alert('Erro: ' + b.error);
        }
      } catch(err) {
        console.error(err);
        alert('Falha de rede.');
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = '🟢 Confirmar Venda PDV';
      }
    });
  }

  // ========== CONFIGURAÇÕES DA LOJA (WHITE LABEL) ==========
  window.carregarConfiguracoesAdmin = async function() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = await res.json();
      
      document.getElementById('cfgStoreName').value = data.store_name || '';
      document.getElementById('cfgStoreSubtitle').value = data.store_subtitle || '';
      document.getElementById('cfgColorPrimary').value = data.color_primary || '#e8420a';
      document.getElementById('cfgColorBtn').value = data.color_button_main || '#e8420a';
      document.getElementById('cfgColorPanelBg').value = data.color_panel_bg || '#f8f9fa';
      
      document.getElementById('cfgStRecebido').value = data.color_status_recebido || '#333333';
      document.getElementById('cfgStPreparo').value = data.color_status_preparo || '#ff9800';
      document.getElementById('cfgStPronto').value = data.color_status_pronto || '#e8420a';
      document.getElementById('cfgStEntrega').value = data.color_status_entrega || '#4caf50';
      document.getElementById('cfgStAtrasado').value = data.color_status_atrasado || '#dc3545';
      
      document.getElementById('cfgStorePhone').value = data.contact_whatsapp || '';
      document.getElementById('cfgStoreDomain').value = data.domain || '';
      document.getElementById('cfgAdminName').value = data.admin_display_name || '';
      document.getElementById('cfgStoreFooter').value = data.footer_text || '';
      
    } catch(err) {
      console.error('Erro ao ler configs:', err);
    }
  };

  // Preview das cores ao vivo
  const colorInputs = {
    'cfgColorPrimary': '--primary',
    'cfgColorBtn': '--btn-main',
    'cfgColorPanelBg': '--bg',
    'cfgStRecebido': '--status-recebido',
    'cfgStPreparo': '--status-preparo',
    'cfgStPronto': '--status-pronto',
    'cfgStEntrega': '--status-entrega',
    'cfgStAtrasado': '--status-atrasado',
  };
  for (const [id, cssVar] of Object.entries(colorInputs)) {
     const input = document.getElementById(id);
     if (input) {
       input.addEventListener('input', (e) => {
         document.documentElement.style.setProperty(cssVar, e.target.value);
       });
     }
  }

  const formConfig = document.getElementById('formConfig');
  if (formConfig) {
    formConfig.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSalvarConfig');
      const msg = document.getElementById('cfgStatusMsg');
      btn.disabled = true;
      btn.innerText = 'Salvando...';
      
      const formData = new FormData(formConfig);
      
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          body: formData // Fetch com FormData envia multipart/form-data automaticamente
        });
        
        if (res.ok) {
           msg.style.color = 'green';
           msg.innerText = '✅ Identidade da Loja salva com sucesso! Atualizando sistema...';
           setTimeout(() => {
              window.location.reload();
           }, 1500);
        } else {
           const err = await res.json();
           msg.style.color = 'red';
           msg.innerText = '❌ Erro: ' + err.error;
           btn.disabled = false;
           btn.innerText = '💾 Salvar Identidade da Marca';
        }
      } catch(err) {
        msg.style.color = 'red';
        msg.innerText = '❌ Falha de rede ao salvar.';
        btn.disabled = false;
        btn.innerText = '💾 Salvar Identidade da Marca';
      }
    });
  }

  // Inicializa e realiza polling para o admin também ser responsivo
  carregarPedidos();
  setInterval(carregarPedidos, 10000);
});
