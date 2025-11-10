// public/cliente/cliente.js

// -------- Helpers comuns --------
const BRL = (v) =>
  (typeof v === "number" ? v : parseFloat(String(v).replace(",", ".")))
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function getCart() {
  const raw = localStorage.getItem("cart_v1");
  return raw ? JSON.parse(raw) : [];
}
function saveCart(items) {
  localStorage.setItem("cart_v1", JSON.stringify(items));
  renderMiniCartCount();
}
function addToCart(item) {
  const cart = getCart();
  const idx = cart.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    cart[idx].qty += 1;
  } else {
    cart.push({ id: item.id, name: item.nome, price: BRL(item.preco).replace(/[^\d,.-]/g,''), priceNum: Number(item.preco), img: item.imagem, qty: 1 });
  }
  saveCart(cart);
}
function renderMiniCartCount() {
  const el = document.querySelector("[data-mini-cart]");
  if (!el) return;
  const totalQty = getCart().reduce((s, i) => s + i.qty, 0);
  el.textContent = totalQty > 0 ? `Carrinho (${totalQty})` : "Carrinho";
}

// -------- Cardápio --------
async function initMenuPage() {
  const listEl = document.getElementById("menu-grid");
  if (!listEl) return; // não estamos no cardápio

  // topo (busca + categorias)
  const searchEl = document.getElementById("search");
  const catsEl = document.getElementById("cats");

  // carrega do backend
  let data = [];
  try {
    const res = await fetch("/api/menu", { cache: "no-store" });
    data = await res.json(); // espera array de produtos
  } catch (e) {
    listEl.innerHTML = "<p>Erro ao carregar o cardápio.</p>";
    return;
  }

  // monta categorias dinamicamente
  const cats = Array.from(
    new Set(data.map((p) => p.categoria || p.categoria_nome || "Outros"))
  );
  catsEl.innerHTML =
    `<button class="chip chip--active" data-cat="__all">Tudo</button>` +
    cats
      .map((c) => `<button class="chip" data-cat="${c}">${c}</button>`)
      .join("");

  function applyFilter() {
    const term = (searchEl.value || "").toLowerCase();
    const activeBtn = catsEl.querySelector(".chip--active");
    const selCat = activeBtn?.dataset.cat || "__all";

    const filtered = data.filter((p) => {
      const matchesCat = selCat === "__all" || (p.categoria || p.categoria_nome) === selCat;
      const matchesText =
        p.nome.toLowerCase().includes(term) ||
        String(p.preco).includes(term);
      return matchesCat && matchesText;
    });

    // render
    listEl.innerHTML = filtered
      .map(
        (p) => `
      <div class="card">
        <div class="card__img" style="background-image:url('${p.imagem || "/cliente/img/placeholder.png"}')"></div>
        <div class="card__title">${p.nome}</div>
        <div class="card__price">${BRL(p.preco)}</div>
        <button class="btn" data-add='${JSON.stringify(p).replace(/'/g,"&apos;")}'>Adicionar</button>
      </div>`
      )
      .join("");

    // bind Add
    listEl.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = JSON.parse(btn.getAttribute("data-add").replace(/&apos;/g,"'"));
        addToCart(item);
        btn.textContent = "Adicionado ✓";
        setTimeout(() => (btn.textContent = "Adicionar"), 900);
      });
    });
  }

  // clicks de categoria
  catsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    catsEl.querySelectorAll(".chip").forEach((x) => x.classList.remove("chip--active"));
    b.classList.add("chip--active");
    applyFilter();
  });

  // busca
  searchEl.addEventListener("input", applyFilter);

  // primeira renderização
  applyFilter();
  renderMiniCartCount();
}

// -------- Carrinho --------
function initCartPage() {
  const wrap = document.getElementById("cart-wrap");
  if (!wrap) return;

  function render() {
    const items = getCart();
    if (items.length === 0) {
      wrap.innerHTML = `<p>Seu carrinho está vazio.</p><p><a href="/cardapio" class="btn">Voltar ao Cardápio</a></p>`;
      renderMiniCartCount();
      return;
    }
    const rows = items
      .map(
        (it, i) => `
      <tr>
        <td>${it.name}</td>
        <td class="num">${BRL(it.priceNum || it.price)}</td>
        <td class="qty">
          <button class="icon" data-dec="${i}">–</button>
          <span>${it.qty}</span>
          <button class="icon" data-inc="${i}">+</button>
        </td>
        <td class="num">${BRL((it.priceNum || Number(String(it.price).replace(",","."))) * it.qty)}</td>
        <td><button class="link" data-del="${i}">remover</button></td>
      </tr>`
      )
      .join("");

    const total = items.reduce(
      (s, it) => s + (it.priceNum || Number(String(it.price).replace(",","."))) * it.qty, 0
    );

    wrap.innerHTML = `
      <table class="tbl">
        <thead>
          <tr><th>Item</th><th>Preço</th><th>Qtd</th><th>Total</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="3" class="num">Total</td><td class="num"><strong>${BRL(total)}</strong></td><td></td></tr>
        </tfoot>
      </table>

      <div class="cart-actions">
        <a class="btn btn--ghost" href="/cardapio">Adicionar mais</a>
        <button class="btn" id="finish">Finalizar pedido (WhatsApp)</button>
      </div>
    `;

    // binds
    wrap.querySelectorAll("[data-inc]").forEach((b) =>
      b.addEventListener("click", () => {
        const idx = Number(b.dataset.inc);
        const c = getCart();
        c[idx].qty += 1;
        saveCart(c);
        render();
      })
    );
    wrap.querySelectorAll("[data-dec]").forEach((b) =>
      b.addEventListener("click", () => {
        const idx = Number(b.dataset.dec);
        const c = getCart();
        c[idx].qty = Math.max(1, c[idx].qty - 1);
        saveCart(c);
        render();
      })
    );
    wrap.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        const idx = Number(b.dataset.del);
        const c = getCart();
        c.splice(idx, 1);
        saveCart(c);
        render();
      })
    );

    // finalizar no WhatsApp
    const finish = document.getElementById("finish");
    finish.addEventListener("click", () => {
      const msg =
        "*Novo pedido – Pitombo Lanches*\n\n" +
        items
          .map(
            (it) =>
              `• ${it.qty}x ${it.name} — ${BRL((it.priceNum || Number(String(it.price).replace(",","."))) * it.qty)}`
          )
          .join("\n") +
        `\n\n*Total:* ${BRL(total)}\n\nEndereço: `;
      const phone = "5571999999999"; // <-- coloque o número do WhatsApp com DDI+DDD+NÚMERO
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
      window.location.href = url;
    });

    renderMiniCartCount();
  }

  render();
}

// start
document.addEventListener("DOMContentLoaded", () => {
  renderMiniCartCount();
  initMenuPage();
  initCartPage();
});
