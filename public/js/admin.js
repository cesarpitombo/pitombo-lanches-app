// TEMP: auth desabilitada para testes — reativar: remover o bloco abaixo e descomentar o original
window._currentUser = { id: 0, funcao: 'Admin', nome: 'Teste (bypass)' }; // bypass total
// Sincronizar UI após DOM pronto (settings load vai chamar _syncUserProfileUI de novo)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _syncUserProfileUI);
} else {
  _syncUserProfileUI();
}

/* ORIGINAL — descomentar para reativar:
(async () => {
  try {
    const r = await apiFetch('/api/equipe/me');
    if (!r.ok) { localStorage.removeItem('pitombo_token'); window.location.href = '/login'; return; }
    const user = await r.json();

    // Funções que não pertencem ao painel admin são redirecionadas
    if (user.funcao === 'Cozinheiro') { window.location.href = '/cozinha'; return; }
    if (user.funcao === 'Entregador') { window.location.href = '/entregador'; return; }

    // Guardar user no estado global para uso no controlo de secções
    window._currentUser = user;

    // Aplicar restrições de sidebar assim que o DOM estiver pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        _aplicarPermissoesSidebar(user.funcao);
        _syncUserProfileUI();
      });
    } else {
      _aplicarPermissoesSidebar(user.funcao);
      _syncUserProfileUI();
    }
  } catch {
    // Erro de rede — não redirecionar (pode ser offline temporário)
  }
})();
*/

// ── Mapa de secções permitidas por função ─────────────────────────────────
// null = sem restrição; Set(...) = apenas estas secções permitidas
const ALLOWED_SECTIONS = {
  'Admin':      null,
  'Manager':    null,
  'Garçom':     new Set(['pedidos', 'produtos']),
  'Cozinheiro': new Set([]),
  'Entregador': new Set([]),
};

