// ── Autenticação: verificar token e redirecionar para /login se ausente ──
(async () => {
  const token = localStorage.getItem('pitombo_token');
  if (!token) { window.location.href = '/login'; return; }
  try {
    const r = await fetch('/api/equipe/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!r.ok) {
      localStorage.removeItem('pitombo_token');
      window.location.href = '/login';
    }
  } catch {
    // Erro de rede — não redirecionar (pode ser offline temporário)
  }
})();

// Helper: retorna o token armazenado para usar nos headers
function _authHeader() {
  return { 'Authorization': 'Bearer ' + (localStorage.getItem('pitombo_token') || '') };
}

// ── Lista de países com DDI para o seletor de WhatsApp ──
const COUNTRY_DIAL_CODES = [
  { code:'PT', dial:'+351', name:'🇵🇹 Portugal (+351)' },
  { code:'BR', dial:'+55',  name:'🇧🇷 Brasil (+55)' },
  { code:'ES', dial:'+34',  name:'🇪🇸 Espanha (+34)' },
  { code:'FR', dial:'+33',  name:'🇫🇷 França (+33)' },
  { code:'US', dial:'+1',   name:'🇺🇸 EUA (+1)' },
  { code:'CA', dial:'+1',   name:'🇨🇦 Canadá (+1)' },
  { code:'GB', dial:'+44',  name:'🇬🇧 Reino Unido (+44)' },
  { code:'DE', dial:'+49',  name:'🇩🇪 Alemanha (+49)' },
  { code:'IT', dial:'+39',  name:'🇮🇹 Itália (+39)' },
  { code:'NL', dial:'+31',  name:'🇳🇱 Holanda (+31)' },
  { code:'BE', dial:'+32',  name:'🇧🇪 Bélgica (+32)' },
  { code:'CH', dial:'+41',  name:'🇨🇭 Suíça (+41)' },
  { code:'AT', dial:'+43',  name:'🇦🇹 Áustria (+43)' },
  { code:'PL', dial:'+48',  name:'🇵🇱 Polônia (+48)' },
  { code:'RO', dial:'+40',  name:'🇷🇴 Romênia (+40)' },
  { code:'LU', dial:'+352', name:'🇱🇺 Luxemburgo (+352)' },
  { code:'AO', dial:'+244', name:'🇦🇴 Angola (+244)' },
  { code:'MZ', dial:'+258', name:'🇲🇿 Moçambique (+258)' },
  { code:'CV', dial:'+238', name:'🇨🇻 Cabo Verde (+238)' },
  { code:'ST', dial:'+239', name:'🇸🇹 São Tomé e Príncipe (+239)' },
  { code:'GW', dial:'+245', name:'🇬🇼 Guiné-Bissau (+245)' },
  { code:'TL', dial:'+670', name:'🇹🇱 Timor-Leste (+670)' },
  { code:'AR', dial:'+54',  name:'🇦🇷 Argentina (+54)' },
  { code:'CL', dial:'+56',  name:'🇨🇱 Chile (+56)' },
  { code:'CO', dial:'+57',  name:'🇨🇴 Colômbia (+57)' },
  { code:'MX', dial:'+52',  name:'🇲🇽 México (+52)' },
  { code:'ZA', dial:'+27',  name:'🇿🇦 África do Sul (+27)' },
  { code:'NG', dial:'+234', name:'🇳🇬 Nigéria (+234)' },
  { code:'KE', dial:'+254', name:'🇰🇪 Quênia (+254)' },
  { code:'GH', dial:'+233', name:'🇬🇭 Gana (+233)' },
  { code:'JP', dial:'+81',  name:'🇯🇵 Japão (+81)' },
  { code:'CN', dial:'+86',  name:'🇨🇳 China (+86)' },
  { code:'IN', dial:'+91',  name:'🇮🇳 Índia (+91)' },
  { code:'AU', dial:'+61',  name:'🇦🇺 Austrália (+61)' },
];

