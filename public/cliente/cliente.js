const CART_KEY = "pitombo_cart";

const getCart = () => JSON.parse(localStorage.getItem(CART_KEY) || "[]");
const setCart = (v) => localStorage.setItem(CART_KEY, JSON.stringify(v));
const money = (n) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;

// render da lista do cardápio
function renderLista(itens) {
  const grid = document.getElementById("grid");
  if (!grid) return;

  grid.innerHTML = "";
  itens.forEach((i) => {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <h3>${i.nome}</h3>
      <p>${money(i.preco)}</p>
      <button class="btn" onclick='add(${JSON.stringify(i)})'>Adicionar</button>
    `;
    grid.appendChild(li);
  });
}

function add(prod) {
  const cart = getCart();
  const idx = cart.findIndex((c) => c.id === prod.id);
  if (idx >= 0) cart[idx].qtd += 1;
  else cart.push({ ...prod, qtd: 1 });
  setCart(cart);
  alert("Adicionado ao carrinho!");
}

// render do carrinho
function render() {
  const list = document.getElementById("cartList");
  if (!list) return;

  const cart = getCart();
  list.innerHTML = "";
  let total = 0;

  cart.forEach((i, idx) => {
    total += Number(i.preco) * Number(i.qtd);
    const li = document.createElement("li");
    li.innerHTML = `
      ${i.qtd}x ${i.nome} — ${money(i.preco)} = ${money(i.preco * i.qtd)}
      <button class="btn btn_secondary" style="margin-left:8px" onclick="rem(${idx})">remover</button>
    `;
    list.appendChild(li);
  });

  const liTotal = document.createElement("li");
  liTotal.style.marginTop = "10px";
  liTotal.innerHTML = `<strong>Total: ${money(total)}</strong>`;
  list.appendChild(liTotal);
}

function rem(idx) {
  const cart = getCart();
  cart.splice(idx, 1);
  setCart(cart);
  render();
}

function limpar() {
  if (confirm("Limpar carrinho?")) {
    localStorage.removeItem(CART_KEY);
    render();
  }
}

function finalizar() {
  const cart = getCart();
  if (!cart.length) {
    alert("Adicione itens antes de finalizar.");
    return;
  }

  const linhas = cart.map(i => `${i.qtd}x ${i.nome} — ${money(i.preco)} = ${money(i.preco*i.qtd)}`);
  const total = cart.reduce((s,i)=> s + Number(i.preco)*Number(i.qtd), 0);
  linhas.push(`\nTotal: ${money(total)}`);

  const msg = encodeURIComponent(`Olá! Quero fazer um pedido:\n\n${linhas.join('\n')}\n\nNome: `);
  const phone = "351934869755"; // teu número
  const url = `https://wa.me/${phone}?text=${msg}`;

  window.open(url, "_blank");
  window.location.href = "/cliente/pedido-confirmado.html";
}

// auto-render no carrinho
render();
