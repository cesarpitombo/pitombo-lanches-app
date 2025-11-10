// ========= CONFIG =========
// coloque aqui o número do WhatsApp com DDI+DDD, só dígitos
const WHATSAPP_NUMBER = "5583999999999"; // EXEMPLO: 55 (Brasil) + DDD + número

// ========= STORAGE (carrinho no navegador) =========
const CART_KEY = "pitombo_cart";

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
  catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
function addToCart(item) {
  const cart = getCart();
  const idx = cart.findIndex(i => i.id === item.id);
  if (idx >= 0) cart[idx].qtd += 1;
  else cart.push({ ...item, qtd: 1 });
  saveCart(cart);
  alert("Adicionado ao carrinho!");
}
function updateQty(id, delta) {
  let cart = getCart();
  const idx = cart.findIndex(i => i.id === id);
  if (idx >= 0) {
    cart[idx].qtd += delta;
    if (cart[idx].qtd <= 0) cart.splice(idx, 1);
    saveCart(cart);
    renderCart(); // se estiver na página do carrinho
  }
}

// ========= RENDER CARDÁPIO =========
async function renderMenu() {
  const grid = document.getElementById("cardapio");
  if (!grid) return;

  try {
    const res = await fetch("/api/menu");
    const menu = await res.json();

    grid.innerHTML = "";
    menu.forEach((item) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <img src="${item.imagem}" alt="${item.nome}">
        <h3>${item.nome}</h3>
        <div class="price">R$ ${Number(item.preco).toFixed(2)}</div>
        <button class="btn">Adicionar</button>
      `;
      card.querySelector("button").onclick = () => addToCart({
        id: item.id, nome: item.nome, preco: Number(item.preco)
      });
      grid.appendChild(card);
    });
  } catch (e) {
    grid.innerHTML = "Erro ao carregar cardápio.";
  }
}

// ========= RENDER CARRINHO =========
function renderCart() {
  const list = document.getElementById("lista");
  const subtotalEl = document.getElementById("subtotal");
  if (!list || !subtotalEl) return;

  const cart = getCart();
  list.innerHTML = "";

  let subtotal = 0;
  cart.forEach((i) => {
    subtotal += i.preco * i.qtd;
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div style="flex:1">
        <div><b>${i.nome}</b></div>
        <div>R$ ${i.preco.toFixed(2)}</div>
      </div>
      <div class="qtd">
        <button>-</button>
        <span>${i.qtd}</span>
        <button>+</button>
      </div>
    `;
    const [minus, , plus] = row.querySelectorAll("button");
    minus.onclick = () => updateQty(i.id, -1);
    plus.onclick = () => updateQty(i.id, +1);
    list.appendChild(row);
  });

  subtotalEl.textContent = `R$ ${subtotal.toFixed(2)}`;

  const finalizar = document.getElementById("finalizar");
  if (finalizar) {
    finalizar.onclick = () => {
      if (!cart.length) return alert("Carrinho vazio!");
      const linhas = cart
        .map(i => `• ${i.qtd}x ${i.nome} — R$ ${(i.preco * i.qtd).toFixed(2)}`)
        .join("%0A");
      const total = cart.reduce((s, i) => s + i.preco * i.qtd, 0);
      const msg = `*Pedido Pitombo Lanches*%0A${linhas}%0A%0ATotal: *R$ ${total.toFixed(2)}*`;
      const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
      window.location.href = url;
    };
  }
}

// ========= BOOT =========
document.addEventListener("DOMContentLoaded", () => {
  renderMenu();
  renderCart();
});