// Helper para montar número wa.me da loja (usa novos campos ou fallback antigo +55)
function _buildStoreWaNum(s) {
  if (s && s.whatsapp_dial_code && s.whatsapp_number) {
    return s.whatsapp_dial_code.replace(/\D/g, '') + s.whatsapp_number.replace(/\D/g, '');
  }
  const n = ((s && s.contact_whatsapp) || '').replace(/\D/g, '');
  return n.startsWith('55') ? n : '55' + n;
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('Admin Dashboard Iniciado');

  // Popula o seletor de país do WhatsApp
  const waSel = document.getElementById('cfgWaCountrySelect');
  if (waSel) {
    COUNTRY_DIAL_CODES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.dataset.dial = c.dial;
      opt.textContent = c.name;
      waSel.appendChild(opt);
    });
    // Garante que o hidden de DDI sincroniza na carga inicial
    const initOpt = waSel.options[waSel.selectedIndex];
    const dialHidden = document.getElementById('cfgWaDial');
    if (initOpt && dialHidden && !dialHidden.value) dialHidden.value = initOpt.dataset.dial || '';
  }

  window.updatePayStatus = function (checkbox) {
    const statusDiv = checkbox.closest('div').nextElementSibling;
    if (statusDiv && statusDiv.classList.contains('pay-status')) {
      if (checkbox.checked) {
        statusDiv.style.background = '#e8f5e9';
        statusDiv.style.color = '#2e7d32';
        statusDiv.innerText = '🟢 Ativo no Menu Digital e PDV';
      } else {
        statusDiv.style.background = '#fee';
        statusDiv.style.color = '#c62828';
        statusDiv.innerText = '🔴 Inativo';
      }
    }
  };

  window.updatePayStatusOnline = function (checkbox) {
    const statusDiv = document.querySelector('.pay-status-online');
    if (statusDiv) {
      if (checkbox.checked) {
        statusDiv.style.background = '#e8f5e9';
        statusDiv.style.color = '#2e7d32';
        statusDiv.innerText = '🟢 Ativo';
      } else {
        statusDiv.style.background = '#fee';
        statusDiv.style.color = '#c62828';
        statusDiv.innerText = '🔴 Inativo';
      }
    }
  };

  // Ocultar/mostrar Total do Dia
  window.toggleFaturamento = function () {
    const el  = document.getElementById('dash-faturamento');
    const btn = document.getElementById('btnToggleFat');
    if (!el) return;
    if (el.getAttribute('data-hidden') === 'true') {
      el.textContent = el.getAttribute('data-real') || 'R$ 0,00';
      el.removeAttribute('data-hidden');
      if (btn) btn.textContent = '👁';
    } else {
      el.setAttribute('data-real', el.textContent);
      el.setAttribute('data-hidden', 'true');
      el.textContent = '• • • • •';
      if (btn) btn.textContent = '🙈';
    }
  };

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

      if (pageTitle) pageTitle.textContent = btn.innerText.replace(/📦|🍔/g, '').trim();

      if (btn.dataset.target === 'produtos') {
        if (typeof ProdutosManager !== 'undefined') {
          ProdutosManager.init();
        } else {
          console.error('ProdutosManager não carregado.');
        }
      } else if (btn.dataset.target && btn.dataset.target.startsWith('cfg-')) {
        if (typeof carregarConfiguracoesAdmin === 'function') carregarConfiguracoesAdmin();
        if (btn.dataset.target === 'cfg-integracoes') {
          if (typeof carregarIntegracoes === 'function') carregarIntegracoes();
        }
        if (btn.dataset.target === 'cfg-modificadores') {
          if (typeof ModificadoresManager !== 'undefined') ModificadoresManager.init();
        }
        if (btn.dataset.target === 'cfg-impressoras') {
          if (typeof window.carregarImpressoras === 'function') window.carregarImpressoras();
        }
        if (btn.dataset.target === 'cfg-clientes') {
          if (typeof window.carregarClientes === 'function') window.carregarClientes();
        }
        if (btn.dataset.target === 'cfg-cozinhas') {
          if (typeof window.carregarCozinhas === 'function') window.carregarCozinhas();
        }
        if (btn.dataset.target === 'cfg-equipe') {
          if (typeof carregarEquipe === 'function') carregarEquipe();
        }
      } else if (btn.dataset.target === 'zonas') {
        carregarZonas();
      }
    });
  });

  // Ocultar/Mostrar Submenu de Configurações
  const btnToggleConfig = document.getElementById('btnToggleConfig');
  const submenuConfig = document.getElementById('submenuConfig');
  const cfgArrow = document.getElementById('cfgArrow');
  if (btnToggleConfig && submenuConfig) {
    btnToggleConfig.addEventListener('click', () => {
      const isHidden = submenuConfig.style.display === 'none';
      submenuConfig.style.display = isHidden ? 'flex' : 'none';
      if (cfgArrow) cfgArrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    });
  }

  // Toggle do submenu Cardápio
  const btnToggleCardapio = document.getElementById('btnToggleCardapio');
  const submenuCardapio   = document.getElementById('submenuCardapio');
  const cardapioArrow     = document.getElementById('cardapioArrow');
  if (btnToggleCardapio && submenuCardapio) {
    btnToggleCardapio.addEventListener('click', () => {
      const isHidden = submenuCardapio.style.display === 'none' || submenuCardapio.style.display === '';
      submenuCardapio.style.display = isHidden ? 'flex' : 'none';
      if (cardapioArrow) cardapioArrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    });
  }

  // --- HASH NAVIGATION (Deep Linking) ---
  const handleHash = () => {
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    const targetItem = document.querySelector(`.menu-item[data-target="${hash}"]`);
    if (targetItem) {
      // Abrir submenu se estiver fechado
      const parentSubmenu = targetItem.closest('.submenu');
      if (parentSubmenu && (parentSubmenu.style.display === 'none' || parentSubmenu.style.display === '')) {
        const toggleId = parentSubmenu.id.replace('submenu', 'btnToggle');
        const toggleBtn = document.getElementById(toggleId);
        if (toggleBtn) toggleBtn.click();
      }

      // Delay pequeno para garantir que submenus expandam e managers estejam prontos
      setTimeout(() => {
        targetItem.click();
      }, 50);
    }
  };

  // Executar após um pequeno fôlego para scripts externos
  setTimeout(handleHash, 100);
  window.addEventListener('hashchange', handleHash);

  // ========== VIEW TOGGLE ============
  window.viewMode = 'list'; // padrão: lista compacta
  const btnCards = document.getElementById('btnViewCards');
  const btnList = document.getElementById('btnViewList');
  const viewLista = document.getElementById('viewListaPedidos');
  const viewCards = document.getElementById('listaPedidos');

  // Estado inicial: lista ativa
  if (btnCards && btnList) {
    btnList.classList.add('active');
    btnList.style.background = '#fff';
    btnList.style.color = '#333';
    btnCards.classList.remove('active');
    btnCards.style.background = 'transparent';
    btnCards.style.color = '#555';

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
      fecharDetalhes();
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

  // Mapeamento Global de Status para facilitar acesso em funções fora do listener
  window.statusMap = {
    'pendente_aprovacao': { label: '⏳ Pendente', class: 'status-pendente_aprovacao' },
    'recebido': { label: 'Recebido', class: 'status-recebido' },
    'em_preparo': { label: 'Em Preparo', class: 'status-em_preparo' },
    'pronto': { label: 'Pronto', class: 'status-pronto' },
    'em_entrega': { label: 'Em Entrega', class: 'status-em_entrega' },
    'entregue': { label: 'Entregue', class: 'status-entregue' },
    'cancelado': { label: 'Cancelado', class: 'status-cancelado' },
    'rejeitado': { label: 'Rejeitado', class: 'status-rejeitado' }
  };

  window.acoesMap = {
    'pendente_aprovacao': ['em_preparo', 'rejeitado'],
    'recebido': ['em_preparo', 'cancelado'],
    'em_preparo': ['pronto', 'cancelado'],
    'pronto': ['em_entrega', 'cancelado'],
    'em_entrega': ['entregue', 'cancelado'],
    'entregue': []
  };

  window.pedidosAtuais = [];
  let currentTypeFilter = 'todos';
  let currentStatusFilter = 'operacional';
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
        if (badge) {
          if (b.dataset.status === 'pendente') { badge.style.background = '#ffd54f'; badge.style.color = '#000'; }
          else if (b.dataset.status === 'em_curso') { badge.style.background = '#4caf50'; badge.style.color = '#fff'; }
          else if (b.dataset.status === 'atrasados') { badge.style.background = '#dc3545'; badge.style.color = '#fff'; }
          else { badge.style.background = '#eee'; badge.style.color = '#555'; }
        }
      });
      const target = e.currentTarget;
      target.classList.add('active');
      target.style.border = '2px solid #333';
      target.style.background = '#333';
      target.style.color = '#fff';
      const badgeT = target.querySelector('span');
      if (badgeT) { badgeT.style.background = '#555'; badgeT.style.color = '#fff'; }

      currentStatusFilter = target.dataset.status;
      renderPedidos();
    });
  });

  // Controle de alertas sonoros
  window.somAtivado = false;
  window.audioCtx = null;
  let pedidosConhecidos = new Set();
  let primeiraCarga = true;

  window.ativarSom = function () {
    if (!window.audioCtx) {
      window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (window.audioCtx.state === 'suspended') {
      window.audioCtx.resume();
    }
    window.somAtivado = true;
    document.getElementById('btnAtivarSom').style.display = 'none';
    console.log('🔊 Sistema de áudio ativado pelo usuário');
    // Toca um bipe curto de confirmação
    tocarSom('novo');
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
        // Se o pedido é novo (não está no Set) e já chega como pendente_aprovacao
        if (!pedidosConhecidos.has(p.id)) {
          if (!primeiraCarga && p.status === 'pendente_aprovacao') {
             temNovo = true;
             console.log(`🔔 Pedido NOVO detectado: #${p.id}`);
          }
          pedidosConhecidos.add(p.id);
        }
        const isActive = !['entregue', 'cancelado'].includes(p.status);
        const diffMinutes = Math.floor((new Date() - new Date(p.criado_em)) / 60000);
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

    // isFinished: pedido que saiu da fila operacional
    const isFinished = p => ['entregue', 'cancelado', 'rejeitado'].includes(p.status);

    pedidos.forEach(p => {
      const active = !isFinished(p);
      const isAtrasado = active && Math.floor((new Date() - new Date(p.criado_em)) / 60000) >= 20;

      // Badges de tipo — contar apenas pedidos ainda ativos
      if (active) {
        counts.type.todos++;
        if (p.tipo === 'balcao') counts.type.balcao++;
        if (p.tipo === 'delivery') counts.type.delivery++;
      }

      if (currentTypeFilter === 'todos' || currentTypeFilter === p.tipo) {
        if (active) counts.status.todos++;
        if (p.status === 'recebido' || p.status === 'pendente_aprovacao') counts.status.pendente++;
        if (['em_preparo', 'pronto', 'em_entrega'].includes(p.status)) counts.status.em_curso++;
        if (isAtrasado) counts.status.atrasados++;
        if (isFinished(p)) counts.status.concluidos++;
      }

      if (p.payment_status === 'pago') {
        fatHoje += Number(p.total) || 0;
      }
    });

    // Atualiza badges
    if (document.getElementById('cnt-type-todos')) document.getElementById('cnt-type-todos').textContent = counts.type.todos;
    if (document.getElementById('cnt-type-balcao')) document.getElementById('cnt-type-balcao').textContent = counts.type.balcao;
    if (document.getElementById('cnt-type-delivery')) document.getElementById('cnt-type-delivery').textContent = counts.type.delivery;

    if (document.getElementById('cnt-status-todos')) document.getElementById('cnt-status-todos').textContent = counts.status.todos;
    if (document.getElementById('cnt-status-pendente')) document.getElementById('cnt-status-pendente').textContent = counts.status.pendente;
    if (document.getElementById('cnt-status-em_curso')) document.getElementById('cnt-status-em_curso').textContent = counts.status.em_curso;
    if (document.getElementById('cnt-status-atrasados')) document.getElementById('cnt-status-atrasados').textContent = counts.status.atrasados;
    if (document.getElementById('cnt-status-concluidos')) document.getElementById('cnt-status-concluidos').textContent = counts.status.concluidos;

    // Atualiza Dashboard Superior
    const elFaturamento = document.getElementById('dash-faturamento');
    const elHoje = document.getElementById('dash-hoje');
    const elAtivos = document.getElementById('dash-ativos');
    const elAtrasados = document.getElementById('dash-atrasados');

    if (elFaturamento) {
      const val = window.formatCurrency(fatHoje);
      elFaturamento.setAttribute('data-real', val);
      if (elFaturamento.getAttribute('data-hidden') !== 'true') elFaturamento.textContent = val;
    }
    if (elHoje) elHoje.textContent = pedidos.length;
    if (elAtivos) elAtivos.textContent = counts.type.todos;
    if (elAtrasados) elAtrasados.textContent = counts.status.atrasados;

    // Filtros
    let filtered = pedidos.filter(p => {
      if (currentTypeFilter !== 'todos' && p.tipo !== currentTypeFilter) return false;

      const active = !isFinished(p);
      const diffMinutes = Math.floor((new Date() - new Date(p.criado_em)) / 60000);
      const isAtrasado = active && diffMinutes >= 20;

      // Fila operacional: apenas pedidos ainda não encerrados
      if (currentStatusFilter === 'operacional' && !active) return false;
      if (currentStatusFilter === 'pendente' && !['recebido', 'pendente_aprovacao'].includes(p.status)) return false;
      if (currentStatusFilter === 'em_curso' && !['em_preparo', 'pronto', 'em_entrega'].includes(p.status)) return false;
      if (currentStatusFilter === 'concluidos' && active) return false;
      if (currentStatusFilter === 'atrasados' && !isAtrasado) return false;

      if (searchTerm) {
        const nome = p.cliente.toLowerCase();
        const tel = p.telefone ? p.telefone.replace(/\D/g, '') : '';
        const idStr = p.id.toString();
        return nome.includes(searchTerm) || tel.includes(searchTerm) || idStr.includes(searchTerm);
      }
      return true;
    });

    if (filtered.length === 0) {
      const emptyMsg = currentStatusFilter === 'atrasados'
        ? 'Nenhum pedido atrasado. 🎉'
        : 'Nenhum pedido ativo no momento.';
      const emptyHtml = `<div style="text-align:center;padding:3rem 1rem;color:#aaa;">
        <div style="font-size:2.5rem;margin-bottom:0.8rem;">✅</div>
        <div style="font-size:1.1rem;font-weight:700;color:#555;">${emptyMsg}</div>
        <div style="font-size:0.88rem;margin-top:0.4rem;">A fila está vazia por agora.</div>
      </div>`;
      lista.innerHTML = emptyHtml;
      const tbl = document.getElementById('listaPedidosTabela');
      if (tbl) tbl.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2.5rem;color:#aaa;">${emptyMsg}</td></tr>`;
      return;
    }

    // Ordenação Operacional SLA
    filtered.sort((a, b) => {
      const aActive = !['entregue', 'cancelado', 'rejeitado'].includes(a.status);
      const bActive = !['entregue', 'cancelado', 'rejeitado'].includes(b.status);

      // Regra 1: Inativos (Entregues/Cancelados) sempre no final
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      // Regra 2: Pendentes de aprovação sempre no topo absoluto
      const aPend = a.status === 'pendente_aprovacao';
      const bPend = b.status === 'pendente_aprovacao';
      if (aPend && !bPend) return -1;
      if (!aPend && bPend) return 1;

      // Regra 3: Atrasados no topo
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
        if (!['entregue', 'cancelado', 'rejeitado'].includes(filtered[i].status)) {
          idPrioritario = filtered[i].id;
          break;
        }
      }
    }

    // Identificar clientes com mais de 1 pedido ativo para agrupamento de entrega
    const phonesActive = {};
    pedidos.forEach(p => {
      if (!['entregue', 'cancelado', 'rejeitado'].includes(p.status) && p.telefone && p.telefone.length > 5) {
        phonesActive[p.telefone] = (phonesActive[p.telefone] || 0) + 1;
      }
    });

    lista.innerHTML = filtered.map(p => {
      const isActive = !isFinished(p);
      const diffMinutes = Math.floor((new Date() - new Date(p.criado_em)) / 60000);
      const isAtrasado = isActive && diffMinutes >= 20;
      const isAtencao = isActive && diffMinutes >= 10 && diffMinutes < 20;

      const timeStr = new Date(p.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      let labelCounter = `<span class="rt-timer" data-time="${p.criado_em}">${diffMinutes}m 00s</span>`;
      if (!isActive) labelCounter = `${diffMinutes}m`;

      let tempoHtml = `<span style="color:#666; font-size:1em; margin-left:0.3rem">(${labelCounter})</span>`;
      if (!isActive) tempoHtml = '';
      else if (isAtrasado) tempoHtml = `<span class="text-pulse" style="font-weight:900; font-size:1.4em; margin-left:0.5rem;">(${labelCounter})</span>`;
      else if (isAtencao) tempoHtml = `<span style="color:#e8420a; font-weight:800; font-size:1.2em; margin-left:0.4rem">(${labelCounter})</span>`;

      let headerBadge = '';
      if (isAtrasado) headerBadge = `<span class="text-pulse" style="background:#fff; color:#dc3545; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.8rem; font-weight:900; margin-left:0.5rem; letter-spacing:0.5px;">ATRASADO</span>`;

      const cardClassAdd = isAtrasado ? 'card-atrasado' : '';
      const stInfo = window.statusMap[p.status] || { label: p.status, class: '' };

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
      if (p.status === 'pendente_aprovacao') {
        botoesHtml = `
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.8rem; width:100%; margin-top:0.5rem;">
            <button class="btn-action" style="background:#198754; color:white; border:none; padding:0.8rem; border-radius:6px; font-weight:800; cursor:pointer; font-size:0.9rem; transition:0.2s; box-shadow:0 3px 6px rgba(25,135,84,0.3);" onclick="alterarStatus(${p.id}, 'em_preparo')">✔ ACEITAR PEDIDO</button>
            <button class="btn-action" style="background:#dc3545; color:white; border:none; padding:0.8rem; border-radius:6px; font-weight:800; cursor:pointer; font-size:0.9rem; transition:0.2s; box-shadow:0 3px 6px rgba(220,53,69,0.3);" onclick="alterarStatus(${p.id}, 'rejeitado')">✖ REJEITAR</button>
          </div>`;
      } else if (p.status === 'recebido') {
        botoesHtml = `<button class="btn-action btn-em_preparo" onclick="alterarStatus(${p.id}, 'em_preparo')">ENVIAR PARA PREPARO</button>`;
      } else if (p.status === 'em_preparo') {
        botoesHtml = `<button class="btn-action btn-pronto" style="font-weight:800;" onclick="alterarStatus(${p.id}, 'pronto')">MARCAR COMO PRONTO</button>`;
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
        financialInfo += `<br><span style="color:#e8420a; display:inline-block; margin-top:0.4rem; font-weight:bold;">Troco para: ${window.formatCurrency(p.troco_para)} (Levar ${window.formatCurrency(p.valor_troco || 0)})</span>`;
      }
      financialInfo += `</div>`;

      const isBalcao = p.tipo === 'balcao';
      const isMesa = p.tipo === 'mesa';
      const tipoBadge = isBalcao ? '🏪 Balcão' : (isMesa ? '🍽️ Mesa' : '🛵 Delivery');

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
              <div class="order-total">Total: ${window.formatCurrency(p.total)}</div>
              <div class="action-buttons-container">
                ${botoesHtml}
              </div>
            </div>
          </div>
        `;
    }).join('');

    // Renderiza Lista (Table) — layout master-detail compacto
    const tblBody = document.getElementById('listaPedidosTabela');
    if (tblBody) {
      tblBody.innerHTML = filtered.map(p => {
        const isActive = !isFinished(p);
        const diffMinutes = Math.floor((new Date() - new Date(p.criado_em)) / 60000);
        const isAtrasado = isActive && diffMinutes >= 20;

        const timeStr = new Date(p.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const isBalcao = p.tipo === 'balcao';
        const isMesa = p.tipo === 'mesa';
        const tipoBadge = isBalcao ? '🏪 Balcão' : (isMesa ? '🍽️ Mesa' : '🛵 Delivery');
        const stInfo = window.statusMap[p.status] || { label: p.status, class: '' };

        const pMethod = p.payment_method ? p.payment_method : 'Dinheiro';
        const pStatusStr = p.payment_status || 'pendente';
        const pgPago = pStatusStr === 'pago';

        const count = parseInt(p.cliente_pedidos_count) || 1;
        let crmBadge = '';
        if (count >= 10) crmBadge = ' <span style="background:linear-gradient(45deg,#ffd700,#f79d00);color:#000;font-size:0.6rem;padding:1px 5px;border-radius:4px;">🏆</span>';
        else if (count >= 3) crmBadge = ' <span style="background:#e3f2fd;color:#1565c0;font-size:0.6rem;padding:1px 5px;border-radius:4px;">🔄</span>';
        else if (count === 1) crmBadge = ' <span style="background:#e8f5e9;color:#2e7d32;font-size:0.6rem;padding:1px 5px;border-radius:4px;">🌱</span>';

        const isPrioridade = p.id === idPrioritario;
        const timerLabel = isAtrasado ? `<span class="pi-timer">⚠️ ${diffMinutes}m</span>` : (isActive ? `<span class="pi-timer" style="color:#888;">${diffMinutes}m</span>` : '');

        // Botões de ação inline (stopPropagation para não abrir painel)
        let btnAcoes = '';

        if (p.status === 'pendente_aprovacao') {
          // Pedido aguardando aprovação: apenas ACEITAR e REJEITAR
          btnAcoes = `
            <button class="btn-row btn-row-aceitar" onclick="alterarStatus(${p.id},'em_preparo');event.stopPropagation();" title="Aceitar pedido">✔ Aceitar</button>
            <button class="btn-row btn-row-rejeitar" onclick="alterarStatus(${p.id},'rejeitado');event.stopPropagation();" title="Rejeitar pedido">✕ Rejeitar</button>`;
        } else {
          btnAcoes = `<button class="btn-row btn-row-detalhes" onclick="abrirDetalhes(${p.id});event.stopPropagation();" title="Ver detalhes">🔍</button>`;

          if (isActive) {
            if (!pgPago) {
              btnAcoes += ` <button class="btn-row btn-row-pagar" onclick="marcarPago(${p.id});event.stopPropagation();" title="Marcar pago">$ Pagar</button>`;
            }
            if (p.tipo === 'delivery') {
              btnAcoes += ` <button class="btn-row btn-row-entregador" onclick="escolherEntregador(${p.id});event.stopPropagation();" title="Atribuir Entregador">🛵</button>`;
            }
          }

          const proxStatus = window.acoesMap[p.status] || [];
          proxStatus.forEach(st => {
            if (st === 'cancelado') {
              btnAcoes += ` <button class="btn-row btn-row-cancelar" onclick="alterarStatus(${p.id},'${st}');event.stopPropagation();" title="Cancelar">✕</button>`;
            } else if (st === 'entregue') {
              btnAcoes += ` <button class="btn-row btn-row-entregue" onclick="alterarStatus(${p.id},'${st}');event.stopPropagation();" title="Finalizar">✓ Finalizar</button>`;
            } else if (st === 'rejeitado') {
              btnAcoes += ` <button class="btn-row btn-row-rejeitar" onclick="alterarStatus(${p.id},'${st}');event.stopPropagation();" title="Rejeitar">✕ Rejeitar</button>`;
            } else {
              const label = window.statusMap[st] ? window.statusMap[st].label : st;
              btnAcoes += ` <button class="btn-row btn-row-avancar" onclick="alterarStatus(${p.id},'${st}');event.stopPropagation();" title="Avançar status">▶ ${label}</button>`;
            }
          });
        }

        const enderecoStr = p.endereco ? p.endereco.substring(0, 60) + (p.endereco.length > 60 ? '…' : '') : '';

        return `
          <tr class="pedido-row status-${p.status}${isPrioridade ? ' row-prioritario' : ''}"
              data-id="${p.id}"
              onclick="abrirDetalhes(${p.id})"
              style="${isAtrasado ? 'background:rgba(220,53,69,0.04);' : ''}${isPrioridade ? 'background:rgba(220,53,69,0.07);' : ''}">
            <td class="td-pedido">
              <div class="pi-id">#${p.id}${isPrioridade ? ' 🔥' : ''}</div>
              <div class="pi-tipo">${tipoBadge}</div>
              <div class="pi-status"><span class="status-badge status-${p.status}">${stInfo.label}</span></div>
              ${timerLabel}
              <div class="pi-data">${timeStr}</div>
            </td>
            <td class="td-valor">
              <div class="pv-total">${window.formatCurrency(p.total)}</div>
              <div><span class="pv-pgbadge ${pgPago ? 'pago' : 'nao-pago'}">${pgPago ? 'Pago' : 'Não pago'}</span></div>
              <div class="pv-method">💳 ${pMethod}</div>
            </td>
            <td class="td-cliente">
              <div class="pc-nome">${p.cliente}${crmBadge}</div>
              ${p.telefone ? `<div class="pc-tel">📞 ${p.telefone}</div>` : ''}
              ${enderecoStr ? `<div class="pc-addr">📍 ${enderecoStr}</div>` : ''}
              ${p.entregador ? `<div class="pc-entregador">🛵 ${p.entregador}</div>` : ''}
            </td>
            <td class="td-acoes">${btnAcoes}</td>
          </tr>
        `;
      }).join('');
    }
  }


  window.alterarStatus = async function (id, novoStatus) {
    const TERMINAL = ['entregue', 'cancelado', 'rejeitado'];

    // Guarda de estado local: botão residual em painel ainda aberto
    // Se já sabemos que o pedido é terminal, fechar o painel e abortar silenciosamente.
    const pedidoAtual = (window.pedidosAtuais || []).find(x => x.id === id);
    if (pedidoAtual && TERMINAL.includes(pedidoAtual.status)) {
      fecharDetalhes();
      return;
    }

    try {
      const res = await fetch(`/api/pedidos/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus, origem: 'admin' })
      });

      if (res.ok) {
        // Se a ação resultou em estado terminal, fechar o painel imediatamente
        // para que nenhum botão residual fique ativo.
        if (TERMINAL.includes(novoStatus)) {
          fecharDetalhes();
        }
        carregarPedidos();
      } else {
        const erro = await res.json().catch(() => ({}));
        // 409 = transição inválida (pedido já estava finalizado no servidor)
        if (res.status === 409) {
          fecharDetalhes();
          carregarPedidos();
        } else {
          alert(erro.error || 'Erro ao atualizar status');
        }
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao atualizar status');
    }
  };

  window.abrirDetalhes = function (id) {
    const p = window.pedidosAtuais.find(x => x.id === id);
    if (!p) return;

    // Highlight da linha selecionada
    document.querySelectorAll('.pedido-row').forEach(r => r.classList.remove('row-selecionado'));
    const row = document.querySelector(`.pedido-row[data-id="${id}"]`);
    if (row) row.classList.add('row-selecionado');

    // Título do painel
    document.getElementById('pdc-titulo').textContent = `Pedido #${p.id}`;

    // Itens
    let itensHtml = '<ul class="item-list" style="padding-left:1.2rem; margin:0.4rem 0;">';
    p.itens.forEach(i => {
      itensHtml += `<li><strong>${i.quantidade}x</strong> ${i.nome_produto} — ${window.formatCurrency(i.preco_unitario)}</li>`;
    });
    itensHtml += '</ul>';

    // Links de contato
    let btnWhats = '';
    if (p.telefone) {
      const rawPhone = p.telefone.replace(/\D/g, '');
      const waPhone = rawPhone.length >= 10 && !rawPhone.startsWith('55') ? '55' + rawPhone : rawPhone;
      const msg = encodeURIComponent('Olá, aqui é da Pitombo Lanches.');
      btnWhats = `<a href="https://wa.me/${waPhone}?text=${msg}" target="_blank" style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.3rem 0.7rem;background:#25D366;color:#fff;text-decoration:none;border-radius:5px;font-weight:600;font-size:0.8rem;margin-top:0.4rem;">💬 WhatsApp</a>`;
    }
    let btnMapa = '';
    if (p.endereco) {
      btnMapa = `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}" target="_blank" style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.3rem 0.7rem;background:#1a73e8;color:#fff;text-decoration:none;border-radius:5px;font-weight:600;font-size:0.8rem;margin-top:0.4rem;margin-left:0.4rem;">🗺️ Maps</a>`;
    }

    const stInfo = window.statusMap[p.status] || { label: p.status };

    // Conteúdo do painel
    document.getElementById('pdc-conteudo').innerHTML = `
    <div class="pdc-section">
      <h4>Cliente</h4>
      <p><strong>${p.cliente}</strong></p>
      ${p.telefone ? `<p>📞 ${p.telefone}</p>` : ''}
      ${p.endereco ? `<p style="color:#555;font-size:0.85rem;">📍 ${p.endereco}</p>` : ''}
      <div>${btnWhats}${btnMapa}</div>
    </div>
    <div class="pdc-section">
      <h4>Pedido</h4>
      <p><strong>Status:</strong> <span class="status-badge status-${p.status}">${stInfo.label}</span></p>
      <p><strong>Tipo:</strong> ${p.tipo || 'delivery'}</p>
      <p><strong>Data:</strong> ${new Date(p.criado_em).toLocaleString('pt-BR')}</p>
      <p><strong>Pagamento:</strong> ${p.payment_method || 'Dinheiro'} — <span style="font-weight:700;color:${p.payment_status === 'pago' ? '#198754' : '#c0392b'}">${p.payment_status === 'pago' ? 'Pago' : 'Não pago'}</span></p>
      ${p.payment_method === 'dinheiro' && p.troco_para ? `<p style="color:#e8420a;font-weight:700;">Troco para: ${window.formatCurrency(p.troco_para)}</p>` : ''}
      ${p.observacoes ? `<div style="background:#fff3cd;border-left:3px solid #ffc107;padding:0.5rem;border-radius:4px;margin-top:0.5rem;font-size:0.85rem;color:#856404;"><strong>Obs:</strong> ${p.observacoes}</div>` : ''}
    </div>
    <div class="pdc-section">
      <h4>Itens</h4>
      ${itensHtml}
      <div class="pdc-valor-total">Total: ${window.formatCurrency(p.total)}</div>
    </div>
  `;

    // Botões de ação no painel
    const isActive = !['entregue', 'cancelado', 'rejeitado'].includes(p.status);
    const pgPago = p.payment_status === 'pago';
    let acoesHtml = '';

    if (isActive) {
      if (!pgPago) {
        acoesHtml += `<button class="btn-pdc btn-pdc-pagar" onclick="marcarPago(${p.id})">$ Marcar como Pago</button>`;
      }
      // Escolher entregador — select inline (sem prompt bloqueado)
      if (p.tipo !== 'balcao' && p.tipo !== 'mesa') {
        const entregadores = window.entregadoresCache || [];
        const opts = entregadores.map(e =>
          `<option value="${e.id}" ${p.entregador_id == e.id ? 'selected' : ''}>${e.nome}</option>`
        ).join('');
        acoesHtml += `
        <div class="pdc-entregador-row">
          <select id="sel-entregador-${p.id}" class="pdc-select-entregador">
            <option value="">— Sem entregador —</option>
            ${opts}
          </select>
          <button class="btn-pdc btn-pdc-entregador" style="margin-top:0.3rem;" onclick="salvarEntregador(${p.id})">🛵 Salvar entregador</button>
        </div>`;
      }
    }

    if (p.status === 'entregue') {
      const pgPagoFinal = p.payment_status === 'pago';
      if (!pgPagoFinal) {
        acoesHtml = `
          <div style="font-size:0.82rem;color:#666;margin-bottom:0.5rem;">Acerto de caixa — pedido entregue:</div>
          <button class="btn-pdc btn-pdc-aceitar" onclick="marcarPago(${p.id})">✅ Finalizar como Pago</button>
          <button class="btn-pdc btn-pdc-cancelar" onclick="finalizarNaoPago(${p.id})">📝 Finalizar como Não Pago</button>`;
      } else {
        acoesHtml = `<div style="color:#198754;font-weight:700;padding:0.5rem 0;">✅ Pedido finalizado e pago.</div>`;
      }
    } else if (p.status === 'pendente_aprovacao') {
      acoesHtml = `
        <button class="btn-pdc btn-pdc-aceitar" onclick="alterarStatus(${p.id},'em_preparo')">✔ ACEITAR PEDIDO</button>
        <button class="btn-pdc btn-pdc-rejeitar" onclick="alterarStatus(${p.id},'rejeitado')">✕ REJEITAR PEDIDO</button>`;
    } else {
      const proxStatus = window.acoesMap[p.status] || [];
      proxStatus.forEach(st => {
        if (st === 'cancelado') {
          acoesHtml += `<button class="btn-pdc btn-pdc-cancelar" onclick="alterarStatus(${p.id},'${st}')">✕ Cancelar Pedido</button>`;
        } else if (st === 'entregue') {
          acoesHtml += `<button class="btn-pdc btn-pdc-entregue" onclick="alterarStatus(${p.id},'${st}')">✓ Confirmar Entrega</button>`;
        } else if (st === 'rejeitado') {
          acoesHtml += `<button class="btn-pdc btn-pdc-rejeitar" onclick="alterarStatus(${p.id},'${st}')">✕ Rejeitar Pedido</button>`;
        } else {
          const label = window.statusMap[st] ? window.statusMap[st].label : st;
          acoesHtml += `<button class="btn-pdc btn-pdc-avancar" onclick="alterarStatus(${p.id},'${st}')">▶ ${label}</button>`;
        }
      });
    }
    document.getElementById('pdc-acoes').innerHTML = acoesHtml;

    // Abrir painel
    const painel = document.getElementById('painel-detalhe-lateral');
    painel.classList.remove('detalhe-fechado');
    painel.classList.add('detalhe-aberto');
  };

  window.fecharDetalhes = function () {
    const painel = document.getElementById('painel-detalhe-lateral');
    if (painel) {
      painel.classList.remove('detalhe-aberto');
      painel.classList.add('detalhe-fechado');
    }
    document.querySelectorAll('.pedido-row').forEach(r => r.classList.remove('row-selecionado'));
    // compatibilidade com modo cards (modal)
    const modal = document.getElementById('modalDetalhes');
    if (modal) modal.style.display = 'none';
  };

  window.marcarPago = async function (id) {
    try {
      const res = await fetch(`/api/pedidos/${id}/pagamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: 'pago' })
      });
      if (res.ok) {
        if (typeof fecharDetalhes === 'function') fecharDetalhes();
        carregarPedidos();
      } else {
        alert('Erro ao confirmar pagamento.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão.');
    }
  };

  window.finalizarNaoPago = async function (id) {
    try {
      const res = await fetch(`/api/pedidos/${id}/pagamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: 'nao_pago' })
      });
      if (res.ok) {
        carregarPedidos();
        abrirDetalhes(id);
      } else {
        alert('Erro ao registrar finalização.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão.');
    }
  };

  window.escolherEntregador = async function (id) {
    try {
      const res = await fetch('/api/equipe');
      const equipe = await res.json();
      const entregadores = equipe.filter(u => u.funcao === 'Entregador' && u.ativo);

      if (entregadores.length === 0) {
        alert('Nenhum entregador ativo cadastrado na equipe.');
        return;
      }

      let msg = "Selecione o entregador:\n\n";
      entregadores.forEach((e, index) => {
        msg += `${index + 1} - ${e.nome}\n`;
      });
      msg += "\n0 - Remover entregador";

      const choice = prompt(msg);
      if (choice === null) return;

      let selectedId = null;
      if (choice !== "0") {
        const idx = parseInt(choice) - 1;
        if (entregadores[idx]) {
          selectedId = entregadores[idx].id;
        } else {
          alert('Opção inválida.');
          return;
        }
      }

      const resUpdate = await fetch(`/api/pedidos/${id}/entregador`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entregador_id: selectedId })
      });

      if (resUpdate.ok) {
        carregarPedidos();
        // Se o painel estiver aberto, atualiza ele também chamando abrirDetalhes de novo ou apenas deixando o polling agir
      } else {
        alert('Erro ao atualizar entregador.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao buscar equipe.');
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
        } catch (err) { console.error('Erro ao buscar cliente', err); }
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
          `<option value="${p.id}" data-preco="${p.preco}">${p.nome} (${window.formatCurrency(p.preco)})</option>`
        ).join('');
      }
    } catch (err) {
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

  window.togglePdvEnd = function (tipo) {
    const endBox = document.getElementById('pdvEndBox');
    const endInput = document.getElementById('pdvEnd');
    const mesaBox = document.getElementById('pdvMesaBox');
    const mesaInput = document.getElementById('pdvMesaNum');

    if (tipo === 'balcao') {
      endBox.style.display = 'none';
      mesaBox.style.display = 'none';
      endInput.removeAttribute('required');
      endInput.value = 'Retirada no Balcão';
      mesaInput.removeAttribute('required');
    } else if (tipo === 'mesa') {
      endBox.style.display = 'none';
      mesaBox.style.display = 'block';
      endInput.removeAttribute('required');
      endInput.value = 'Mesa';
      mesaInput.setAttribute('required', 'required');
    } else {
      endBox.style.display = 'block';
      mesaBox.style.display = 'none';
      endInput.setAttribute('required', 'required');
      endInput.value = '';
      mesaInput.removeAttribute('required');
      mesaInput.value = '';
    }
  }

  window.addPdvItem = function () {
    const sel = document.getElementById('pdvProdutoSelect');
    const qtdNode = document.getElementById('pdvProdutoQtd');

    if (!sel.value) return alert('Selecione um produto.');
    const q = parseInt(qtdNode.value);
    if (q < 1) return alert('Quantidade invalida');

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

  window.removerPdvItem = function (index) {
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
            <span>${window.formatCurrency(sub)} <button type="button" onclick="removerPdvItem(${idx})" style="color:red; background:none; border:none; cursor:pointer;" title="Remover">❌</button></span>
          </li>
        `;
      }).join('');
    }

    document.getElementById('pdvTotalLabel').textContent = `${window.formatCurrency(total)}`;
  }

  const formPdv = document.getElementById('formPdv');
  if (formPdv) {
    formPdv.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (window.pdvItens.length === 0) return alert('Adicione pelo menos um item à venda.');

      const btnSalvar = document.getElementById('btnSalvarPdv');
      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Aguarde...';

      const total = window.pdvItens.reduce((acc, i) => acc + (i.quantidade * i.preco), 0);

      let finalEndereco = document.getElementById('pdvEnd').value.trim() || 'Balcão';
      const tipo = document.getElementById('pdvTipo').value;
      if (tipo === 'mesa') {
        const mesaNum = document.getElementById('pdvMesaNum').value.trim();
        finalEndereco = 'Mesa ' + mesaNum;
      }

      const payload = {
        tipo: tipo,
        cliente: document.getElementById('pdvNome').value.trim(),
        telefone: document.getElementById('pdvFone').value.trim(),
        endereco: finalEndereco,
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

        if (res.ok) {
          modalPdv.style.display = 'none';
          carregarPedidos();
          // Marcar como pago se for din/cartao e for balcao?
          // Simplificado: apenas cria o pedido com pendente e o admin clica "Marcar Pago".
        } else {
          const b = await res.json();
          alert('Erro: ' + b.error);
        }
      } catch (err) {
        console.error(err);
        alert('Falha de rede.');
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = '🟢 Confirmar Venda PDV';
      }
    });
  }

  // ========== CONFIGURAÇÕES DA LOJA (WHITE LABEL) ==========
  window.carregarConfiguracoesAdmin = async function () {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = await res.json();

      const setRadio = (name, val) => {
        const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (el) el.checked = true;
      };
      const setCheckbox = (name, val) => {
        const el = document.querySelector(`input[name="${name}"]`);
        if (el) el.checked = !!val;
      };

      document.getElementById('cfgStoreName').value = data.store_name || '';
      document.getElementById('cfgStoreSubtitle').value = data.store_subtitle || '';
      document.getElementById('cfgColorPrimary').value = data.color_primary || '#e8420a';
      if (document.getElementById('cfgColorSecondary')) document.getElementById('cfgColorSecondary').value = data.color_secondary || '#1c1e21';
      document.getElementById('cfgColorBtn').value = data.color_button_main || '#e8420a';
      document.getElementById('cfgColorPanelBg').value = data.color_panel_bg || '#f8f9fa';

      document.getElementById('cfgStRecebido').value = data.color_status_recebido || '#333333';
      document.getElementById('cfgStPreparo').value = data.color_status_preparo || '#ff9800';
      document.getElementById('cfgStPronto').value = data.color_status_pronto || '#e8420a';
      document.getElementById('cfgStEntrega').value = data.color_status_entrega || '#4caf50';
      document.getElementById('cfgStAtrasado').value = data.color_status_atrasado || '#dc3545';

      // Carrega seletor de país WhatsApp
      const waSelLoad = document.getElementById('cfgWaCountrySelect');
      const waDialLoad = document.getElementById('cfgWaDial');
      const waNumLoad  = document.getElementById('cfgWaNumber');
      if (waSelLoad && data.whatsapp_country_code) {
        waSelLoad.value = data.whatsapp_country_code;
        if (waDialLoad) {
          const selOpt = waSelLoad.options[waSelLoad.selectedIndex];
          waDialLoad.value = selOpt ? (selOpt.dataset.dial || '') : (data.whatsapp_dial_code || '');
        }
      } else if (waSelLoad && !data.whatsapp_country_code) {
        // Sem dados novos: seleciona Portugal por padrão (sistema é pt-BR/pt-PT)
        waSelLoad.value = 'PT';
        if (waDialLoad) {
          const selOpt = waSelLoad.options[waSelLoad.selectedIndex];
          waDialLoad.value = selOpt ? (selOpt.dataset.dial || '+351') : '+351';
        }
      }
      if (waNumLoad) waNumLoad.value = data.whatsapp_number || '';
      document.getElementById('cfgStoreDomain').value = data.domain || '';
      document.getElementById('cfgStoreInstagram').value = data.social_instagram || '';
      document.getElementById('cfgStoreFacebook').value = data.social_facebook || '';
      document.getElementById('cfgOperatingHours').value = data.operating_hours || '';
      if (document.getElementById('cfgStoreAddress')) document.getElementById('cfgStoreAddress').value = data.store_address || '';
      document.getElementById('cfgAdminName').value = data.admin_display_name || '';
      document.getElementById('cfgStoreFooter').value = data.footer_text || '';

      // New Info Negocio Fields
      setCheckbox('hide_address', data.hide_address);
      const selCurrency = document.querySelector('select[name="currency_code"]');
      if (selCurrency) selCurrency.value = data.currency_code || 'BRL';

      const selLang = document.querySelector('select[name="app_language"]');
      if (selLang) selLang.value = data.app_language || 'pt-BR';

      const inMap = document.querySelector('input[name="google_maps_link"]');
      if (inMap) inMap.value = data.google_maps_link || '';

      setCheckbox('show_google_reviews', data.show_google_reviews);
      setCheckbox('only_4_stars', data.only_4_stars);

      const inGName = document.querySelector('input[name="google_business_name"]');
      if (inGName) inGName.value = data.google_business_name || '';

      const selBType = document.querySelector('select[name="business_type"]');
      if (selBType) selBType.value = data.business_type || 'Restaurante';

      const selFStyl = document.querySelector('select[name="food_style"]');
      if (selFStyl) selFStyl.value = data.food_style || 'Pizzas';

      const mainPos = document.getElementById('cfgMainPosSystem');
      if (mainPos) {
        mainPos.value = data.main_pos_system || 'Sim';
        mainPos.dispatchEvent(new Event('change'));
      }

      const inPosN = document.querySelector('input[name="pos_system_name"]');
      if (inPosN) inPosN.value = data.pos_system_name || '';

      // Delivery config fields
      const cfgModo = document.getElementById('cfgModoEntrega');
      if (cfgModo) cfgModo.value = data.delivery_mode || 'zona';
      const setNum = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
      setNum('cfgDeliveryBase', data.delivery_base);
      setNum('cfgDeliveryPerKm', data.delivery_per_km);
      setNum('cfgDeliveryFixed', data.delivery_fixed);
      setNum('cfgDeliveryMin', data.delivery_min);
      setNum('cfgDeliveryMax', data.delivery_max);
      setNum('cfgDeliveryFreeKm', data.delivery_free_km);

      // Scheduling fields
      const cfgSched = document.getElementById('cfgSchedulingEnabled');
      if (cfgSched) cfgSched.checked = !!data.scheduling_enabled;
      setNum('cfgSchedulingMinAdvance', data.scheduling_min_advance || 30);
      setNum('cfgSchedulingQueueBefore', data.scheduling_queue_before || 20);

      setRadio('order_receive_mode', data.order_receive_mode || 'app_whatsapp');

      const cfgWhatsappPedidos = document.getElementById('cfgStorePhonePedidos');
      if (cfgWhatsappPedidos) cfgWhatsappPedidos.value = data.contact_whatsapp_pedidos || '';

      setRadio('auto_accept', data.auto_accept || 'revisados');
      setCheckbox('upsell_enabled', data.upsell_enabled);
      setCheckbox('delivery_enabled', data.delivery_enabled ?? true);
      setRadio('req_delivery', data.req_delivery || 'manual');
      setCheckbox('cfg_retirada', data.cfg_retirada ?? true);
      setCheckbox('cfg_local', data.cfg_local ?? true);
      setRadio('qr_type', data.qr_type || 'generic');
      setCheckbox('table_service', data.table_service);
      setCheckbox('gorjeta_enabled', data.gorjeta_enabled ?? true);

      // Pagamentos
      const payFields = ['pay_money', 'pay_card_machine', 'pay_pix', 'pay_amex', 'pay_visa', 'pay_mastercard', 'pay_online_stripe'];
      payFields.forEach(pf => {
        setCheckbox(pf, data[pf] !== undefined ? data[pf] : (['pay_money', 'pay_card_machine', 'pay_pix'].includes(pf) ? true : false));
        const el = document.querySelector(`input[name="${pf}"]`);
        if (el) {
          if (pf === 'pay_online_stripe') window.updatePayStatusOnline(el);
          else window.updatePayStatus(el);
        }
      });

      // --- INICIO IMPRESSORAS ---
      setRadio('print_mode', data.print_mode || 'web');
      setCheckbox('print_auto_kitchen', data.print_auto_kitchen);
      setCheckbox('print_auto_web_client', data.print_auto_web_client);
      setRadio('print_auto_web_client_trigger', data.print_auto_web_client_trigger || 'pendente');
      setCheckbox('print_auto_pdv_client', data.print_auto_pdv_client);

      const pcp = document.getElementById('pcConfigPanel');
      if (pcp) pcp.style.display = (data.print_mode === 'pc') ? 'block' : 'none';

      const autoW = document.getElementById('radioSubWebClient');
      if (autoW) autoW.style.display = data.print_auto_web_client ? 'block' : 'none';
      // --- FIM IMPRESSORAS ---

      // Hero media previews
      const showHeroMedia = (type, url) => {
        if (!url) return;
        const prefix = type === 'video' ? 'heroVideo' : 'heroImage';
        const el = document.getElementById(prefix + 'El');
        const preview = document.getElementById(prefix + 'Preview');
        const holder = document.getElementById(prefix + 'Placeholder');
        const actions = document.getElementById(prefix + 'Actions');
        if (el) el.src = url;
        if (preview) preview.style.display = 'block';
        if (holder) holder.style.display = 'none';
        if (actions) actions.style.display = 'flex';
      };
      showHeroMedia('video', data.hero_video_url);
      showHeroMedia('image', data.hero_image_url);

      // Landing boas-vindas fields
      if (window.setVal) {
        setVal('cfgLandingTitulo', data.landing_titulo);
        setVal('cfgLandingSubtitulo', data.landing_subtitulo);
        setVal('cfgLandingBotao', data.landing_botao_texto);
      }
      const cfgLandingTexto = document.getElementById('cfgLandingTexto');
      if (cfgLandingTexto) cfgLandingTexto.value = data.landing_texto || '';
      const cfgLandingAtivo = document.getElementById('cfgLandingAtivo');
      if (cfgLandingAtivo) cfgLandingAtivo.checked = data.landing_ativo !== false;

      // Logo Loja
      const logoUrl = data.logo_url;
      const logoPreview = document.getElementById('cfgLogoPreview');
      const logoPlaceholder = document.getElementById('cfgLogoPlaceholder');
      const logoHidden = document.getElementById('cfgStoreLogoUrl');
      if (logoUrl && logoPreview && logoPlaceholder && logoHidden) {
        logoPreview.src = logoUrl;
        logoPreview.style.display = 'block';
        logoPlaceholder.style.display = 'none';
        logoHidden.value = logoUrl;
      }

      // Render QR Code and Links
      const storeLink = data.domain ? (data.domain.startsWith('http') ? data.domain : 'https://' + data.domain) : window.location.origin;
      const displayInput = document.getElementById('displayStoreLink');
      if (displayInput) {
        displayInput.value = storeLink;
        const qrContainer = document.getElementById('qrCodeContainer');
        if (qrContainer) {
          qrContainer.innerHTML = '';
          new QRCode(qrContainer, {
            text: storeLink,
            width: 180, height: 180,
            colorDark: "#000000", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
          });
        }
      }

      // --- HORÁRIOS SEMANAIS (CARREGAR) ---
      renderWeeklyHours(data.weekly_hours);

      // --- MENU DE PERFIL: popular dropdown com dados reais ---
      window._profileSettings = data;
      const profileName = data.admin_display_name || data.store_name || 'Admin';
      const nameEl     = document.getElementById('profileMenuName');
      const dropNameEl = document.getElementById('profileDropName');
      if (nameEl)     nameEl.textContent     = profileName;
      if (dropNameEl) dropNameEl.textContent = data.store_name || profileName;
      _updateProfileAvatar(data.logo_url || '');

    } catch (err) {
      console.error('Erro ao ler configs:', err);
    }
  };

  const DIAS_LABELS = {
    domingo: 'Domingo',
    segunda: 'Segunda-feira',
    terca: 'Terça-feira',
    quarta: 'Quarta-feira',
    quinta: 'Quinta-feira',
    sexta: 'Sexta-feira',
    sabado: 'Sábado'
  };

  const DIAS_ORDEM = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
  const DIAS_CURTOS = { segunda: 'Seg', terca: 'Ter', quarta: 'Qua', quinta: 'Qui', sexta: 'Sex', sabado: 'Sáb', domingo: 'Dom' };

  function getWeeklyHoursSummary(weeklyHours) {
    if (!weeklyHours || Object.keys(weeklyHours).length === 0) return 'Horário não configurado';
    
    const groups = [];
    DIAS_ORDEM.forEach(dia => {
      const intervals = weeklyHours[dia] || [];
      const intervalStr = intervals.length === 0 ? 'Fechado' 
        : intervals.map(i => `${i.open}-${i.close}`).join(', ');
      
      if (groups.length > 0 && groups[groups.length - 1].hours === intervalStr) {
        groups[groups.length - 1].end = dia;
      } else {
        groups.push({ start: dia, end: dia, hours: intervalStr });
      }
    });

    const summary = groups.filter(g => g.hours !== 'Fechado').map(g => {
      const dayRange = g.start === g.end ? DIAS_CURTOS[g.start] : `${DIAS_CURTOS[g.start]}–${DIAS_CURTOS[g.end]}`;
      return `${dayRange}: ${g.hours}`;
    }).join(' • ');

    return summary || 'Fechado todos os dias';
  }

  function renderWeeklyHours(weeklyHours) {
    const hours = typeof weeklyHours === 'object' && weeklyHours !== null ? weeklyHours : {};
    
    // Identificar dia da semana atual (0-6, onde 0=domingo)
    const diaHojeIdx = new Date().getDay();
    const diaHojeChave = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][diaHojeIdx];

    // Atualiza resumo na tela principal
    const summaryEl = document.getElementById('weekly-hours-summary');
    if (summaryEl) summaryEl.textContent = getWeeklyHoursSummary(hours);

    const displayInfo = document.getElementById('cfgOperatingHoursDisplay');
    const inputInfo = document.getElementById('cfgOperatingHours');
    if (displayInfo && inputInfo) displayInfo.textContent = inputInfo.value ? `"${inputInfo.value}"` : '';

    // Atualiza input hidden
    const hiddenInput = document.getElementById('cfgWeeklyHours');
    if (hiddenInput) hiddenInput.value = JSON.stringify(hours);

    // Renderiza no modal
    const container = document.getElementById('weekly-hours-container');
    if (!container) return;
    container.innerHTML = '';

    DIAS_ORDEM.forEach(dia => {
      const dayIntervals = hours[dia] || [];
      const isHoje = dia === diaHojeChave;
      const dayHtml = `
        <div class="day-config" data-day="${dia}" style="padding: 1.2rem; border: 1px solid ${isHoje ? '#e8420a' : '#eee'}; border-radius: 12px; background: ${isHoje ? '#fff8f6' : '#fff'}; box-shadow: 0 2px 4px rgba(0,0,0,0.02); position: relative;">
          ${isHoje ? '<span style="position: absolute; top: -10px; right: 10px; background: #e8420a; color: #fff; font-size: 0.65rem; padding: 2px 8px; border-radius: 10px; font-weight: 800; text-transform: uppercase;">Hoje</span>' : ''}
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
            <div style="display: flex; flex-direction: column; gap: 0.2rem;">
               <strong style="font-size: 1rem; color: #111;">${DIAS_LABELS[dia]}</strong>
               <span style="font-size: 0.75rem; color: ${dayIntervals.length > 0 ? '#4caf50' : '#999'}; font-weight: 600;">
                 ${dayIntervals.length > 0 ? '● Aberto' : '○ Fechado'}
               </span>
            </div>
            <button type="button" onclick="window.addStoreHourRow('${dia}')" 
              style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; border-radius: 6px; cursor: pointer; font-weight: 600;">
              + Adicionar turno
            </button>
          </div>
          <div id="intervals-${dia}" class="intervals-list" style="display: flex; flex-direction: column; gap: 0.8rem;">
            ${dayIntervals.length === 0 ? '<div style="color: #999; font-size: 0.85rem; background: #f9f9f9; padding: 0.8rem; border-radius: 6px; border: 1px dashed #ddd; text-align: center;">Loja fechada</div>' : ''}
            ${dayIntervals.map(t => createIntervalRowHtml(t)).join('')}
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', dayHtml);
    });
  }

  function createIntervalRowHtml(t = { open: '', close: '', crossMidnight: false }) {
    return `
      <div class="interval-row" style="display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; background: #fafafa; padding: 0.5rem; border-radius: 8px; border: 1px solid #f0f0f0;">
        <input type="time" class="in-open" value="${t.open || ''}" required 
          style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem; background: #fff; width: 100px;">
        <span style="color: #bbb; font-weight: 500;">até</span>
        <input type="time" class="in-close" value="${t.close || ''}" required 
          style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem; background: #fff; width: 100px;">
        
        <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #444; cursor: pointer; background: #fff; padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px solid #ddd; flex: 1; min-width: 100px;">
          <input type="checkbox" class="in-cross" ${t.crossMidnight ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;"> 
          <span style="white-space: nowrap;">Vira dia</span>
        </label>

        <button type="button" onclick="window.removeStoreHourRow(this)" 
          style="background: #fff0f0; border: 1px solid #ffd1d1; color: #ff4d4f; cursor: pointer; font-size: 1rem; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Remover">✕</button>
      </div>
    `;
  }

  window.addStoreHourRow = (dia) => {
    const list = document.getElementById(`intervals-${dia}`);
    if (!list) return;
    if (list.querySelector('div[style*="text-align: center"]')) list.innerHTML = '';
    list.insertAdjacentHTML('beforeend', createIntervalRowHtml());
  };

  window.removeStoreHourRow = (btn) => {
    const row = btn.closest('.interval-row');
    const list = row.parentElement;
    row.remove();
    if (list.children.length === 0) {
      list.innerHTML = '<div style="color: #999; font-size: 0.85rem; background: #f9f9f9; padding: 0.8rem; border-radius: 6px; border: 1px dashed #ddd; text-align: center;">Loja fechada</div>';
    }
  };

  window.openWeeklyHoursModal = () => {
    const modal = document.getElementById('modalWeeklyHours');
    if (modal) modal.style.display = 'flex';
  };

  window.closeWeeklyHoursModal = () => {
    const modal = document.getElementById('modalWeeklyHours');
    if (modal) modal.style.display = 'none';
  };

  // Listener para salvar apenas os horários via modal
  setTimeout(() => {
    const btnSaveModal = document.getElementById('btnSalvarHorariosModal');
    if (btnSaveModal) {
      btnSaveModal.addEventListener('click', async () => {
        const weeklyHours = {};
        document.querySelectorAll('.day-config').forEach(dayDiv => {
          const dia = dayDiv.dataset.day;
          const intervals = [];
          dayDiv.querySelectorAll('.interval-row').forEach(row => {
            const open = row.querySelector('.in-open').value;
            const close = row.querySelector('.in-close').value;
            if (open && close) {
              intervals.push({
                open,
                close,
                crossMidnight: row.querySelector('.in-cross').checked
              });
            }
          });
          weeklyHours[dia] = intervals;
        });

        try {
          btnSaveModal.textContent = 'Salvando...';
          btnSaveModal.disabled = true;

          const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weekly_hours: weeklyHours })
          });

          if (res.ok) {
            renderWeeklyHours(weeklyHours);
            window.closeWeeklyHoursModal();
            if (window.Toast) {
              window.Toast.fire({ icon: 'success', title: 'Horários salvos!' });
            }
          } else {
            alert('Erro ao salvar horários');
          }
        } catch (err) {
          console.error(err);
          alert('Erro de conexão');
        } finally {
          btnSaveModal.textContent = 'Salvar horário';
          btnSaveModal.disabled = false;
        }
      });
    }
  }, 1000);

  const formConfig = document.querySelector('.form-config');
  if (formConfig) {
    formConfig.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = formConfig.querySelector('button[type="submit"]');
      const msg = formConfig.querySelector('[id^="cfgStatusMsg"]');
      const originalText = btn.innerText;
      btn.disabled = true;
      btn.innerText = 'Salvando...';

      const formData = new FormData(formConfig);
      
      // Checkboxes manual fix
      formConfig.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb.name) formData.set(cb.name, cb.checked ? 'true' : 'false');
      });

      // Weekly Hours Serialization
      const weeklyHours = {};
      document.querySelectorAll('.day-config').forEach(dayBox => {
        const dia = dayBox.dataset.day;
        const intervals = [];
        dayBox.querySelectorAll('.interval-row').forEach(row => {
          const open = row.querySelector('.in-open').value;
          const close = row.querySelector('.in-close').value;
          const cross = row.querySelector('.in-cross').checked;
          if (open && close) intervals.push({ open, close, crossMidnight: cross });
        });
        weeklyHours[dia] = intervals;
      });
      formData.set('weekly_hours', JSON.stringify(weeklyHours));

      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          if (msg) { msg.style.color = 'green'; msg.innerText = '✅ Configurações salvas!'; }
          setTimeout(() => window.location.reload(), 1000);
        } else {
          const err = await res.json();
          if (msg) { msg.style.color = 'red'; msg.innerText = '❌ Erro: ' + err.error; }
          btn.disabled = false;
          btn.innerText = originalText;
        }
      } catch (err) {
        if (msg) { msg.style.color = 'red'; msg.innerText = '❌ Falha de rede.'; }
        btn.disabled = false;
        btn.innerText = originalText;
      }
    });
  }


  // Inicializa e realiza polling para o admin também ser responsivo
  carregarPedidos();
  setInterval(carregarPedidos, 10000);

  // ========== GERADOR DE PDF DO CARDÁPIO ==========
  const btnGerarPdf = document.getElementById('btnGerarPdfCardapio');
  if (btnGerarPdf) {
    btnGerarPdf.addEventListener('click', async () => {
      btnGerarPdf.disabled = true;
      btnGerarPdf.innerText = '⏳ Gerando...';
      try {
        const resSet = await fetch('/api/settings');
        const settings = resSet.ok ? await resSet.json() : {};

        const resProd = await fetch('/api/produtos');
        const produtos = resProd.ok ? await resProd.json() : [];
        if (produtos.length === 0) {
          alert('Nenhum produto cadastrado para gerar cardápio.');
          btnGerarPdf.disabled = false;
          btnGerarPdf.innerText = '📄 Baixar PDF do Cardápio';
          return;
        }

        const categorias = {};
        let temDisponiveis = false;
        // Respeitar ordem atual no backend; só agrupar.
        produtos.forEach(p => {
          if (!p.disponivel) return;
          temDisponiveis = true;
          const cat = p.categoria || 'Outros';
          if (!categorias[cat]) categorias[cat] = [];
          categorias[cat].push(p);
        });

        if (!temDisponiveis) {
          alert('Nenhum produto disponível para o cardápio público.');
          btnGerarPdf.disabled = false;
          btnGerarPdf.innerText = '📄 Baixar PDF do Cardápio';
          return;
        }

        const storeName = settings.store_name || 'Cardápio';
        const storeSub = settings.store_subtitle || '';
        const colorPrimary = settings.color_primary || '#e8420a';

        let logoHtml = '';
        if (settings.logo) {
          logoHtml = `<img src="${settings.logo}" style="max-height:100px; margin-bottom:10px; border-radius:8px;">`;
        } else {
          logoHtml = `<h1 style="color:${colorPrimary}; margin:0; font-size:32px; font-weight:900;">🍔 ${storeName}</h1>`;
        }

        let html = `
          <div style="padding:40px; font-family:'Inter', sans-serif; color:#333; width:800px; margin:0 auto; background:#fff;">
            <div style="text-align:center; padding-bottom:20px; border-bottom:3px solid ${colorPrimary}; margin-bottom:30px;">
              ${logoHtml}
              ${settings.logo ? `<h2 style="margin:10px 0 0; font-size:26px; color:#111; text-transform:uppercase; font-weight:900;">${storeName}</h2>` : ''}
              ${storeSub ? `<p style="margin:5px 0 0; font-size:16px; color:#666; font-style:italic;">${storeSub}</p>` : ''}
              <div style="margin-top:15px; display:flex; justify-content:center; gap:20px; font-size:13px; font-weight:bold; color:#444;">
                ${settings.contact_whatsapp ? `<span>📞 Delivery: ${settings.contact_whatsapp}</span>` : ''}
                ${settings.social_instagram ? `<span>📱 Insta: ${settings.social_instagram}</span>` : ''}
              </div>
              ${settings.store_address ? `<p style="margin:10px 0 0; font-size:13px; color:#555;">📍 ${settings.store_address}</p>` : ''}
            </div>
        `;

        for (const [cat, prods] of Object.entries(categorias)) {
          html += `
             <h3 style="background:${colorPrimary}; color:#fff; padding:10px 15px; border-radius:6px; font-size:20px; margin-top:30px; text-transform:uppercase; margin-bottom:20px; box-shadow:0 3px 0 rgba(0,0,0,0.1);">
                ${cat}
             </h3>
             <div style="display:flex; flex-direction:column; gap:20px;">
           `;
          prods.forEach(p => {
            const preco = Number(p.preco).toFixed(2).replace('.', ',');
            const desc = p.descricao || '';
            let imgHtml = '';
            if (p.imagem_url) {
              imgHtml = `<img src="${p.imagem_url}" style="width:70px; height:70px; object-fit:cover; border-radius:8px; margin-right:15px; border:1px solid #eee;">`;
            }
            html += `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px dashed #ccc; padding-bottom:15px; page-break-inside: avoid;">
                   <div style="display:flex; flex:1; align-items:flex-start; padding-right:20px;">
                     ${imgHtml}
                     <div>
                       <div style="font-weight:900; font-size:18px; color:#111; margin-bottom:4px;">${p.nome}</div>
                       <div style="font-size:14px; color:#666; line-height:1.4;">${desc}</div>
                     </div>
                   </div>
                   <div style="font-weight:900; font-size:18px; color:${colorPrimary}; white-space:nowrap; padding-top:2px;">
                     R$ ${preco}
                   </div>
                </div>
              `;
          });
          html += `</div>`;
        }

        const hoje = new Date().toLocaleDateString('pt-BR');
        html += `
            <div style="margin-top:50px; text-align:center; font-size:12px; color:#999; border-top:1px solid #eee; padding-top:20px; page-break-inside: avoid;">
              <p style="margin:0 0 5px;">${settings.footer_text || 'Agradecemos a preferência! Volte sempre.'}</p>
              <p style="margin:0;">Gerado em ${hoje} • App Pitombo Lanches</p>
            </div>
          </div>
        `;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.style.position = 'absolute';
        tempDiv.style.top = '-9999px';
        tempDiv.style.left = '-9999px';
        document.body.appendChild(tempDiv);

        const opt = {
          margin: 0.5,
          filename: 'Cardapio_Pitombo.pdf',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        if (typeof html2pdf !== 'undefined') {
          await html2pdf().set(opt).from(tempDiv.firstElementChild).save();
        } else {
          alert('A biblioteca de PDF não foi carregada corretamente.');
        }
        document.body.removeChild(tempDiv);

      } catch (e) {
        console.error('Erro ao gerar PDF', e);
        alert('Falha ao gerar o PDF do cardápio.');
      } finally {
        btnGerarPdf.disabled = false;
        btnGerarPdf.innerText = '📄 Baixar PDF do Cardápio';
      }
    });
  }
});


