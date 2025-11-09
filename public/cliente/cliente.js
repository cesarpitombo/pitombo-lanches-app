// public/cliente/cliente.js

// ---- Carrinho em localStorage ----
const CART_KEY = 'pitombo_cart_v1';

function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}
function writeCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}
function addToCart(prod) {
  const cart = readCart();
  const found = cart.find(i => i.produto_id === prod.id);
  if (found) found.quantidade += 1;
  else cart.push({ produto_id: prod.id, nome: prod.nome, preco: Number(prod.preco), quantidade: 1 });
  writeCart(cart);
  toast('Adicionado ao carrinho!');
  updateCartBadge();
}
function removeFromCart(id) {
  let cart = readCart();
  cart = cart.filter(i => i.produto_id !== id);
  writeCart(cart);
  renderCart();
  updateCartBadge();
}
function changeQty(id, delta) {
  const cart = readCart();
  const it = cart.find(i => i.produto_id === id);
  if (!it) return;
  it.quantidade = Math.max(1, it.quantidade + delta);
  writeCart(cart);
  renderCart();
  updateCartBadge();
}
function cartTotal() {
  return readCart().reduce((s, i) => s + i.quantidade * Number(i.preco), 0);
}
function updateCartBadge() {
  const el = document.getElementById('cart-badge');
  if (el) el.textContent = readCart().reduce((s, i) => s + i.quantidade, 0);
}
function toast(msg) {
  if (!window.Toastify) return alert(msg);
  Toastify({ text: msg, duration: 1500, gravity: 'top', position: 'center' }).showToast();
}

// ---- Cardápio ----
async function loadMenuAndRender() {
  const box = document.getElementById('menu-grid');
  if (!box) return; // não está na página de cardápio

  const res = await fetch('/api/menu', { cache: 'no-store' });
  const data = await res.json();

  box.innerHTML = data.map(p => `
    <div class="card">
      <img src="${p.imagem}" alt="${p.nome}" onerror="this.style.visibility='hidden'"/>
      <div class="info">
        <div class="nome">${p.nome}</div>
        <div class="preco">R$ ${Number(p.preco).toFixed(2)}</div>
      </div>
      <button class="btn-add" data-id="${p.id}">Adicionar</button>
    </div>
  `).join('');

  box.querySelectorAll('.btn-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const prod = data.find(p => p.id === id);
      addToCart(prod);
    });
  });

  updateCartBadge();
}

// ---- Carrinho (página carrinho.html) ----
function renderCart() {
  const list = document.getElementById('cart-list');
  if (!list) return;
  const cart = readCart();
  if (cart.length === 0) {
    list.innerHTML = '<p>Seu carrinho está vazio.</p>';
  } else {
    list.innerHTML = cart.map(i => `
      <div class="row">
        <div class="col nome">${i.nome}</div>
        <div class="col qty">
          <button class="qbtn" data-id="${i.produto_id}" data-d="-1">-</button>
          <span>${i.quantidade}</span>
          <button class="qbtn" data-id="${i.produto_id}" data-d="1">+</button>
        </div>
        <div class="col preco">R$ ${(i.preco * i.quantidade).toFixed(2)}</div>
        <div class="col"><button class="rbtn" data-id="${i.produto_id}">remover</button></div>
      </div>
    `).join('');
  }
  const total = document.getElementById('cart-total');
  if (total) total.textContent = 'R$ ' + cartTotal().toFixed(2);

  list.querySelectorAll('.qbtn').forEach(b => {
    b.addEventListener('click', () => changeQty(Number(b.dataset.id), Number(b.dataset.d)));
  });
  list.querySelectorAll('.rbtn').forEach(b => {
    b.addEventListener('click', () => removeFromCart(Number(b.dataset.id)));
  });
  updateCartBadge();
}

async function finalizarPedido() {
  const nome = document.getElementById('cli-nome').value.trim();
  const tel = document.getElementById('cli-tel').value.trim();
  const end = document.getElementById('cli-end').value.trim();

  if (!nome || !tel) { toast('Informe nome e telefone.'); return; }
  const itens = readCart().map(i => ({
    produto_id: i.produto_id,
    quantidade: i.quantidade,
    preco: i.preco
  }));
  if (itens.length === 0) { toast('Carrinho vazio.'); return; }

  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente: { nome, telefone: tel, endereco: end }, itens })
  });
  const out = await res.json();
  if (res.ok && out.ok) {
    writeCart([]);
    window.location.href = '/pedido-confirmado';
  } else {
    toast(out.error || 'Falha ao finalizar');
  }
}

// ---- boot por página ----
document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  loadMenuAndRender();
  renderCart();
  const btnCheckout = document.getElementById('btn-checkout');
  if (btnCheckout) btnCheckout.addEventListener('click', finalizarPedido);
});
