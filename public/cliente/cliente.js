// Utilitários
const BRL = v => (Number(v).toFixed(2)).replace('.', ',');

async function fetchProdutos() {
  const res = await fetch('/api/produtos', { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao carregar produtos');
  return res.json();
}

// ====== Cardápio ======
async function montarCardapio() {
  const lista = document.getElementById('lista-produtos');
  if (!lista) return;

  lista.innerHTML = 'Carregando...';

  try {
    const produtos = await fetchProdutos();
    if (!Array.isArray(produtos) || produtos.length === 0) {
      lista.innerHTML = '<p>Nenhum item disponível.</p>';
      return;
    }

    lista.innerHTML = '';
    produtos.forEach(p => {
      const li = document.createElement('li');
      li.className = 'card';

      const img = document.createElement('img');
      img.alt = p.nome;
      img.loading = 'lazy';
      img.src = p.imagem || '/cliente/img/placeholder.png';

      const title = document.createElement('h3');
      title.textContent = p.nome;

      const price = document.createElement('div');
      price.className = 'preco';
      price.textContent = `R$ ${BRL(p.preco)}`;

      const btn = document.createElement('button');
      btn.textContent = 'Adicionar';
      btn.onclick = () => addToCart(p);

      li.appendChild(img);
      li.appendChild(title);
      li.appendChild(price);
      li.appendChild(btn);
      lista.appendChild(li);
    });
  } catch (e) {
    console.error(e);
    lista.innerHTML = '<p>Erro ao carregar cardápio.</p>';
  }
}

// ====== Carrinho (localStorage) ======
const KEY = 'pitombo_cart';

function getCart() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}
function saveCart(c) { localStorage.setItem(KEY, JSON.stringify(c)); }

function addToCart(prod) {
  const cart = getCart();
  const idx = cart.findIndex(i => i.id === prod.id);
  if (idx >= 0) cart[idx].qtd += 1;
  else cart.push({ id: prod.id, nome: prod.nome, preco: Number(prod.preco), qtd: 1 });
  saveCart(cart);
  alert('Adicionado ao carrinho!');
}

function montarCarrinho() {
  const tbody = document.getElementById('cart-body');
  const totalEl = document.getElementById('cart-total');
  if (!tbody) return;

  const cart = getCart();
  tbody.innerHTML = '';
  let total = 0;

  cart.forEach((item, i) => {
    const tr = document.createElement('tr');

    const tdNome = document.createElement('td');
    tdNome.textContent = item.nome;

    const tdQtd = document.createElement('td');
    const menos = document.createElement('button');
    menos.textContent = '−';
    menos.onclick = () => { item.qtd = Math.max(1, item.qtd - 1); cart[i] = item; saveCart(cart); montarCarrinho(); };

    const qtd = document.createElement('span');
    qtd.textContent = ' ' + item.qtd + ' ';

    const mais = document.createElement('button');
    mais.textContent = '+';
    mais.onclick = () => { item.qtd += 1; cart[i] = item; saveCart(cart); montarCarrinho(); };

    tdQtd.append(menos, qtd, mais);

    const tdPreco = document.createElement('td');
    const sub = item.preco * item.qtd;
    tdPreco.textContent = `R$ ${BRL(sub)}`;
    total += sub;

    const tdRem = document.createElement('td');
    const rm = document.createElement('button');
    rm.textContent = 'Remover';
    rm.onclick = () => { cart.splice(i, 1); saveCart(cart); montarCarrinho(); };
    tdRem.appendChild(rm);

    tr.append(tdNome, tdQtd, tdPreco, tdRem);
    tbody.appendChild(tr);
  });

  if (totalEl) totalEl.textContent = `R$ ${BRL(total)}`;
}

async function finalizarPedido() {
  const nome = (document.getElementById('cliente-nome')?.value || 'Cliente');
  const cart = getCart();
  const total = cart.reduce((s, i) => s + i.preco * i.qtd, 0);

  await fetch('/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente_nome: nome, total })
  });

  localStorage.removeItem(KEY);
  window.location.href = '/pedido-confirmado';
}

// Auto-init nas páginas
document.addEventListener('DOMContentLoaded', () => {
  montarCardapio();
  montarCarrinho();
  const btnFinalizar = document.getElementById('btn-finalizar');
  if (btnFinalizar) btnFinalizar.onclick = finalizarPedido;
});