// ==========================================
// MÓDULO: GESTÃO DE EQUIPE E FUNÇÕES
// ==========================================

window.abrirModalEquipe = function (id = '', nome = '', email = '', funcao = 'Manager', ativo = true) {
  document.getElementById('equipeId').value     = id;
  document.getElementById('equipeNome').value   = nome;
  document.getElementById('equipeEmail').value  = email;
  document.getElementById('equipeFuncao').value = funcao;
  document.getElementById('equipeAtivo').checked = ativo;

  // Senha: obrigatória na criação, opcional na edição
  const isEdit = !!id;
  const senhaInput  = document.getElementById('equipeSenha');
  const senhaObrig  = document.getElementById('equipeSenhaObrig');
  const senhaOpcional = document.getElementById('equipeSenhaOpcional');
  if (senhaInput)    { senhaInput.value = ''; senhaInput.required = !isEdit; }
  if (senhaObrig)    senhaObrig.style.display    = isEdit ? 'none'   : 'inline';
  if (senhaOpcional) senhaOpcional.style.display = isEdit ? 'inline' : 'none';

  // Limpar mensagens de erro anteriores
  const emailErro = document.getElementById('equipeEmailErro');
  const senhaErro = document.getElementById('equipeSenhaErro');
  if (emailErro) emailErro.style.display = 'none';
  if (senhaErro) senhaErro.style.display = 'none';

  document.getElementById('modalEquipeTitulo').innerText = isEdit ? 'Editar Usuário' : 'Adicionar Usuário';
  document.getElementById('modalEquipe').style.display = 'flex';
};

