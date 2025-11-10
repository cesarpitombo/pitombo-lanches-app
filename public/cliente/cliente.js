<!-- public/cliente/cliente.js -->
<script>
// Utils localStorage do carrinho
const CART_KEY = 'pitombo_cart_v1';

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
function addToCart(produto) {
  const cart = getCart();
  const idx = cart.findIndex(i => i.id === produto.id);
  if (idx >= 0) {
    cart[idx].quantidade += 1;
  } else {
    cart.push({ id: produto.id, nome: produto.nome, preco: Number(produto.preco), imagem: produto.imagem, quantidade: 1 });
  }
  saveCart(cart);
  alert(`Adicionado: ${produto.nome}`);
}

// Render do cardápio na página cardapio.html
async function loadMenuAndRender() {
  const place = document.getElementById('menu-grid');
  if (!place) return;

  place.innerHTML = 'Carregando...';
  try {
    const res = await fetch('/api/menu', { cache: 'no-store' });
    const data = await res.json();

    if (!Array.isArray(data)) {
      place.innerHTML = 'Erro ao carregar menu.';
      return;
    }

    place.innerHTML = '';
    data.forEach(prod => {
      const card = document.createElement('div');
      card.className = 'card';

      card.innerHTML = `
        <div class="card-img">
          <img src="${prod.imagem || '/cliente/img/placeholder.png'}" alt="${prod.nome}">
        </div>
        <div class="card-body">
          <div class="card-title">${prod.nome}</div>
          <div class="card-price">R$ ${Number(prod.preco).toFixed(2)}</div>
          <button class="btn-add">Adicionar</button>
        </div>
      `;
      card.querySelector('.btn-add').onclick = () => addToCart(prod);
      place.appendChild(card);
    });
  } catch (e) {
    console.error(e);
    place.innerHTML = 'Erro ao carregar menu.';
  }
}

// Render do carrinho na página carrinho.html
function renderCartPage() {
  const tbody = document.getElementById('cart-body');
  if (!tbody) return;

  const cart = getCart();
  tbody.innerHTML = '';

  let total = 0;
  cart.forEach((item, idx) => {
    const linha = document.createElement('tr');
    const sub = Number(item.preco) * item.quantidade;
    total += sub;
    linha.innerHTML = `
      <td>${item.nome}</td>
      <td>R$ ${Number(item.preco).toFixed(2)}</td>
      <td>
        <button data-i="${idx}" class="menos">-</button>
        <span class="qty">${item.quantidade}</span>
        <button data-i="${idx}" class="mais">+</button>
      </td>
      <td>R$ ${sub.toFixed(2)}</td>
      <td><button data-i="${idx}" class="remover">remover</button></td>
    `;
    tbody.appendChild(linha);
  });

  document.getElementById('cart-total').textContent = `R$ ${total.toFixed(2)}`;

  tbody.onclick = (ev) => {
    const i = ev.target.getAttribute('data-i');
    if (i == null) return;
    const cart = getCart();

    if (ev.target.classList.contains('menos')) {
      cart[i].quantidade = Math.max(1, cart[i].quantidade - 1);
    } else if (ev.target.classList.contains('mais')) {
      cart[i].quantidade += 1;
    } else if (ev.target.classList.contains('remover')) {
      cart.splice(i, 1);
    }
    saveCart(cart);
    renderCartPage();
  };
}

// Enviar pedido ao backend (carrinho.html)
async function enviarPedido() {
  const nome = document.getElementById('cli-nome').value.trim();
  const tel = document.getElementById('cli-tel').value.trim();
  const end = document.getElementById('cli-end').value.trim();
  const obs = document.getElementById('cli-obs').value.trim();
  const cart = getCart();

  if (!nome || !tel || cart.length === 0) {
    alert('Preencha nome, telefone e tenha itens no carrinho.');
    return;
  }

  const itens = cart.map(i => ({ produto_id: i.id, quantidade: i.quantidade }));
  try {
    const res = await fetch('/api/pedido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente: { nome, telefone: tel, endereco: end },
        itens,
        observacao: obs
      })
    });

    const out = await res.json();
    if (!res.ok) {
      console.error(out);
      alert('Falha ao enviar pedido.');
      return;
    }
    // limpa carrinho e redireciona
    localStorage.removeItem(CART_KEY);
    window.location.href = '/pedido-confirmado';
  } catch (e) {
    console.error(e);
    alert('Erro ao enviar pedido.');
  }
}

// Expose global para HTML usar
window.Pitombo = {
  loadMenuAndRender,
  renderCartPage,
  enviarPedido
};
</script>