function _aplicarPermissoesSidebar(funcao) {
  const allowed = ALLOWED_SECTIONS[funcao];
  if (allowed === null) return; // Admin/Manager: acesso total

  // Ocultar botões de secção não permitida
  document.querySelectorAll('.menu-item[data-target]').forEach(btn => {
    if (!allowed.has(btn.dataset.target)) {
      const li = btn.closest('li');
      if (li) li.style.display = 'none'; else btn.style.display = 'none';
    }
  });

  // Ocultar accordion Configurações se nenhum filho for permitido
  const submenuConfig   = document.getElementById('submenuConfig');
  const btnToggleConfig = document.getElementById('btnToggleConfig');
  if (submenuConfig && btnToggleConfig) {
    const temFilhoVisivel = [...submenuConfig.querySelectorAll('.menu-item[data-target]')]
      .some(b => allowed.has(b.dataset.target));
    if (!temFilhoVisivel) {
      const li = btnToggleConfig.closest('li');
      if (li) li.style.display = 'none'; else btnToggleConfig.style.display = 'none';
    }
  }

  // Ocultar links de página (Histórico, Cozinha) para funções sem permissão
  document.querySelectorAll('.menu-link').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href.includes('historico') || href.includes('cozinha') || href.includes('entregador')) {
      const li = a.closest('li');
      if (li) li.style.display = 'none'; else a.style.display = 'none';
    }
  });
}

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

  // Change 1: limpar estado persistido de versões anteriores
  const APP_STATE_VERSION = 2;
  try {
    const saved = parseInt(localStorage.getItem('pitombo_admin_state_v') || '0');
    if (saved < APP_STATE_VERSION) {
      localStorage.removeItem('pitombo_admin_filter');
      localStorage.removeItem('pitombo_admin_type');
      localStorage.setItem('pitombo_admin_state_v', String(APP_STATE_VERSION));
      console.log('[ADMIN] State migrated to v' + APP_STATE_VERSION);
    }
  } catch(e) {}

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
      // Verificar permissão antes de activar a secção
      const cu = window._currentUser;
      if (cu && ALLOWED_SECTIONS[cu.funcao] !== null && !ALLOWED_SECTIONS[cu.funcao].has(btn.dataset.target)) {
        return; // Bloqueia — o botão não devia estar visível
      }

      // FIX: guard contra tab-content inexistente no DOM (ex: 'produtos' pode ser gerenciado por ProdutosManager sem section própria)
      const targetEl = btn.dataset.target ? document.getElementById(btn.dataset.target) : null;
      if (!targetEl) {
        console.warn('[Nav] tab-content não encontrado para target:', btn.dataset.target);
        // Ainda processar callbacks de managers específicos mesmo sem section
      } else {
        menuItems.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        targetEl.classList.add('active');
        if (pageTitle) pageTitle.textContent = btn.innerText.replace(/📦|🍔/g, '').trim();
      }

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
      } else if (btn.dataset.target === 'chatbot-whatsapp') {
        if (typeof ChatbotManager !== 'undefined') {
          ChatbotManager.init();
        } else {
          console.error('ChatbotManager não carregado.');
        }
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

    // Bloquear navegação para secção não autorizada via URL
    const cu = window._currentUser;
    if (cu) {
      const allowedSet = ALLOWED_SECTIONS[cu.funcao];
      if (allowedSet !== null && !allowedSet.has(hash)) {
        window.location.hash = 'pedidos';
        return;
      }
    }

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

  // Funcao dinamica de acoes por tipo de pedido
  // Mesa e Balcao: pronto -> entregue (sem passar por em_entrega)
  // Delivery:      pronto -> em_entrega -> entregue
  window.getAcoesPorTipo = function(status, tipo) {
    const mapDelivery = {
      'pendente_aprovacao': ['em_preparo', 'rejeitado'],
      'recebido':           ['em_preparo', 'cancelado'],
      'em_preparo':         ['pronto', 'cancelado'],
      'pronto':             ['em_entrega', 'cancelado'],
      'em_entrega':         ['entregue', 'cancelado'],
      'entregue':           []
    };
    const mapMesaBalcao = {
      'pendente_aprovacao': ['em_preparo', 'rejeitado'],
      'recebido':           ['em_preparo', 'cancelado'],
      'em_preparo':         ['pronto', 'cancelado'],
      'pronto':             ['entregue', 'cancelado'],
      'em_entrega':         ['entregue', 'cancelado'],
      'entregue':           []
    };
    return ((tipo === 'delivery') ? mapDelivery : mapMesaBalcao)[status] || [];
  };

  // Label de status contextualizado por tipo
  window.getStatusLabelPorTipo = function(status, tipo) {
    if (status === 'pronto') {
      if (tipo === 'mesa')   return '\uD83C\uDF7D\uFE0F Pronto p/ Servir';
      if (tipo === 'balcao') return '\uD83C\uDFE0 Aguardando Retirada';
      return '\uD83D\uDCE6 Pronto';
    }
    return (window.statusMap[status] || {}).label || status;
  };

  // acoesMap estatico mantido para retrocompatibilidade
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

  // Busca e Filtros — sempre começa limpo (evita autofill do browser)
  const inputBusca = document.getElementById('inputBusca');
  if (inputBusca) {
    inputBusca.value = '';
    searchTerm = '';
    inputBusca.addEventListener('input', (e) => {
      searchTerm = e.target.value.toLowerCase();
      renderPedidos();
    });
  }


  document.querySelectorAll('.type-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.type-tab').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentTypeFilter = e.currentTarget.dataset.type;
      renderPedidos();
    });
  });

  document.querySelectorAll('.status-filter').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.status-filter').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentStatusFilter = e.currentTarget.dataset.status;
      renderPedidos();
    });
  });

  // ============================================================
  // TOAST — feedback visual rápido
  // ============================================================
  let _toastTimer = null;
  function showToast(msg, duration = 2200) {
    const el = document.getElementById('ola-toast');
    if (!el) return;
    clearTimeout(_toastTimer);
    el.textContent = msg;
    el.style.display = 'block';
    _toastTimer = setTimeout(() => { el.style.display = 'none'; }, duration);
  }
  window.showToast = showToast;

  // ============================================================
  // ATALHOS DE TECLADO — A/R/P/F + ESC
  // ============================================================
  window._pedidoSelecionado = null;

  document.addEventListener('keydown', function (e) {
    // Ignorar quando digitando em inputs
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const id = window._pedidoSelecionado;
    const p = id ? (window.pedidosAtuais || []).find(x => x.id === id) : null;

    switch (e.key.toUpperCase()) {
      case 'ESCAPE':
        if (id) { fecharDetalhes(); showToast('Painel fechado'); }
        break;
      case 'A': // Aceitar
        if (p && p.status === 'pendente_aprovacao') {
          e.preventDefault();
          alterarStatus(id, 'em_preparo');
          showToast(`✔ Pedido #${id} aceito`);
        }
        break;
      case 'R': // Rejeitar
        if (p && !['entregue', 'cancelado', 'rejeitado'].includes(p.status)) {
          e.preventDefault();
          if (confirm(`Rejeitar pedido #${id}?`)) {
            alterarStatus(id, 'rejeitado');
            showToast(`✕ Pedido #${id} rejeitado`);
          }
        }
        break;
      case 'P': // PRONTO
        if (p && p.status === 'em_preparo') {
          e.preventDefault();
          alterarStatus(id, 'pronto');
          showToast(`🥘 Pedido #${id} está pronto!`);
        }
        break;
      case 'F': // FINALIZAR / ENTREGAR
        if (p) {
          e.preventDefault();
          // Acoes dinamicas por tipo (mesa/balcao nao passam por em_entrega)
          const nexts = window.getAcoesPorTipo(p.status, p.tipo);
          if (nexts.includes('entregue')) {
            alterarStatus(id, 'entregue');
            const msgFim = p.tipo === 'mesa' ? 'Servido' : 'Entregue ao cliente';
            showToast(`✓ #${id}: ${msgFim}`);
          } else if (nexts.length > 0) {
            const next = nexts.find(s => s !== 'cancelado' && s !== 'rejeitado') || nexts[0];
            alterarStatus(id, next);
            const lbl = window.getStatusLabelPorTipo(next, p.tipo);
            showToast(`▶ Pedido #${id} → ${lbl}`);
          }
        }
        break;
      default: break;
    }
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

  // Flag global: bloqueia polling automático enquanto uma ação está em andamento
  window._pedidoAtualizando = false;

  async function carregarPedidos() {
    // FIX: se uma ação (aceitar/rejeitar/etc) está em andamento, não sobrescrever a lista
    if (window._pedidoAtualizando) {
      console.log('[carregarPedidos] bloqueado — ação em andamento');
      return;
    }

    const lista = document.getElementById('listaPedidos');
    // Só mostrar "loading" na primeira carga — atualizações periódicas são silenciosas
    if (!window.pedidosAtuais || window.pedidosAtuais.length === 0) {
      lista.innerHTML = '<div class="loading">Carregando pedidos...</div>';
    }

    try {
      const res = await apiFetch('/api/pedidos');
      console.log('[carregarPedidos] HTTP', res.status);
      if (!res.ok) {
        console.error('[carregarPedidos] erro ao buscar pedidos — lista mantida');
        return; // Não apagar lista existente em caso de falha
      }
      const pedidos = await res.json();
      console.log('[carregarPedidos] recebidos:', pedidos.length, 'pedidos');
      // Só sobrescrever se a resposta for um array válido
      if (Array.isArray(pedidos)) {
        window.pedidosAtuais = pedidos;
      } else {
        console.warn('[carregarPedidos] resposta inesperada:', pedidos);
        return;
      }

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

      console.log(`[ADMIN_POLL] renderPedidos() — selectedId=${window._pedidoSelecionado || 'none'}`);
      renderPedidos();

      // Sincronização leve do painel: atualiza apenas o conteúdo interno sem fechar/abrir
      // NÃO chama abrirDetalhes() aqui — isso causaria DOM thrashing e race conditions
      if (window._pedidoSelecionado) {
        const still = (window.pedidosAtuais || []).find(x => x.id === window._pedidoSelecionado);
        if (!still) {
          console.log(`[ADMIN_POLL] pedido #${window._pedidoSelecionado} não encontrado — fechando painel`);
          fecharDetalhes();
        }
        // Se still existe, o PIN acima garantiu que ele está na lista; painel fica como está
      }

    } catch (err) {
      // Change 7: null-guard para lista + log melhorado
      console.error('[ADMIN_POLL] erro em carregarPedidos:', err);
      if (lista) lista.innerHTML = '<div class="loading" style="color:red">Erro ao carregar pedidos.</div>';
    }
  }

  function renderPedidos() {
    const lista = document.getElementById('listaPedidos');
    let pedidos = window.pedidosAtuais || [];

    // Contadores Operacionais e KPIs
    const counts = {
      type: { todos: 0, balcao: 0, delivery: 0, mesa: 0 },
      status: { todos: 0, pendente: 0, em_curso: 0, atrasados: 0, concluidos: 0 }
    };
    let fatHoje = 0;
    let pedidosPagosCount = 0;

    // isFinished: pedido que saiu da fila operacional
    const isFinished = p => ['entregue', 'cancelado', 'rejeitado'].includes(p.status);

    pedidos.forEach(p => {
      const active = !isFinished(p);
      const diffM = Math.floor((new Date() - new Date(p.criado_em)) / 60000);
      const isAtrasado = active && diffM >= 20;

      // Badges de tipo — contar apenas pedidos ainda ativos
      if (active) {
        counts.type.todos++;
        if (p.tipo === 'balcao') counts.type.balcao++;
        if (p.tipo === 'delivery') counts.type.delivery++;
        if (p.tipo === 'mesa') counts.type.mesa++;
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
        pedidosPagosCount++;
      }
    });

    // Atualiza badges
    if (document.getElementById('cnt-type-todos')) document.getElementById('cnt-type-todos').textContent = counts.type.todos;
    if (document.getElementById('cnt-type-balcao')) document.getElementById('cnt-type-balcao').textContent = counts.type.balcao;
    if (document.getElementById('cnt-type-delivery')) document.getElementById('cnt-type-delivery').textContent = counts.type.delivery;
    if (document.getElementById('cnt-type-mesa')) document.getElementById('cnt-type-mesa').textContent = counts.type.mesa;

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

    // Métricas avançadas
    const ticketMedio = pedidosPagosCount > 0 ? fatHoje / pedidosPagosCount : 0;
    const elTicket = document.getElementById('dash-ticket-medio');
    if (elTicket) {
      const tv = window.formatCurrency(ticketMedio);
      elTicket.setAttribute('data-real', tv);
      if (elTicket.getAttribute('data-hidden') !== 'true') elTicket.textContent = tv;
    }
    const umaHoraAtras = new Date(Date.now() - 3600000);
    const pedidosUltimaHora = pedidos.filter(p => new Date(p.criado_em) >= umaHoraAtras).length;
    const elPorHora = document.getElementById('dash-por-hora');
    if (elPorHora) elPorHora.innerHTML = `${pedidosUltimaHora} <span style="font-size:0.8rem;font-weight:500;color:#6b7280;">pedidos</span>`;

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
        const end = p.endereco ? p.endereco.toLowerCase() : '';
        const tipoL = window.getStatusLabelPorTipo(p.status, p.tipo).toLowerCase();
        const items = (p.itens || []).map(i => i.nome_produto.toLowerCase()).join(' ');
        
        return nome.includes(searchTerm) || 
               tel.includes(searchTerm) || 
               idStr.includes(searchTerm) || 
               end.includes(searchTerm) ||
               p.tipo.includes(searchTerm) ||
               tipoL.includes(searchTerm) ||
               items.includes(searchTerm);
      }
      return true;
    });

    // PIN: se há pedido selecionado no painel, garante que ele sempre aparece na lista
    // mesmo que o filtro ativo não o incluiria (ex: status mudou enquanto painel estava aberto)
    if (window._pedidoSelecionado) {
      const jaEsta = filtered.some(p => p.id === window._pedidoSelecionado);
      if (!jaEsta) {
        const pinnedPedido = pedidos.find(p => p.id === window._pedidoSelecionado);
        if (pinnedPedido) {
          console.log(`[ADMIN_RENDER] pedido #${window._pedidoSelecionado} fixado na lista (filtro ativo: ${currentStatusFilter})`);
          filtered = [pinnedPedido, ...filtered];
        }
      }
    }
    // Change 8: log APÓS PIN para que filtered.length inclua o pedido fixado
    console.log(`[ADMIN_RENDER] start — filter=${currentStatusFilter} type=${currentTypeFilter} selected=${window._pedidoSelecionado || 'none'} total=${pedidos.length} filtered=${filtered.length}`);

    if (filtered.length === 0) {
      const emptyMsg = currentStatusFilter === 'atrasados'
        ? 'Nenhum pedido atrasado. 🎉'
        : 'Nenhum pedido ativo no momento.';
      const emptyHtml = `<div style="text-align:center;padding:3rem 1rem;color:#aaa;">
        <div style="font-size:2.5rem;margin-bottom:0.8rem;">✅</div>
        <div style="font-size:1.1rem;font-weight:700;color:#555;">${emptyMsg}</div>
        <div style="font-size:0.88rem;margin-top:0.4rem;">A fila está vazia por agora.</div>
      </div>`;
      // BUGFIX: resetar hash — sem isso, o próximo render com dados reais seria ignorado
      // porque o hash antigo (de quando havia pedidos) ainda estaria em cache
      window._lastPedidosHash = null;
      if (lista) lista.innerHTML = emptyHtml;
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

    if (lista) lista.innerHTML = filtered.map(p => {
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
        // FIX: alterarStatus agora abre o painel internamente, stopPropagation ainda necessário
        // para não disparar abrirDetalhes via onclick da div pai (que chamaria antes que alterarStatus abra)
        botoesHtml = `
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.8rem; width:100%; margin-top:0.5rem;">
            <button class="btn-action" style="background:#198754; color:white; border:none; padding:0.8rem; border-radius:6px; font-weight:800; cursor:pointer; font-size:0.9rem; transition:0.2s; box-shadow:0 3px 6px rgba(25,135,84,0.3);" onclick="event.stopPropagation(); console.log('[BUG-FIX] clique detectado Aceitar card #${p.id}'); alterarStatus(${p.id}, 'em_preparo')">✔ ACEITAR PEDIDO</button>
            <button class="btn-action" style="background:#dc3545; color:white; border:none; padding:0.8rem; border-radius:6px; font-weight:800; cursor:pointer; font-size:0.9rem; transition:0.2s; box-shadow:0 3px 6px rgba(220,53,69,0.3);" onclick="event.stopPropagation(); alterarStatus(${p.id}, 'rejeitado')">✖ REJEITAR</button>
          </div>`;
      } else if (p.status === 'recebido') {
        botoesHtml = `<button class="btn-action btn-em_preparo" onclick="event.stopPropagation(); alterarStatus(${p.id}, 'em_preparo')">ENVIAR PARA PREPARO</button>`;
      } else if (p.status === 'em_preparo') {
        botoesHtml = `<button class="btn-action btn-pronto" style="font-weight:800;" onclick="event.stopPropagation(); alterarStatus(${p.id}, 'pronto')">MARCAR COMO PRONTO</button>`;
      } else if (p.status === 'pronto') {
        // Fluxo por tipo: delivery->em_entrega; mesa/balcao->entregue direto
        if (p.tipo === 'delivery') {
          botoesHtml = `<button class="btn-action btn-em_entrega" onclick="event.stopPropagation(); alterarStatus(${p.id}, 'em_entrega')">🛵 SAIU P/ ENTREGA</button>`;
        } else {
          const lblFim = p.tipo === 'mesa' ? '🍽️ SERVIR À MESA' : '🏪 ENTREGUE AO CLIENTE';
          botoesHtml = `<button class="btn-action btn-entregue" style="background:#198754;" onclick="event.stopPropagation(); alterarStatus(${p.id}, 'entregue')">${lblFim}</button>`;
        }
      } else if (p.status === 'em_entrega') {
        botoesHtml = `<button class="btn-action btn-entregue" onclick="event.stopPropagation(); alterarStatus(${p.id}, 'entregue')">CONFIRMAR RECEBIMENTO</button>`;
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
        financialInfo += ` <button onclick="event.stopPropagation(); marcarPago(${p.id})" style="background:#198754;color:white;border:none;border-radius:4px;padding:0.2rem 0.6rem;font-size:0.75rem;cursor:pointer;margin-left:0.5rem;font-weight:bold;">✔ Marcar Pago</button>`;
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
          <div class="order-card status-${p.status} ${cardClassAdd}" style="position:relative; cursor:pointer; ${cardStyleAdd}" onclick="abrirDetalhes(${p.id})">
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
                  <button class="btn-icon btn-detalhes" onclick="event.stopPropagation(); abrirDetalhes(${p.id})" title="Detalhes Completos">🔍</button>
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

    // Renderiza Lista (Table) — layout OlaClick
    const tblBody = document.getElementById('listaPedidosTabela');
    if (tblBody) {
      // Diff rendering: skip full re-render if nothing changed
      const newHash = filtered.map(p =>
        `${p.id}:${p.status}:${p.payment_status}:${p.entregador_id || 0}:${p.total}`
      ).join('|');
      if (newHash === window._lastPedidosHash && tblBody.children.length > 0) {
        return; // nada mudou — evitar re-render desnecessário
      }
      window._lastPedidosHash = newHash;

      // Smart grouping: identificar entregas na mesma rua
      const streetGroups = {};
      filtered.forEach(p => {
        if (p.tipo === 'delivery' && !isFinished(p) && p.endereco) {
          const streetKey = p.endereco.split(',')[0].trim().toLowerCase();
          streetGroups[streetKey] = (streetGroups[streetKey] || 0) + 1;
        }
      });
      const sameStreetIds = {};
      filtered.forEach(p => {
        if (p.tipo === 'delivery' && !isFinished(p) && p.endereco) {
          const k = p.endereco.split(',')[0].trim().toLowerCase();
          if (streetGroups[k] >= 2) sameStreetIds[p.id] = streetGroups[k];
        }
      });

      tblBody.innerHTML = filtered.map(p => {
        const isActive = !isFinished(p);
        const diffMinutes = Math.floor((new Date() - new Date(p.criado_em)) / 60000);

        const timeStr = new Date(p.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date(p.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const tipoLabel = p.tipo === 'balcao' ? 'Balcão' : p.tipo === 'mesa' ? 'Mesa' : 'Delivery';
        const tipoClass = p.tipo === 'balcao' ? 'balcao' : p.tipo === 'mesa' ? 'mesa' : '';
        const stLabel = window.getStatusLabelPorTipo(p.status, p.tipo);
        const pgPago = (p.payment_status || '') === 'pago';
        const pgBadge = pgPago
          ? `<span class="ola-pagamento-badge pago">✓ Pago</span>`
          : `<span class="ola-pagamento-badge nao_pago">Não pago</span>`;

        // 4-tier priority system
        let prioCls = '';
        let timerCls = 'ok';
        let timerPrefix = '⏱ ';
        if (isActive) {
          if (diffMinutes >= 30)      { prioCls = 'prio-critico'; timerCls = 'critico'; timerPrefix = '🔴 '; }
          else if (diffMinutes >= 20) { prioCls = 'prio-alerta';  timerCls = 'alerta';  timerPrefix = '⚠️ '; }
          else if (diffMinutes >= 10) { prioCls = 'prio-atencao'; timerCls = 'atencao'; timerPrefix = '🟡 '; }
        }
        const timerHtml = isActive
          ? `<span class="ola-timer ${timerCls}">${timerPrefix}${diffMinutes}m</span>` : '';

        // CRM badge
        const count = parseInt(p.cliente_pedidos_count) || 1;
        let crmBadge = '';
        if (count >= 10) crmBadge = '<span class="ola-crm-badge" title="Top cliente">🏆</span>';
        else if (count >= 3) crmBadge = '<span class="ola-crm-badge" title="Frequente">🔄</span>';
        else if (count === 1) crmBadge = '<span class="ola-crm-badge" title="Novo">🌱</span>';

        // Smart grouping badge
        const grupoBadge = sameStreetIds[p.id]
          ? `<span class="ola-grupo-badge" title="${sameStreetIds[p.id]} pedidos na mesma rua — agrupar entrega">🚀 Agrupar</span>`
          : '';

        // Entregador
        const entregadorHtml = p.entregador
          ? `<span class="ola-entregador-badge">🛵 ${p.entregador}</span>`
          : (p.tipo === 'delivery' && isActive
              ? `<button class="btn-row" onclick="event.stopPropagation(); escolherEntregador(${p.id})">Escolher entregador ›</button>`
              : '');

        // Action buttons
        let btnAcoes = '';
        if (p.status === 'pendente_aprovacao') {
          // FIX: não usar stopPropagation — alterarStatus agora abre o painel internamente
          btnAcoes = `<button class="btn-row btn-row-aceitar" onclick="event.stopPropagation(); console.log('[BUG-FIX] clique detectado no botão Aceitar #${p.id}'); alterarStatus(${p.id},'em_preparo')">✔ Aceitar</button>
                      <button class="btn-row btn-row-rejeitar" onclick="event.stopPropagation(); alterarStatus(${p.id},'rejeitado')">✕ Rejeitar</button>`;
        } else if (isActive) {
          // Acoes dinamicas por tipo: mesa/balcao -> entregue direto, sem em_entrega
          const proxStatus = window.getAcoesPorTipo(p.status, p.tipo);
          proxStatus.forEach(st => {
            if (st === 'cancelado') {
              btnAcoes += `<button class="btn-row btn-row-cancelar" onclick="event.stopPropagation(); alterarStatus(${p.id},'${st}')" title="Cancelar">✕</button>`;
            } else if (st === 'entregue') {
              const lblFin = p.tipo === 'mesa' ? '✓ Servir' : (p.tipo === 'balcao' ? '✓ Retirado' : '✓ Finalizar');
              btnAcoes += `<button class="btn-row btn-row-entregue" onclick="event.stopPropagation(); alterarStatus(${p.id},'${st}')">${lblFin}</button>`;
            } else {
              const lbl = window.getStatusLabelPorTipo(st, p.tipo);
              btnAcoes += `<button class="btn-row btn-row-avancar" onclick="event.stopPropagation(); alterarStatus(${p.id},'${st}')">▶ ${lbl}</button>`;
            }
          });
          if (!pgPago) btnAcoes += `<button class="btn-row btn-row-pagar" onclick="event.stopPropagation(); marcarPago(${p.id})">$ Pagar</button>`;
        }

        const enderecoStr = p.endereco ? p.endereco.substring(0, 65) + (p.endereco.length > 65 ? '…' : '') : '';

        return `
          <tr class="ola-pedido-row pedido-row status-${p.status} ${prioCls}"
              data-id="${p.id}" onclick="abrirDetalhes(${p.id})">
            <td class="ola-td-data">
              <span class="ola-id">#${p.id}</span>
              <span class="ola-tipo-chip ${tipoClass}">${tipoLabel}</span>
              ${timerHtml}
              <span class="ola-date">${dateStr} ${timeStr}</span>
            </td>
            <td class="ola-td-estado">
              <span class="ola-status-badge ola-st-${p.status}">${stLabel}</span>
            </td>
            <td class="ola-td-valor">
              <span class="ola-valor">${window.formatCurrency(p.total)}</span>
              <span class="ola-method">${p.payment_method || 'Dinheiro'}</span>
              ${pgBadge}
            </td>
            <td class="ola-td-cliente">
              <span class="ola-cli-nome">${p.cliente}${crmBadge}${grupoBadge}</span>
              ${p.telefone ? `<a href="tel:${p.telefone.replace(/\D/g,'')}" class="ola-cli-tel-link" onclick="event.stopPropagation()">📞 ${p.telefone}</a>` : ''}
              ${enderecoStr ? `<div class="ola-cli-addr">📍 ${enderecoStr}</div>` : ''}
              ${entregadorHtml}
              <div class="ola-row-btns">${btnAcoes}</div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }


  window.alterarStatus = async function (id, novoStatus) {
    const TERMINAL = ['entregue', 'cancelado', 'rejeitado'];

    console.log(`[BUG-FIX] alterarStatus chamado — id:${id}, novoStatus:${novoStatus}`);

    // Guarda de estado local: pedido já terminal — fechar painel silenciosamente
    const pedidoAtual = (window.pedidosAtuais || []).find(x => x.id === id);
    if (pedidoAtual && TERMINAL.includes(pedidoAtual.status)) {
      console.log(`[BUG-FIX] pedido #${id} já é terminal (${pedidoAtual.status}), ignorando`);
      fecharDetalhes();
      return;
    }

    // BLOQUEIO: finalizar sem pagamento definido
    if (novoStatus === 'entregue' && pedidoAtual && pedidoAtual.payment_status === 'pendente') {
      const ok = confirm(
        `⚠️ Pedido #${id} ainda não tem pagamento definido.\n\nFinalizar mesmo assim marcará como "Não pago".\n\nDeseja continuar?`
      );
      if (!ok) return;
    }

    // BLOQUEIO: delivery sem telefone (aviso, não bloqueia)
    if (novoStatus === 'em_preparo' && pedidoAtual && pedidoAtual.tipo === 'delivery' && !pedidoAtual.telefone) {
      showToast('⚠️ Pedido sem telefone — contato com cliente não será possível');
    }

    // FIX: bloquear polling automático durante a ação para evitar race condition
    // _pedidoAtualizando permanece true até carregarPedidos() terminar (não antes)
    window._pedidoAtualizando = true;

    try {
      console.log('[alterarStatus] enviando PATCH /api/pedidos/' + id + '/status com status:', novoStatus);
      const res = await apiFetch(`/api/pedidos/${id}/status`, {
        method: 'PATCH',
        body: { status: novoStatus },
      });
      console.log('[alterarStatus] resposta HTTP:', res.status, '| ok:', res.ok);

      if (res.ok) {
        const dados = await res.json().catch(() => ({}));
        console.log('[alterarStatus] sucesso — dados retornados:', dados);
        
        // Toast de feedback baseado no novo status
        const lblStatus = window.getStatusLabelPorTipo(novoStatus, (pedidoAtual ? pedidoAtual.tipo : 'delivery'));
        if (novoStatus === 'entregue') showToast(`✅ Pedido #${id} finalizado com sucesso!`);
        else showToast(`⚡ Status #${id} alterado para: ${lblStatus}`);

        // FIX 1: Atualizar o item localmente com STATUS DO SERVIDOR (não só o novoStatus)
        const statusFinal = (dados && dados.status) ? dados.status : novoStatus;
        const idx = (window.pedidosAtuais || []).findIndex(x => x.id === id);
        if (idx !== -1) {
          window.pedidosAtuais[idx] = { ...window.pedidosAtuais[idx], status: statusFinal };
        }
        window._lastPedidosHash = null; // forçar re-render imediato

        // FIX 2: Ajustar filtro ANTES do renderPedidos para que a lista mostre corretamente
        // em uma única passagem (evita double-render e flicker)
        if (!TERMINAL.includes(statusFinal) &&
            (currentStatusFilter === 'pendente' || currentStatusFilter === 'em_curso')) {
          console.log(`[BUG-FIX] filtro '${currentStatusFilter}' → 'operacional' para manter pedido visível`);
          currentStatusFilter = 'operacional';
          document.querySelectorAll('.status-filter').forEach(b => b.classList.remove('active'));
          const btn = document.querySelector('.status-filter[data-status="operacional"]');
          if (btn) btn.classList.add('active');
        }

        // Re-renderizar com dados locais atualizados
        renderPedidos();

        // Se a ação resultou em estado terminal, fechar o painel
        if (TERMINAL.includes(statusFinal)) {
          console.log(`[BUG-FIX] status terminal — fechando painel`);
          fecharDetalhes();
        } else {
          // FIX 3: Abrir o painel lateral com os dados do pedido atualizado
          // (era o bug central: alterarStatus nunca abria o painel)
          console.log(`[BUG-FIX] abrindo painel lateral para pedido #${id}`);
          abrirDetalhes(id);
        }

        // FIX 4: manter _pedidoAtualizando=true até carregarPedidos() terminar
        // (evita que o setInterval de 10s dispare durante a requisição)
        await carregarPedidos();
        window._pedidoAtualizando = false;
        console.log(`[BUG-FIX] _pedidoAtualizando liberado após carregarPedidos`);

        // FIX 5: Re-abrir painel com dados frescos do servidor (garante que labels/botões estão corretos)
        // Só re-abre se ainda não for terminal (pode ter sido atualizado no servidor)
        if (!TERMINAL.includes(statusFinal)) {
          const pedidoFresco = (window.pedidosAtuais || []).find(x => x.id === id);
          if (pedidoFresco && !TERMINAL.includes(pedidoFresco.status)) {
            console.log(`[BUG-FIX] re-abrindo painel com dados frescos do servidor para #${id}`);
            abrirDetalhes(id);
          }
        }

      } else {
        const erro = await res.json().catch(() => ({}));
        console.error('[alterarStatus] erro servidor:', res.status, erro);
        // 409 = transição inválida (pedido já estava finalizado no servidor)
        if (res.status === 409) {
          fecharDetalhes();
          await carregarPedidos();
          window._pedidoAtualizando = false;
        } else {
          window._pedidoAtualizando = false;
          alert(erro.error || 'Erro ao atualizar status');
        }
      }
    } catch (err) {
      console.error('[alterarStatus] erro de rede:', err);
      window._pedidoAtualizando = false;
      alert('Erro de conexão ao atualizar status');
    }
  };

  window.abrirDetalhes = function (id) {
    // Change 3: logs de diagnóstico
    console.log(`[ADMIN_CLICK] abrirDetalhes(${id}) — filtro=${currentStatusFilter} type=${currentTypeFilter}`);
    const p = (window.pedidosAtuais || []).find(x => x.id === id);
    if (!p) { console.warn('[abrirDetalhes] pedido', id, 'não encontrado'); return; }

    window._pedidoSelecionado = id; // Rastreia para atalhos de teclado
    console.log(`[ADMIN_SELECTED_ID] _pedidoSelecionado = ${id}`);

    // Change 2: scope querySelector à tabela visível — ignora hidden cards de #listaPedidos
    const tbl = document.getElementById('listaPedidosTabela');
    if (tbl) {
      tbl.querySelectorAll('.pedido-row').forEach(r => r.classList.remove('row-selecionado'));
      const row = tbl.querySelector(`.pedido-row[data-id="${id}"]`);
      if (row) row.classList.add('row-selecionado');
    }

    const isActive = !['entregue', 'cancelado', 'rejeitado'].includes(p.status);
    const pgPago = p.payment_status === 'pago';
    const diffMinutes = Math.floor((new Date() - new Date(p.criado_em)) / 60000);
    const count = parseInt(p.cliente_pedidos_count) || 1;

    // --- Header ---
    document.getElementById('pdc-titulo').textContent = `#${p.id}`;
    const tipoBadgeEl = document.getElementById('pdc-tipo-badge');
    tipoBadgeEl.textContent = p.tipo === 'delivery' ? '🛵 Delivery' : p.tipo === 'mesa' ? '🍽️ Mesa' : '🏪 Balcão';
    tipoBadgeEl.className = 'ola-pdc-tipo-badge';
    const stBadgeEl = document.getElementById('pdc-status-badge');
    stBadgeEl.textContent = window.getStatusLabelPorTipo(p.status, p.tipo);
    stBadgeEl.className = `ola-pdc-status-badge ola-st-${p.status}`;

    // --- Sub-header ---
    const timerBadgeColor = diffMinutes >= 30 ? '#fee2e2;color:#dc2626'
      : diffMinutes >= 20 ? '#ffedd5;color:#ea580c'
      : diffMinutes >= 10 ? '#fef3c7;color:#92400e'
      : '#f3f4f6;color:#6b7280';
    document.getElementById('pdc-subheader').innerHTML =
      `<span>📅 ${new Date(p.criado_em).toLocaleString('pt-BR')}</span>` +
      `<span style="margin-left:auto;background:${timerBadgeColor};padding:1px 9px;border-radius:10px;font-weight:800;font-size:0.75rem;">⏱ ${diffMinutes}min</span>`;

    // --- Corpo: cliente + endereço + entregador ---
    const rawPhone = p.telefone ? p.telefone.replace(/\D/g, '') : '';
    const waPhone = rawPhone && rawPhone.length >= 10 && !rawPhone.startsWith('55') ? '55' + rawPhone : rawPhone;
    const waBtn = waPhone
      ? `<button class="ola-wa-btn" onclick="window.open('https://wa.me/${waPhone}','_blank')" title="WhatsApp">💬</button>`
      : '';
    const mapBtn = p.endereco
      ? `<button class="ola-map-btn" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}','_blank')" title="Ver no mapa">🗺️</button>`
      : '';

    const crmLabel = count >= 10
      ? '<span class="ola-pdc-crm" style="background:#fef3c7;color:#92400e;">🏆 Top</span>'
      : count >= 3
        ? '<span class="ola-pdc-crm" style="background:#dbeafe;color:#1d4ed8;">🔄 Frequente</span>'
        : '<span class="ola-pdc-crm" style="background:#dcfce7;color:#166534;">🌱 Novo</span>';

    // Entregador / choose
    const entregadores = window.entregadoresCache || [];
    const opts = entregadores.map(e =>
      `<option value="${e.id}" ${p.entregador_id == e.id ? 'selected' : ''}>${e.nome}</option>`
    ).join('');
    let entregadorSection = '';
    if (p.entregador) {
      entregadorSection = `<span class="ola-entregador-badge">Entregador: ${p.entregador}</span>`;
    } else if (p.tipo === 'delivery' && isActive) {
      entregadorSection = `
        <div class="pdc-entregador-row">
          <select id="sel-entregador-${p.id}" class="pdc-select-entregador">
            <option value="">— Sem entregador —</option>${opts}
          </select>
          <button class="ola-pdc-btn ola-pdc-btn-pagar" style="margin-top:0.4rem;font-size:0.8rem;" onclick="salvarEntregador(${p.id})">🛵 Salvar</button>
        </div>`;
    } else {
      entregadorSection = '<span style="color:#9ca3af;font-size:0.82rem;">—</span>';
    }

    document.getElementById('pdc-conteudo').innerHTML = `
      <div class="ola-pdc-section">
        <span class="ola-pdc-icon">👤</span>
        <div class="ola-pdc-section-content">
          <div class="ola-pdc-value">${p.cliente}${crmLabel}${waBtn}</div>
          ${p.telefone ? `<a href="tel:${rawPhone}" class="ola-pdc-sub" style="color:#2563eb;text-decoration:none;font-weight:600;">${p.telefone}</a>` : ''}
        </div>
      </div>
      ${p.tipo === 'mesa' ? `
      <div class="ola-pdc-section" style="background:#f0fdf4;">
        <span class="ola-pdc-icon">🍽️</span>
        <div class="ola-pdc-section-content">
          <div class="ola-pdc-value" style="font-size:1.1rem;color:#15803d;font-weight:900;">${p.endereco || 'Mesa'}</div>
        </div>
      </div>` : (p.endereco ? `
      <div class="ola-pdc-section">
        <span class="ola-pdc-icon">📍</span>
        <div class="ola-pdc-section-content">
          <div class="ola-pdc-value" style="font-size:0.85rem;font-weight:600;">${p.endereco}</div>
          ${p.zona_nome ? `<div class="ola-pdc-sub">${p.zona_nome}</div>` : ''}
        </div>
        ${mapBtn}
      </div>` : '')}
      <div class="ola-pdc-section">
        <span class="ola-pdc-icon">🛵</span>
        <div class="ola-pdc-section-content">${entregadorSection}</div>
      </div>
      <div class="ola-pdc-produtos-header">
        <span class="ola-pdc-produtos-title">Produtos</span>
      </div>
      ${(p.itens || []).map(i => `
        <div class="ola-pdc-item">
          <span class="ola-qty-badge">${i.quantidade}</span>
          <span class="ola-pdc-item-name">${i.nome_produto}${i.observacoes ? `<span class="ola-pdc-item-obs">↳ ${i.observacoes}</span>` : ''}</span>
          <span class="ola-pdc-item-price">${window.formatCurrency(i.preco_unitario * i.quantidade)}</span>
        </div>`).join('')}
      ${p.observacoes ? `<div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:0.5rem;border-radius:4px;font-size:0.82rem;color:#92400e;margin-top:0.6rem;"><strong>Obs:</strong> ${p.observacoes}</div>` : ''}
    `;

    // --- Rodapé financeiro ---
    const subtotal = (p.itens || []).reduce((s, i) => s + (i.preco_unitario * i.quantidade), 0);
    document.getElementById('pdc-financeiro').innerHTML = `
      <div class="ola-pdc-fin-row"><span>Subtotal</span><span>${window.formatCurrency(subtotal)}</span></div>
      ${p.taxa_entrega > 0 ? `<div class="ola-pdc-fin-row"><span>Entrega</span><span>${window.formatCurrency(p.taxa_entrega)}</span></div>` : ''}
      <div class="ola-pdc-fin-row total"><span>Total</span><span>${window.formatCurrency(p.total)}</span></div>
      <div style="margin-top:0.6rem;">
        <span class="ola-pdc-pgstatus ${pgPago ? 'pago' : 'nao_pago'}">${pgPago ? '✓ Pago' : 'Não pago'}</span>
      </div>
      <div class="ola-pdc-method">💳 ${p.payment_method || 'Dinheiro'}${p.troco_para ? ` · Troco para ${window.formatCurrency(p.troco_para)}` : ''}</div>
    `;

    // --- Botões de ação ---
    let acoesHtml = '';
    if (p.status === 'entregue') {
      if (!pgPago) {
        acoesHtml = `
          <button class="ola-pdc-btn ola-pdc-btn-finalizar" style="flex:1;" onclick="marcarPago(${p.id})">✅ Finalizar como Pago</button>
          <button class="ola-pdc-btn ola-pdc-btn-rejeitar" style="flex:1;" onclick="finalizarNaoPago(${p.id})">📝 Não pago</button>`;
      } else {
        acoesHtml = `<div style="color:#15803d;font-weight:700;padding:0.5rem;font-size:0.9rem;">✅ Pedido finalizado e pago.</div>`;
      }
    } else if (p.status === 'pendente_aprovacao') {
      acoesHtml = `
        <button class="ola-pdc-btn ola-pdc-btn-aceitar" onclick="alterarStatus(${p.id},'em_preparo')">✔ Aceitar</button>
        <button class="ola-pdc-btn ola-pdc-btn-rejeitar" onclick="alterarStatus(${p.id},'rejeitado')">✕ Rejeitar</button>`;
    } else if (isActive) {
      // Acoes dinamicas por tipo no painel lateral
      const proxStatus = window.getAcoesPorTipo(p.status, p.tipo);
      proxStatus.forEach(st => {
        if (st === 'cancelado') {
          acoesHtml += `<button class="ola-pdc-btn ola-pdc-btn-rejeitar" onclick="alterarStatus(${p.id},'${st}')">✕ Cancelar</button>`;
        } else if (st === 'entregue') {
          const lblFin = p.tipo === 'mesa' ? '✓ Servir à Mesa' : (p.tipo === 'balcao' ? '✓ Entregue ao Cliente' : '✓ Finalizar');
          acoesHtml += `<button class="ola-pdc-btn ola-pdc-btn-finalizar" onclick="alterarStatus(${p.id},'${st}')">${lblFin}</button>`;
        } else {
          const lbl = window.getStatusLabelPorTipo(st, p.tipo);
          acoesHtml += `<button class="ola-pdc-btn ola-pdc-btn-pagar" onclick="alterarStatus(${p.id},'${st}')">▶ ${lbl}</button>`;
        }
      });
      if (!pgPago) {
        acoesHtml = `<button class="ola-pdc-btn ola-pdc-btn-status" onclick="marcarPago(${p.id})">$ Pagar</button>` + acoesHtml;
      }
    }
    document.getElementById('pdc-acoes').innerHTML = acoesHtml;

    // Abrir painel
    const painel = document.getElementById('painel-detalhe-lateral');
    console.log(`[ADMIN_OPEN_PANEL] abrindo painel para #${id} tipo=${p.tipo} status=${p.status}`);
    painel.classList.remove('detalhe-fechado');
    painel.classList.add('detalhe-aberto');
  };

  window.fecharDetalhes = function () {
    const painel = document.getElementById('painel-detalhe-lateral');
    if (painel) {
      painel.classList.remove('detalhe-aberto');
      painel.classList.add('detalhe-fechado');
    }
    window._pedidoSelecionado = null;
    document.querySelectorAll('.pedido-row').forEach(r => r.classList.remove('row-selecionado'));
    // compatibilidade com modo cards (modal)
    const modal = document.getElementById('modalDetalhes');
    if (modal) modal.style.display = 'none';
  };

  window.marcarPago = async function (id) {
    try {
      const res = await apiFetch(`/api/pedidos/${id}/pagamento`, {
        method: 'PATCH',
        body: { payment_status: 'pago' },
      });
      if (res.ok) {
        showToast(`💰 Pagamento do pedido #${id} confirmado!`);
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
      const res = await apiFetch(`/api/pedidos/${id}/pagamento`, {
        method: 'PATCH',
        body: { payment_status: 'nao_pago' },
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
      const res = await apiFetch('/api/equipe');
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
          const res = await apiFetch('/api/clientes/' + val + '/ultimo');
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


  // ========== PDV MANUAL — delegado para admin-pdv.js (PdvManager) ==========
  // O botão btnAppNovoPedido agora é tratado pelo PdvManager no admin-pdv.js.
  // As funções aqui eram: carregarCardapioGeral, addPdvItem, removerPdvItem,
  // renderPdvItens — todas movidas para admin-pdv.js para separar UI de lógica.

  // Retrocompatibilidade: caso algum código inline ainda chame estas funções
  window.addPdvItem    = () => console.warn('[PDV] Usar PdvManager');
  window.removerPdvItem = () => console.warn('[PDV] Usar PdvManager');
  window.togglePdvEnd  = (tipo) => { if (window.PdvManager) PdvManager._applyTipo(tipo); };


  // ========== CONFIGURAÇÕES DA LOJA (WHITE LABEL) ==========
  window.carregarConfiguracoesAdmin = async function () {
    try {
      const res = await apiFetch('/api/settings');
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

      // Sincronizar UI com utilizador real — sobrescreve display_name das settings pelo nome do utilizador logado
      _syncUserProfileUI();

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

          const res = await apiFetch('/api/settings', {
            method: 'POST',
            body: { weekly_hours: weeklyHours }
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
        const res = await apiFetch('/api/settings', {
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

  // Atualizar timers e tiers de prioridade a cada 60s (mesmo sem mudança no servidor)
  // Change 6: bloquear se ação em andamento para evitar race condition
  setInterval(() => {
    if (window._pedidoAtualizando) {
      console.log('[ADMIN_POLL] 60s timer bloqueado — ação em andamento');
      return;
    }
    window._lastPedidosHash = null; // força re-render dos timers
    renderPedidos();
  }, 60000);

  // Carregar configurações da loja no arranque (popula header do dropdown imediatamente)
  carregarConfiguracoesAdmin();

  // ========== GERADOR DE PDF DO CARDÁPIO ==========
  const btnGerarPdf = document.getElementById('btnGerarPdfCardapio');
  if (btnGerarPdf) {
    btnGerarPdf.addEventListener('click', async () => {
      btnGerarPdf.disabled = true;
      btnGerarPdf.innerText = '⏳ Gerando...';
      try {
        const resSet = await apiFetch('/api/settings');
        const settings = resSet.ok ? await resSet.json() : {};

        const resProd = await apiFetch('/api/produtos');
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
    const res = await apiFetch('/api/equipe');
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
          ? `<a href="#" onclick="abrirModalEquipe(${user.id}, '${user.nome}', '${user.email || ''}', '${user.funcao}', ${user.ativo}); return false;" style="color:#1976d2; text-decoration:underline; font-size:0.85rem;" title="Editar meu perfil">✏️ Gerenciar meu perfil</a>`
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
    const res = await apiFetch('/api/equipe/' + id, {
      method: 'PUT',
      body: { ativo }
    });
    if (!res.ok) throw new Error('Falha de rede');
  } catch (e) {
    alert('Erro ao alterar status.');
    carregarEquipe();
  }
};

window.alterarFuncaoEquipe = async function (id, funcao) {
  try {
    const res = await apiFetch('/api/equipe/' + id, {
      method: 'PUT',
      body: { funcao }
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
    const res = await apiFetch('/api/equipe/' + id, {
      method: 'DELETE'
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
      const res = await apiFetch(url, {
        method,
        body: payload
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
    const res = await apiFetch('/api/integracoes/' + plataforma + '/desconectar', { method: 'POST' });
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
    const res = await apiFetch('/api/integracoes');
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
      const res = await apiFetch('/api/integracoes/' + plat.toLowerCase() + '/conectar', {
        method: 'POST',
        body: { is_ativo: true, credenciais: creds }
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
    await apiFetch('/api/integracoes/' + plat.toLowerCase() + '/desconectar', { method: 'POST' });
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
    const res = await apiFetch('/api/equipe');
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
    const res = await apiFetch(`/api/pedidos/${pedidoId}/entregador`, {
      method: 'PATCH',
      body: { entregador_id }
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

// Sincroniza o header do dropdown com o utilizador actualmente autenticado.
// Chamada: após settings carregadas E após _currentUser ser definido.
function _syncUserProfileUI() {
  const cu = window._currentUser;
  if (!cu) return;

  // Botão do topo: mostra nome do utilizador logado
  const nameEl = document.getElementById('profileMenuName');
  if (nameEl) nameEl.textContent = cu.nome || 'Admin';

  // Subtítulo dentro do dropdown: nome + função
  const userInfoEl = document.getElementById('profileDropUserInfo');
  if (userInfoEl) {
    const label = cu.email ? `${cu.nome} · ${cu.email}` : `${cu.nome} · ${cu.funcao || 'Admin'}`;
    userInfoEl.textContent = label;
  }
}
window._syncUserProfileUI = _syncUserProfileUI;

// Sair da sessão
window.handleLogout = function () {
  console.log('[Logout] Limpando sessão e redirecionando para /login');
  try { localStorage.clear(); } catch(e) {}
  try { sessionStorage.clear(); } catch(e) {}
  window.location.href = '/login';
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
    const res = await apiFetch('/api/settings', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Erro ' + res.status);
    // Atualizar nome no dropdown
    if (fields.store_name) {
      const dropNameEl = document.getElementById('profileDropName');
      if (dropNameEl) dropNameEl.textContent = fields.store_name;
      if (window._profileSettings) window._profileSettings.store_name = fields.store_name;
      document.querySelectorAll('[data-brand="name"]').forEach(el => { el.textContent = fields.store_name; });
      // Botão do topo mantém o nome do utilizador logado, não o nome da loja
      _syncUserProfileUI();
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