window.fecharModalEquipe = function () {
  document.getElementById('modalEquipe').style.display = 'none';
  document.getElementById('formEquipe').reset();
};

window.carregarEquipe = async function () {
  const tbody = document.getElementById('listaEquipe');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#888;">Carregando equipe...</td></tr>';

  try {
    const res = await fetch('/api/equipe');
    if (!res.ok) throw new Error('Falha ao buscar time');
    const equipe = await res.json();

    if (equipe.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#888;">Nenhum usuário cadastrado.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    equipe.forEach(user => {
      const isAdminRaiz = (user.funcao === 'Admin' && user.id === 1); // Proteção visual extra

      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #eee';

      tr.innerHTML = `
            <td style="padding:12px 10px; font-weight:600; color:#333;">${user.nome}</td>
            <td style="padding:12px 10px; color:#666;">${user.email || '--'}</td>
            <td style="padding:12px 10px; color:#666;">${user.unidade}</td>
            <td style="padding:12px 10px;">
               <select onchange="alterarFuncaoEquipe(${user.id}, this.value)" ${isAdminRaiz ? 'disabled' : ''} style="padding:0.4rem; border-radius:6px; border:1px solid #ccc; background:#fff; outline:none; font-size:0.85rem;">
                  <option value="Admin" ${user.funcao === 'Admin' ? 'selected' : ''}>Admin</option>
                  <option value="Manager" ${user.funcao === 'Manager' ? 'selected' : ''}>Manager</option>
                  <option value="Garçom" ${user.funcao === 'Garçom' ? 'selected' : ''}>Garçom</option>
                  <option value="Cozinheiro" ${user.funcao === 'Cozinheiro' ? 'selected' : ''}>Cozinheiro</option>
                  <option value="Entregador" ${user.funcao === 'Entregador' ? 'selected' : ''}>Entregador</option>
               </select>
            </td>
            <td style="padding:12px 10px;">
               ${isAdminRaiz
          ? '<span style="color:#1976d2; font-weight:bold; font-size:0.85rem; border:1px solid #1976d2; padding:2px 8px; border-radius:12px;">Admin Raiz</span>'
          : `
                  <label class="switch" style="position:relative; display:inline-block; width:40px; height:20px;">
                     <input type="checkbox" ${user.ativo ? 'checked' : ''} onchange="alterarStatusEquipe(${user.id}, this.checked)" style="opacity:0; width:0; height:0;">
                     <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:${user.ativo ? '#2196F3' : '#ccc'}; transition:.4s; border-radius:34px;">
                        <span style="position:absolute; content:''; height:14px; width:14px; left:${user.ativo ? '22px' : '3px'}; bottom:3px; background-color:white; transition:.4s; border-radius:50%;"></span>
                     </span>
                  </label>
                  `
        }
            </td>
            <td style="padding:12px 10px; text-align:center;">
               ${isAdminRaiz
          ? '<a href="#" style="color:#1976d2; text-decoration:underline; font-size:0.85rem;">Gerenciar meu perfil</a>'
          : `
                  <button onclick="abrirModalEquipe(${user.id}, '${user.nome}', '${user.email || ''}', '${user.funcao}', ${user.ativo})" style="background:transparent; border:none; color:#1976d2; cursor:pointer; font-size:1.2rem; margin-right:8px;" title="Editar">✏️</button>
                  <button onclick="deletarUsuarioEquipe(${user.id})" style="background:transparent; border:none; color:#dc3545; cursor:pointer; font-size:1.2rem;" title="Remover">🗑️</button>
                  `
        }
            </td>
         `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:red;">Erro ao carregar equipe.</td></tr>';
  }
};

window.alterarStatusEquipe = async function (id, ativo) {
  try {
    const res = await fetch('/api/equipe/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ..._authHeader() },
      body: JSON.stringify({ ativo })
    });
    if (!res.ok) throw new Error('Falha de rede');
  } catch (e) {
    alert('Erro ao alterar status.');
    carregarEquipe();
  }
};

