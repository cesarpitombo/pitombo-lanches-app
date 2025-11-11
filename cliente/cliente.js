const CART_KEY = "pitombo_cart";

function getCart() {
  return JSON.parse(localStorage.getItem(CART_KEY)) || [];
}

function setCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

async function render() {
  const menuEl = document.getElementById("menu");
  const cartEl = document.getElementById("cart");

  if (menuEl) {
    const resp = await fetch("/data/menu.json");
    const menu = await resp.json();
    menuEl.innerHTML = menu
      .map(
        (item, i) =>
          `<li class="item">${item.nome} - €${item.preco.toFixed(2)} 
          <button onclick="add(${i})">Adicionar</button></li>`
      )
      .join("");
    window.menu = menu;
  }

  if (cartEl) {
    const cart = getCart();
    if (cart.length === 0) {
      cartEl.innerHTML = "<p>Carrinho vazio 😢</p>";
      return;
    }
    cartEl.innerHTML = cart
      .map(
        (i, idx) =>
          `<li class="item">${i.qtd}x ${i.nome} - €${i.preco.toFixed(2)} 
          <button onclick="remover(${idx})">Remover</button></li>`
      )
      .join("");
  }
}

function add(i) {
  const cart = getCart();
  const item = window.menu[i];
  const found = cart.find(c => c.nome === item.nome);
  if (found) found.qtd++;
  else cart.push({ ...item, qtd: 1 });
  setCart(cart);
}

function remover(i) {
  const cart = getCart();
  cart.splice(i, 1);
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
  if (cart.length === 0) {
    alert("Adicione itens antes de finalizar.");
    return;
  }

  const linhas = cart.map(
    i => `${i.qtd}x ${i.nome} - €${(i.preco * i.qtd).toFixed(2)}`
  );
  const total = cart.reduce((s, i) => s + i.preco * i.qtd, 0);
  linhas.push(`\nTotal: €${total.toFixed(2)}`);

  const msg = encodeURIComponent(
    `Olá! Quero fazer um pedido:\n\n${linhas.join("\n")}`
  );

  const phone = "351934869755";
  const url = `https://wa.me/${phone}?text=${msg}`;
  window.open(url, "_blank");
  window.location.href = "/cliente/pedido-confirmado.html";
}

render();

