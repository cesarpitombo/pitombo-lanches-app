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
    const total = itens.reduce((soma, i) => soma + i.quantidade, 0);
    badge.textContent = total;
  }

  function renderizarCarrinho() {
    if (itens.length === 0) {
      carrinhoItens.innerHTML = '<p style="color:#aaa;text-align:center;padding:1rem">Seu carrinho está vazio.</p>';
      carrinhoTotal.textContent = 'R$ 0,00';
      return;
    }

    carrinhoItens.innerHTML = itens.map(item => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid #f0ebe5">
        <div>
          <strong>${item.nome}</strong>
          <span style="color:#999;font-size:0.85rem;display:block">R$ ${item.preco.toFixed(2).replace('.', ',')} × ${item.quantidade}</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <span style="font-weight:700;color:#e8420a">R$ ${(item.preco * item.quantidade).toFixed(2).replace('.', ',')}</span>
          <button
            onclick="window._remover(${item.id})"
            style="background:#f0ebe5;border:none;border-radius:50%;width:28px;height:28px;font-size:1rem;cursor:pointer;line-height:1"
            title="Remover">−</button>
        </div>
      </div>
    `).join('');

    const total = calcularTotal();
    carrinhoTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
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
  async function carregarProdutos() {
    if (!lista) return;
    lista.innerHTML = '<div class="loading">Carregando cardápio...</div>';

    try {
      const res   = await fetch('/api/produtos');
      const dados = await res.json();

      if (!dados.length) {
        lista.innerHTML = '<div class="loading">Nenhum produto disponível.</div>';
        return;
      }

      lista.innerHTML = dados.map(p => `
        <div class="produto-card">
          <div class="produto-card__img--placeholder">🍔</div>
          <div class="produto-card__body">
            <p class="produto-card__nome">${p.nome}</p>
            <div class="produto-card__footer">
              <span class="produto-card__preco">R$ ${Number(p.preco).toFixed(2).replace('.', ',')}</span>
              <button
                class="btn-adicionar"
                data-id="${p.id}"
                data-nome="${p.nome}"
                data-preco="${p.preco}">
                + Adicionar
              </button>
            </div>
          </div>
        </div>
      `).join('');

      // Delegação de eventos — um listener para todos os botões
      lista.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-adicionar');
        if (!btn) return;
        adicionarAoCarrinho({
          id:    Number(btn.dataset.id),
          nome:  btn.dataset.nome,
          preco: Number(btn.dataset.preco),
        });
      });

    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
      lista.innerHTML = '<div class="loading">Erro ao carregar o cardápio.</div>';
    }
  }

  // ── Finalizar pedido ─────────────────────────────────────────────
  function finalizarPedido() {
    if (itens.length === 0) {
      alert('Seu carrinho está vazio.');
      return;
    }
    
    salvarCarrinho();
    window.location.href = '/checkout';
  }

  document.getElementById('btnFinalizarPedido')
    .addEventListener('click', finalizarPedido);

  atualizarBadge();
  carregarProdutos();
});