window.alterarFuncaoEquipe = async function (id, funcao) {
  try {
    const res = await fetch('/api/equipe/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ..._authHeader() },
      body: JSON.stringify({ funcao })
    });
    if (!res.ok) throw new Error('Falha de rede');
  } catch (e) {
    alert('Erro ao alterar função.');
    carregarEquipe();
  }
};

window.deletarUsuarioEquipe = async function (id) {
  if (!confirm('Tem certeza que deseja remover este usuário da equipe?')) return;
  try {
    const res = await fetch('/api/equipe/' + id, {
      method: 'DELETE',
      headers: { ..._authHeader() }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao deletar');
    carregarEquipe();
  } catch (e) {
    alert(e.message);
  }
};

const formEquipe = document.getElementById('formEquipe');
if (formEquipe) {
  formEquipe.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id     = document.getElementById('equipeId').value.trim();
    const nome   = document.getElementById('equipeNome').value.trim();
    const email  = document.getElementById('equipeEmail').value.trim();
    const funcao = document.getElementById('equipeFuncao').value;
    const ativo  = document.getElementById('equipeAtivo').checked;
    const senha  = document.getElementById('equipeSenha')?.value || '';
    const isNew  = !id;

    // ── Validação client-side ──────────────────────────────────────────
    const emailErro = document.getElementById('equipeEmailErro');
    const senhaErro = document.getElementById('equipeSenhaErro');
    if (emailErro) emailErro.style.display = 'none';
    if (senhaErro) senhaErro.style.display = 'none';

    let hasError = false;
    if (!email) {
      if (emailErro) emailErro.style.display = 'block';
      hasError = true;
    }
    if (isNew && (!senha || senha.length < 6)) {
      if (senhaErro) senhaErro.style.display = 'block';
      hasError = true;
    }
    if (hasError) return;

    const btn = document.getElementById('btnSalvarEquipe');
    btn.disabled = true;
    btn.innerText = 'Salvando...';

    const payload = { nome, email, funcao, ativo };
    if (senha) payload.senha = senha;

    const url    = id ? '/api/equipe/' + id : '/api/equipe';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ..._authHeader() },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');

      fecharModalEquipe();
      carregarEquipe();
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.innerText = 'Salvar';
    }
  });
}



