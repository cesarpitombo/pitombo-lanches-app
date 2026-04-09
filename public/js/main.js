// Pitombo Lanches — Frontend JS Principal

document.addEventListener('DOMContentLoaded', () => {
  console.log('🍔 Pitombo Lanches — frontend iniciado');

  // ── Elementos da UI ─────────────────────────────────────────────
  const lista            = document.getElementById('produtosLista');
  const badge            = document.getElementById('carrinhoBadge');
  const btnCarrinho      = document.getElementById('btnCarrinho');
  const modal            = document.getElementById('modalCarrinho');
  const btnFechar        = document.getElementById('btnFecharModal');
  const carrinhoItens    = document.getElementById('carrinhoItens');
  const carrinhoTotal    = document.getElementById('carrinhoTotal');

  // ── Estado do carrinho ───────────────────────────────────────────
  // Cada item: { id, nome, preco, quantidade }
  const itens = JSON.parse(localStorage.getItem('pitombo_carrinho')) || [];
  
  function salvarCarrinho() {
    localStorage.setItem('pitombo_carrinho', JSON.stringify(itens));
    localStorage.setItem('pitombo_total', calcularTotal().toString());
  }

  // ── Funções do carrinho ──────────────────────────────────────────

  function adicionarAoCarrinho(produto) {
    const existente = itens.find(i => i.id === produto.id);
    if (existente) {
      existente.quantidade += 1;
    } else {
      itens.push({ ...produto, quantidade: 1 });
    }
    salvarCarrinho();
    atualizarBadge();
    renderizarCarrinho();
  }

  function removerDoCarrinho(id) {
    const idx = itens.findIndex(i => i.id === id);
    if (idx === -1) return;
    if (itens[idx].quantidade > 1) {
      itens[idx].quantidade -= 1;
    } else {
      itens.splice(idx, 1);
    }
    salvarCarrinho();
    atualizarBadge();
    renderizarCarrinho();
  }

  function calcularTotal() {
    return itens.reduce((soma, i) => soma + i.preco * i.quantidade, 0);
  }

  function atualizarBadge() {
    const totalItens = itens.reduce((soma, i) => soma + i.quantidade, 0);
    if (badge) {
      badge.textContent = totalItens;
      badge.style.display = totalItens > 0 ? 'flex' : 'none';
    }
  }

  function renderizarCarrinho() {
    if (itens.length === 0) {
      carrinhoItens.innerHTML = '<p style="color:#aaa;text-align:center;padding:1rem">Seu carrinho está vazio.</p>';
      carrinhoTotal.textContent = window.formatCurrency(0);
      return;
    }

    carrinhoItens.innerHTML = itens.map(item => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 0;border-bottom:1px solid #f3f4f6">
        <div style="flex:1">
          <strong style="display:block;color:#111827;font-size:0.95rem;">${item.nome}</strong>
          <span style="color:#6b7280;font-size:0.85rem;">
            ${window.formatCurrency(item.preco)} × ${item.quantidade}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem">
          <span style="font-weight:700;color:#111827">${window.formatCurrency(item.preco * item.quantidade)}</span>
          <button
            onclick="window._remover(${item.id})"
            style="background:#f3f4f6;border:none;border-radius:50%;width:32px;height:32px;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#4b5563;transition:all 0.2s"
            title="Remover">−</button>
        </div>
      </div>
    `).join('');

    const total = calcularTotal();
    carrinhoTotal.textContent = `${window.formatCurrency(total)}`;
  }

  // Expõe remover para uso no onclick inline dentro do innerHTML
  window._remover = removerDoCarrinho;

  // ── Modal carrinho ────────────────────────────────────────────────
  if (btnCarrinho) {
    btnCarrinho.addEventListener('click', () => {
      renderizarCarrinho();
      modal.hidden = false;
    });
  }
  if (btnFechar) {
    btnFechar.addEventListener('click', () => { modal.hidden = true; });
  }

  // ── Carregar e renderizar produtos ────────────────────────────────
  // ── Carregar e renderizar dados (Categorias e Produtos) ─────────────
  let todasCategorias = [];
  let todosProdutos = [];

  async function carregarDados() {
    const gridCategorias = document.getElementById('categoriasGrid');
    const gridProdutos   = document.getElementById('produtosLista');
    const btnVoltar      = document.getElementById('btnVoltarCategorias');
    const titulo         = document.getElementById('cardapioTitulo');

    if (!gridCategorias || !gridProdutos) return;
    gridCategorias.innerHTML = '<div class="loading">Carregando categorias...</div>';

    try {
      // Carregar ambos em paralelo
      const [resCats, resProds] = await Promise.all([
        fetch('/api/categorias'),
        fetch('/api/produtos')
      ]);
      
      todasCategorias = await resCats.json();
      todosProdutos   = await resProds.json();

      renderizarCategorias();

      // Listener para o botão Voltar
      if (btnVoltar) {
        btnVoltar.onclick = () => {
          gridProdutos.style.display = 'none';
          gridCategorias.style.display = 'grid';
          btnVoltar.style.display = 'none';
          titulo.textContent = 'Cardápio';
        };
      }

    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      gridCategorias.innerHTML = '<div class="loading">Erro ao carregar o cardápio.</div>';
    }
  }

  function renderizarCategorias() {
    const gridCategorias = document.getElementById('categoriasGrid');
    if (!gridCategorias) return;

    // Criamos uma lista de IDs de categoria que realmente possuem produtos
    const categoriasComProdutos = todasCategorias.filter(cat => 
        todosProdutos.some(p => p.categoria_id === cat.id)
    );

    // Adicionamos produtos sem categoria (fallback)
    const produtosSemCategoria = todosProdutos.filter(p => !p.categoria_id);
    
    let html = categoriasComProdutos.map(cat => {
      const inicial = cat.nome.charAt(0).toUpperCase();
      const displayImg = cat.imagem_url
        ? `<img src="${cat.imagem_url}" alt="${cat.nome}">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--cor-primaria),var(--cor-secundaria,#ffb800));color:#fff;font-size:2rem;font-weight:900;">${inicial}</div>`;
      const count = todosProdutos.filter(p => p.categoria_id === cat.id).length;

      return `
        <div class="categoria-card" onclick="window._verCategoria(${cat.id}, '${cat.nome.replace(/'/g, "\\'")}')">
          <div class="categoria-card__img">${displayImg}</div>
          <div class="categoria-card__body">
            <h3 class="categoria-card__nome">${cat.nome}</h3>
            <p class="categoria-card__count">${count} ${count === 1 ? 'item' : 'itens'}</p>
          </div>
        </div>
      `;
    }).join('');

    if (produtosSemCategoria.length > 0) {
      const count = produtosSemCategoria.length;
      html += `
        <div class="categoria-card" onclick="window._verCategoria(null, 'Diversos')">
          <div class="categoria-card__img">
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--cor-primaria),var(--cor-secundaria,#ffb800));color:#fff;font-size:2rem;font-weight:900;">D</div>
          </div>
          <div class="categoria-card__body">
            <h3 class="categoria-card__nome">Diversos</h3>
            <p class="categoria-card__count">${count} ${count === 1 ? 'item' : 'itens'}</p>
          </div>
        </div>
      `;
    }

    gridCategorias.innerHTML = html || '<div class="loading">Nenhuma categoria encontrada.</div>';
  }

  window._verCategoria = (id, nome) => {
    const gridCategorias = document.getElementById('categoriasGrid');
    const gridProdutos   = document.getElementById('produtosLista');
    const btnVoltar      = document.getElementById('btnVoltarCategorias');
    const titulo         = document.getElementById('cardapioTitulo');

    gridCategorias.style.display = 'none';
    gridProdutos.style.display   = 'grid';
    if (btnVoltar) btnVoltar.style.display = 'block';
    titulo.textContent = nome;

    renderizarProdutosPorCategoria(id);
  };

  function renderizarProdutosPorCategoria(categoriaId) {
    const gridProdutos = document.getElementById('produtosLista');
    if (!gridProdutos) return;

    const filtrados = categoriaId 
        ? todosProdutos.filter(p => p.categoria_id === categoriaId)
        : todosProdutos.filter(p => !p.categoria_id);

    if (filtrados.length === 0) {
      gridProdutos.innerHTML = '<div class="loading">Nenhum produto nesta categoria.</div>';
      return;
    }

    gridProdutos.innerHTML = filtrados.map(p => {
      const esgotado = p.controlar_estoque && p.estoque_atual <= 0;
      const btnHtml = esgotado 
        ? `<button class="btn-adicionar" disabled style="background:#ccc;cursor:not-allowed;color:#666;font-weight:bold;">Esgotado</button>`
        : `<button class="btn-adicionar" data-id="${p.id}" data-nome="${p.nome}" data-preco="${p.preco}">+ Adicionar</button>`;

      return `
      <div class="produto-card" style="${esgotado ? 'opacity:0.6;' : ''}">
        ${p.imagem_url
          ? `<img class="produto-card__img" src="${p.imagem_url}" alt="${p.nome}" onerror="this.parentElement.innerHTML='<div class=\\"produto-card__img--placeholder\\">🍔</div>'">`
          : `<div class="produto-card__img--placeholder">🍔</div>`}
        <div class="produto-card__body">
          <p class="produto-card__nome">${p.nome}</p>
          <div class="produto-card__footer">
            <span class="produto-card__preco">${window.formatCurrency(p.preco)}</span>
            ${btnHtml}
          </div>
        </div>
      </div>
    `}).join('');
  }

  // Delegar cliques de adição exatamente como antes para não quebrar
  lista.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-adicionar');
    if (!btn) return;
    adicionarAoCarrinho({
      id:    Number(btn.dataset.id),
      nome:  btn.dataset.nome,
      preco: Number(btn.dataset.preco),
    });
  });

  // ── Finalizar pedido ─────────────────────────────────────────────
  function finalizarPedido() {
    if (itens.length === 0) {
      alert('Seu carrinho está vazio.');
      return;
    }
    
    salvarCarrinho();
    window.location.href = '/checkout';
  }

  const btnFinalizar = document.getElementById('btnFinalizarPedido');
  if (btnFinalizar) btnFinalizar.addEventListener('click', finalizarPedido);

  atualizarBadge();
  carregarDados();

  // --- MODAL DE HORÁRIOS ---
  const DIAS_LABELS_PT = {
    segunda: 'Segunda-feira',
    terca: 'Terça-feira',
    quarta: 'Quarta-feira',
    quinta: 'Quinta-feira',
    sexta: 'Sexta-feira',
    sabado: 'Sábado',
    domingo: 'Domingo'
  };

  window.openHoursModal = function(weeklyHours) {
    const modal = document.getElementById('modalHours');
    const body = document.getElementById('hoursModalBody');
    if (!modal || !body) return;

    const DIAS_ORDEM = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
    
    // Identificar dia atual
    const now = new Date();
    const todayIdx = now.getDay(); 
    const todayKey = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][todayIdx];

    let html = '';
    DIAS_ORDEM.forEach(dia => {
      const intervals = weeklyHours[dia] || [];
      const isToday = dia === todayKey;
      
      html += `
        <div class="hours-row ${isToday ? 'hours-row--today' : ''}">
          <span class="hours-day">${DIAS_LABELS_PT[dia]}${isToday ? ' (Hoje)' : ''}</span>
          <div class="hours-time">
            ${intervals.length === 0 ? '<span class="closed-text">Fechado</span>' : 
              intervals.map(t => `<div>${t.open} — ${t.close}</div>`).join('')}
          </div>
        </div>
      `;
    });

    body.innerHTML = html;
    modal.hidden = false;
  };

});
