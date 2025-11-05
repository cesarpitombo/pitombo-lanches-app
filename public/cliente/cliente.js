const money = cents => '€ ' + (cents/100).toFixed(2).replace('.', ',');

const state = { products: [], cart: [] };

async function loadProducts() {
  const res = await fetch('/api/products');
  state.products = await res.json();
  renderProducts();
}

function renderProducts() {
  const el = document.getElementById('products');
  el.innerHTML = state.products.map(p => `
    <div class="card">
      <img src="${p.img}" alt="${p.name}">
      <h4>${p.name}</h4>
      <p>${p.desc}</p>
      <div class="price">${money(p.price_cents)}</div>
      <button onclick="addToCart('${p.id}')">Adicionar</button>
    </div>
  `).join('');
}

function addToCart(id) {
  const p = state.products.find(x => x.id === id);
  const it = state.cart.find(x => x.id === id);
  if (it) it.qtd++; else state.cart.push({ id, name: p.name, price_cents: p.price_cents, qtd: 1 });
  renderCart();
}

function changeQtd(id, delta) {
  const it = state.cart.find(x => x.id === id);
  if (!it) return;
  it.qtd += delta;
  if (it.qtd <= 0) state.cart = state.cart.filter(x => x.id !== id);
  renderCart();
}

function renderCart() {
  const list = document.getElementById('cartItems');
  const total = document.getElementById('total');
  let sum = 0;
  list.innerHTML = state.cart.map(it => {
    const line = it.price_cents * it.qtd;
    sum += line;
    return `
      <div class="item">
        <div>${it.name}</div>
        <div class="qtd">
          <button onclick="changeQtd('${it.id}', -1)">-</button>
          <b>${it.qtd}</b>
          <button onclick="changeQtd('${it.id}', 1)">+</button>
          <div style="width:70px; text-align:right">${money(line)}</div>
        </div>
      </div>
    `;
  }).join('');
  total.textContent = money(sum);
}

document.getElementById('sendOrder').addEventListener('click', async () => {
  if (state.cart.length === 0) {
    alert('Adicione itens ao carrinho.');
    return;
  }
  const payment = document.querySelector('input[name="pay"]:checked').value; // dinheiro (pre-selecionado) ou cartao
  const note = document.getElementById('note').value;
  const address = document.getElementById('address').value;

  const body = { items: state.cart, payment, note, address };
  const res = await fetch('/api/order', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.ok) {
    localStorage.setItem('pitombo_last_order', data.orderId);
    document.getElementById('msg').textContent = 'Pedido enviado! Nº ' + data.orderId;
    setTimeout(() => location.href = '/cliente/status', 900);
  } else {
    alert('Erro ao enviar pedido.');
  }
});

loadProducts();