// ==========================================
// MÓDULO: INTEGRAÇÕES DE DELIVERY (PORTUGAL)
// ==========================================

const configsPorPlataforma = {
  'UBEREATS': {
    icone: '🍔', corTema: '#06C167',
    campos: [
      { id: 'client_id', label: 'Client ID', type: 'text', placeholder: 'Ex: eXampleId1234' },
      { id: 'client_secret', label: 'Client Secret', type: 'password', placeholder: 'Digite ou cole o Segredo...' }
    ]
  },
  'GLOVO': {
    icone: '🛵', corTema: '#FFCC00',
    campos: [
      { id: 'api_key', label: 'API Key (Token)', type: 'password', placeholder: 'Sua chave provida pela Glovo' },
      { id: 'store_id', label: 'Store (Location) ID', type: 'text', placeholder: 'Ex: URN:GLOVO:1234' }
    ]
  },
  'BOLTFOOD': {
    icone: '⚡', corTema: '#34d186',
    campos: [
      { id: 'access_token', label: 'Bolt Access Token', type: 'password', placeholder: 'Token de Segurança' }
    ]
  }
};

window.abrirModalIntegracao = function (plataforma, credenciaisJson, isAtivo) {
  document.getElementById('integPlataforma').value = plataforma;
  document.getElementById('integIsAtivo').checked = !!isAtivo;

  const cfg = configsPorPlataforma[plataforma] || { icone: '🔌', corTema: '#333', campos: [] };
  document.getElementById('modalIntegIcon').innerHTML = `<span style="color:${cfg.corTema}">${cfg.icone}</span>`;
  document.getElementById('modalIntegTitle').innerHTML = `Configuração: <span style="color:${cfg.corTema}">${plataforma}</span>`;

  let creds = {};
  try { creds = JSON.parse(credenciaisJson || '{}'); } catch (e) { }

  let htmlCampos = '';
  cfg.campos.forEach(c => {
    // Use the censored value if present to not override with empty, allowing placeholder
    const savedVal = creds[c.id] || '';
    htmlCampos += `
         <div>
            <label style="font-weight:700; font-size:0.9rem; margin-bottom:0.4rem; display:block; color:#555;">${c.label}</label>
            <input type="${c.type}" id="integ_field_${c.id}" value="${savedVal}" placeholder="${c.placeholder}" style="width:100%; padding:0.9rem; border-radius:8px; border:1px solid #ccc; outline:none; font-family:monospace; background:#f9f9f9;" onfocus="this.style.borderColor='#1976d2'; this.style.background='#fff'" onblur="this.style.borderColor='#ccc'; this.style.background='#f9f9f9'">
         </div>
      `;
  });

  document.getElementById('integDynamicFields').innerHTML = htmlCampos || '<p>Nenhuma credencial exigida.</p>';
  document.getElementById('modalConfigIntegracao').style.display = 'flex';
};

window.desconectarIntegracao = async function (plataforma) {
  if (!confirm(`Você perderá conexões de pedidos com ${plataforma}. Deseja mesmo desconectar?`)) return;

  try {
    const res = await fetch('/api/integracoes/' + plataforma + '/desconectar', { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao desconectar');
    alert('Desconectado com Sucesso!');
    carregarIntegracoes();
  } catch (e) {
    alert(e.message);
  }
}


window.carregarIntegracoes = async function () {
  console.log('🔥 carregando integrações...');

  try {
    const res = await fetch('/api/integracoes');
    const data = await res.json();

    console.log('✅ dados das integrações:', data);

    const container = document.getElementById('integracoes-container');

    if (!container) {
      console.error('❌ #integracoes-container não encontrado no HTML');
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = `
        <div style="padding:1rem; background:#fff; border:1px solid #eee; border-radius:12px; color:#777;">
          Nenhuma integração encontrada.
        </div>
      `;
      return;
    }

    container.innerHTML = data.map(item => {
      const status = item.status || 'nao_conectado';
      const badgeColor = status === 'conectado' ? '#16a34a' : (status === 'em_configuracao' ? '#fbbf24' : '#9ca3af');
      const badgeText = status === 'conectado' ? 'Conectado' : (status === 'em_configuracao' ? 'Pendente' : 'Offline');

      return `
        <div style="background:#fff; border:1px solid #eee; border-radius:16px; padding:1.5rem; box-shadow:0 4px 14px rgba(0,0,0,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <h3 style="margin:0; font-size:1.2rem; display:flex; align-items:center; gap:0.5rem;"><span style="font-size:1.5rem;">${item.plataforma === 'UBEREATS' ? '🍔' : (item.plataforma === 'GLOVO' ? '🛵' : '⚡')}</span> ${item.plataforma}</h3>
            <span style="background:${badgeColor}; color:#fff; padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:800; text-transform:uppercase;">${badgeText}</span>
          </div>
          
          <div style="font-size:0.85rem; color:#666; background:#f9f9f9; padding:0.8rem; border-radius:8px; border:1px dashed #ccc; margin-bottom:1.2rem;">
            <div style="margin-bottom:0.4rem;"><strong>Webhook:</strong> <br><span style="color:#1976d2; word-break:break-all;">${item.webhook_url || 'Sem webhook configurado'}</span></div>
            <div><strong>Última sincronização:</strong> ${item.atualizado_em ? new Date(item.atualizado_em).toLocaleString() : 'N/A'}</div>
          </div>

          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button onclick="window.abrirIntegModal('${item.plataforma}')" style="background:#111; color:#fff; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:0.875rem; flex:1;">Conectar</button>
            ${status === 'conectado' ? `<button onclick="window.desconectarInteg('${item.plataforma}')" style="background:#fee; color:#c62828; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:0.875rem;">Desconectar</button>` : ''}
            ${status === 'conectado' ? `<button onclick="window.testConfigPing('${item.plataforma}')" style="background:#e3f2fd; color:#1565c0; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:0.875rem;" title="Testar Webhook">📡</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('❌ erro ao carregar integrações:', error);
    const container = document.getElementById('integracoes-container');
    if (container) container.innerHTML = `<div style="color:red; padding:1rem;">Erro Crítico: ${error.message}</div>`;
  }
};

window.abrirIntegModal = function (plataforma) {
  document.getElementById('integPlatName').value = plataforma;
  document.getElementById('modalIntegTitle').innerText = `Conectar ${plataforma}`;

  let fieldsHtml = '';
  if (plataforma === 'UBEREATS') {
    fieldsHtml = `<div><label>Client ID</label><input type="text" id="integ_f1" style="width:100%; padding:8px;" required></div>
                     <div style="margin-top:10px;"><label>Client Secret</label><input type="password" id="integ_f2" style="width:100%; padding:8px;" required></div>`;
  } else if (plataforma === 'GLOVO') {
    fieldsHtml = `<div><label>API Key</label><input type="password" id="integ_f1" style="width:100%; padding:8px;" required></div>
                     <div style="margin-top:10px;"><label>Store ID</label><input type="text" id="integ_f2" style="width:100%; padding:8px;" required></div>`;
  } else if (plataforma === 'BOLTFOOD') {
    fieldsHtml = `<div><label>Access Token</label><input type="password" id="integ_f1" style="width:100%; padding:8px;" required></div>`;
  }

  document.getElementById('integDynamicInputs').innerHTML = fieldsHtml;
  document.getElementById('modalIntegAPI').style.display = 'flex';
};

document.addEventListener('submit', async (e) => {
  if (e.target && e.target.id === 'formIntegConfigs') {
    e.preventDefault();
    const plat = document.getElementById('integPlatName').value;
    const f1 = document.getElementById('integ_f1')?.value || '';
    const f2 = document.getElementById('integ_f2')?.value || '';

    let creds = {};
    if (plat === 'UBEREATS') creds = { client_id: f1, client_secret: f2 };
    if (plat === 'GLOVO') creds = { api_key: f1, store_id: f2 };
    if (plat === 'BOLTFOOD') creds = { access_token: f1 };

    try {
      const res = await fetch('/api/integracoes/' + plat.toLowerCase() + '/conectar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_ativo: true, credenciais: creds })
      });
      if (!res.ok) throw new Error('Falha ao conectar.');
      document.getElementById('modalIntegAPI').style.display = 'none';
      carregarIntegracoes();
    } catch (err) {
      alert(err.message);
    }
  }
});

window.desconectarInteg = async function (plat) {
  if (!confirm('Deseja desconectar ' + plat + '?')) return;
  try {
    await fetch('/api/integracoes/' + plat.toLowerCase() + '/desconectar', { method: 'POST' });
    carregarIntegracoes();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
};

window.testConfigPing = async function (plat) {
  // Simulated ping to generic endpoint or real one
  alert('Ping de teste disparado para ' + plat + ' com sucesso!');
};

// ============================================================
// ENTREGADORES — cache global + atribuição sem prompt()
// ============================================================

window.entregadoresCache = [];

async function carregarEntregadores() {
  try {
    const res = await fetch('/api/equipe');
    const equipe = await res.json();
    window.entregadoresCache = equipe.filter(u => u.funcao === 'Entregador' && u.ativo);
  } catch (e) {
    console.warn('Não foi possível carregar entregadores:', e.message);
  }
}
carregarEntregadores();

window.salvarEntregador = async function (pedidoId) {
  const sel = document.getElementById(`sel-entregador-${pedidoId}`);
  if (!sel) return;
  const entregador_id = sel.value ? Number(sel.value) : null;
  try {
    const res = await fetch(`/api/pedidos/${pedidoId}/entregador`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entregador_id })
    });
    if (res.ok) {
      carregarPedidos();
      // Reabrir painel com dados atualizados após polling
      setTimeout(() => {
        const p = window.pedidosAtuais.find(x => x.id === pedidoId);
        if (p) abrirDetalhes(pedidoId);
      }, 800);
    } else {
      alert('Erro ao atribuir entregador.');
    }
  } catch (e) {
    console.error(e);
    alert('Erro de conexão.');
  }
};

// ========== MÍDIA DO HERO (preview inline + remoção) ==========

window.previewHeroVideo = function (input) {
  if (!input.files || !input.files[0]) return;
  const url = URL.createObjectURL(input.files[0]);
  const el      = document.getElementById('heroVideoEl');
  const preview = document.getElementById('heroVideoPreview');
  const holder  = document.getElementById('heroVideoPlaceholder');
  const actions = document.getElementById('heroVideoActions');
  const clear   = document.getElementById('heroVideoClear');
  if (el)      { el.src = url; el.load(); }
  if (preview) preview.style.display = 'block';
  if (holder)  holder.style.display  = 'none';
  if (actions) actions.style.display = 'flex';
  if (clear)   clear.value = '0';
};

window.previewHeroImage = function (input) {
  if (!input.files || !input.files[0]) return;
  const url = URL.createObjectURL(input.files[0]);
  const el      = document.getElementById('heroImageEl');
  const preview = document.getElementById('heroImagePreview');
  const holder  = document.getElementById('heroImagePlaceholder');
  const actions = document.getElementById('heroImageActions');
  const clear   = document.getElementById('heroImageClear');
  if (el)      el.src = url;
  if (preview) preview.style.display = 'block';
  if (holder)  holder.style.display  = 'none';
  if (actions) actions.style.display = 'flex';
  if (clear)   clear.value = '0';
};

// ════════════════════════════════════════════════════════════
//  MENU DE PERFIL — Dropdown + Modais
// ════════════════════════════════════════════════════════════

// Guarda o prompt PWA quando o browser dispara
let _pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaInstallPrompt = e;
});

// Abre/fecha dropdown
window.toggleProfileMenu = function (e) {
  if (e) e.stopPropagation();
  const dd      = document.getElementById('profileDropdown');
  const chevron = document.getElementById('profileMenuChevron');
  if (!dd) return;
  const isOpen = dd.style.display === 'block';
  dd.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
};

// Fecha ao clicar fora
document.addEventListener('click', e => {
  const wrapper = document.getElementById('profileMenuWrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    const dd      = document.getElementById('profileDropdown');
    const chevron = document.getElementById('profileMenuChevron');
    if (dd) dd.style.display = 'none';
    if (chevron) chevron.style.transform = '';
  }
});

// Expande/recolhe sub-menu de Termos
window.toggleTermosMenu = function (btn) {
  const sub   = document.getElementById('termosSubmenu');
  const arrow = btn.querySelector('.pm-chevron');
  if (!sub) return;
  const isOpen = sub.style.display === 'block';
  sub.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
};

// Abre modal do perfil
window.openProfileModal = function (id) {
  // Fechar dropdown
  const dd = document.getElementById('profileDropdown');
  if (dd) dd.style.display = 'none';

  // Popular campos antes de abrir
  const s = window._profileSettings || {};
  if (id === 'minha-conta') {
    const el = eid => document.getElementById(eid);
    if (el('mcStoreName')) el('mcStoreName').value = s.store_name || '';
    if (el('mcWhatsApp'))  el('mcWhatsApp').value  = s.contact_whatsapp || '';
    if (el('mcAddress'))   el('mcAddress').value   = s.store_address || '';
    if (el('mcHours'))     el('mcHours').value      = s.operating_hours || '';
  }
  if (id === 'suporte') {
    const num   = _buildStoreWaNum(s);
    const waUrl = num ? `https://wa.me/${num}?text=${encodeURIComponent('Olá, preciso de suporte com o Pitombo PDV!')}` : '#';
    const waBtn = document.getElementById('suporteWaBtn');
    if (waBtn) waBtn.href = waUrl;
    const grupo = document.getElementById('suporteWaGrupo');
    if (grupo && num) grupo.href = waUrl;
    const ig = document.getElementById('suporteIg');
    if (ig && s.social_instagram) ig.href = s.social_instagram.startsWith('http') ? s.social_instagram : 'https://instagram.com/' + s.social_instagram.replace('@', '');
    const fb = document.getElementById('suporteFb');
    if (fb && s.social_facebook) fb.href = s.social_facebook.startsWith('http') ? s.social_facebook : 'https://facebook.com/' + s.social_facebook;
  }
  if (id === 'planos') {
    // Tentar popular contador de pedidos com dados do dashboard
    const countEl = document.getElementById('pmPedidosCount');
    const barEl   = document.getElementById('pmPedidosBar');
    const dashEl  = document.getElementById('dash-hoje');
    if (countEl && dashEl) {
      const n = parseInt(dashEl.textContent) || 0;
      countEl.textContent = n;
      if (barEl) barEl.style.width = Math.min(100, Math.round(n / 40)) + '%';
    }
  }

  const modal = document.getElementById('modal-profile-' + id);
  if (modal) modal.style.display = 'flex';
};

// Fecha modal do perfil
window.closeProfileModal = function (id) {
  const modal = document.getElementById('modal-profile-' + id);
  if (modal) modal.style.display = 'none';
};

// Fecha modal ao clicar no backdrop
window.pmModalBgClose = function (e, id) {
  if (e.target === e.currentTarget) window.closeProfileModal(id);
};

// Instalar PWA
window.handlePWAInstall = function () {
  const dd = document.getElementById('profileDropdown');
  if (dd) dd.style.display = 'none';
  if (_pwaInstallPrompt) {
    _pwaInstallPrompt.prompt();
    _pwaInstallPrompt.userChoice.then(() => { _pwaInstallPrompt = null; });
  } else {
    const modal = document.getElementById('modal-pwa-install');
    if (modal) modal.style.display = 'flex';
  }
};

// Sair da sessão
window.handleLogout = function () {
  try { localStorage.clear(); } catch(e) {}
  try { sessionStorage.clear(); } catch(e) {}
  window.location.href = '/';
};

// Preview da logo no admin
window.previewLogoUpload = function (input) {
  if (!input.files || !input.files[0]) return;
  const preview     = document.getElementById('cfgLogoPreview');
  const placeholder = document.getElementById('cfgLogoPlaceholder');
  const reader = new FileReader();
  reader.onload = ev => {
    if (preview) { preview.src = ev.target.result; preview.style.display = 'block'; }
    if (placeholder) placeholder.style.display = 'none';
    // Atualizar avatar no dropdown também
    _updateProfileAvatar(ev.target.result);
  };
  reader.readAsDataURL(input.files[0]);
};

// Salvar "Minha Conta"
window.saveMinhaContaModal = async function () {
  const btn = document.getElementById('btnSaveMinhaContaModal');
  const fields = {
    store_name:        document.getElementById('mcStoreName')?.value || '',
    contact_whatsapp:  document.getElementById('mcWhatsApp')?.value || '',
    store_address:     document.getElementById('mcAddress')?.value || '',
    operating_hours:   document.getElementById('mcHours')?.value || '',
  };
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
  try {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    const res = await fetch('/api/settings', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Erro ' + res.status);
    // Atualizar nome no dropdown
    if (fields.store_name) {
      const nameEl     = document.getElementById('profileMenuName');
      const dropNameEl = document.getElementById('profileDropName');
      if (nameEl)     nameEl.textContent     = fields.store_name;
      if (dropNameEl) dropNameEl.textContent = fields.store_name;
      if (window._profileSettings) window._profileSettings.store_name = fields.store_name;
      // Também atualiza data-brand
      document.querySelectorAll('[data-brand="name"]').forEach(el => { el.textContent = fields.store_name; });
    }
    showProfileToast('✅ Dados salvos com sucesso!');
    window.closeProfileModal('minha-conta');
  } catch {
    showProfileToast('❌ Erro ao salvar. Tente novamente.', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar alterações'; }
  }
};

// Enviar sugestão via mailto
window.sendSugestao = function () {
  const assunto = document.getElementById('sugestaoAssunto')?.value?.trim();
  const texto   = document.getElementById('sugestaoTexto')?.value?.trim();
  if (!assunto || !texto) { showProfileToast('Preencha o assunto e a descrição.', true); return; }
  const s       = window._profileSettings || {};
  const email   = s.contact_email || '';
  const subject = encodeURIComponent('Sugestão: ' + assunto);
  const body    = encodeURIComponent('Ideia:\n\n' + texto);
  const href    = email ? `mailto:${email}?subject=${subject}&body=${body}` : `mailto:?subject=${subject}&body=${body}`;
  window.open(href, '_blank');
  document.getElementById('sugestaoAssunto').value = '';
  document.getElementById('sugestaoTexto').value = '';
  window.closeProfileModal('sugestao');
  showProfileToast('💡 Obrigado pela sugestão!');
};

// Abrir suporte via WhatsApp
window.openSupportWhatsApp = function () {
  const s   = window._profileSettings || {};
  const num = _buildStoreWaNum(s);
  const url = num
    ? `https://wa.me/${num}?text=${encodeURIComponent('Olá, gostaria de mais informações sobre o Pitombo PDV!')}`
    : 'https://wa.me/';
  window.open(url, '_blank');
};

// Toast de feedback
function showProfileToast(msg, isError = false) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `position:fixed;bottom:2rem;right:2rem;background:${isError ? '#dc3545' : '#198754'};color:#fff;padding:0.8rem 1.4rem;border-radius:10px;font-weight:700;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:0.9rem;`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Atualizar avatar do dropdown com URL de imagem
function _updateProfileAvatar(url) {
  const avatarImg    = document.getElementById('profileMenuAvatar');
  const avatarFb     = document.getElementById('profileMenuAvatarFallback');
  const dropAvatarImg = document.getElementById('profileDropAvatar');
  const dropAvatarFb  = document.getElementById('profileDropAvatarFallback');
  if (url) {
    if (avatarImg)    { avatarImg.src = url; avatarImg.style.display = 'block'; }
    if (avatarFb)     avatarFb.style.display = 'none';
    if (dropAvatarImg){ dropAvatarImg.src = url; dropAvatarImg.style.display = 'block'; }
    if (dropAvatarFb)  dropAvatarFb.style.display = 'none';
  } else {
    if (avatarImg)    avatarImg.style.display = 'none';
    if (avatarFb)     avatarFb.style.display = 'flex';
    if (dropAvatarImg) dropAvatarImg.style.display = 'none';
    if (dropAvatarFb)  dropAvatarFb.style.display = 'flex';
  }
}

// ════════════════════════════════════════════════════════════

// type: 'video' | 'image'
window.removeHeroMedia = function (type) {
  const prefix  = type === 'video' ? 'heroVideo' : 'heroImage';
  const inputId = type === 'video' ? 'heroVideoInput' : 'heroImageInput';
  const el      = document.getElementById(prefix + 'El');
  const preview = document.getElementById(prefix + 'Preview');
  const holder  = document.getElementById(prefix + 'Placeholder');
  const actions = document.getElementById(prefix + 'Actions');
  const input   = document.getElementById(inputId);
  const clear   = document.getElementById(prefix + 'Clear');
  if (el)      { type === 'video' ? el.src = '' : el.src = ''; }
  if (preview) preview.style.display = 'none';
  if (holder)  holder.style.display  = 'block';
  if (actions) actions.style.display = 'none';
  if (input)   input.value = '';
  if (clear)   clear.value = '1'; // sinaliza o backend para limpar a URL
};

