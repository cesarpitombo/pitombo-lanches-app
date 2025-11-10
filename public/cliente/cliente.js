<!-- public/cliente/cliente.js -->
<script>
const APP = {
  cartKey: 'pitombo_cart',
  async getConfig() {
    const r = await fetch('/api/config', { cache: 'no-store' });
    return r.json();
  },
  async getMenu() {
    const r = await fetch('/api/menu', { cache: 'no-store' });
    return r.json();
  },
  readCart() {
    try { return JSON.parse(localStorage.getItem(APP.cartKey) || '[]'); }
    catch { return []; }
  },
  saveCart(items) {
    localStorage.setItem(APP.cartKey, JSON.stringify(items));
    APP.updateCartBadge();
  },
  addToCart(item) {
    const cart = APP.readCart();
    const idx = cart.findIndex(i => i.id === item.id);
    if (idx >= 0) cart[idx].qty += 1;
    else cart.push({ id: item.id, nome: item.nome, preco: item.preco, imagem: item.imagem, qty: 1 });
    APP.saveCart(cart);
  },
  removeFromCart(id) {
    const cart = APP.readCart().filter(i => i.id !== id);
    APP.saveCart(cart);
  },
  updateQty(id, qty) {
    const cart = APP.readCart().map(i => i.id === id ? { ...i, qty: Math.max(1, qty) } : i);
    APP.saveCart(cart);
  },
  cartTotal() {
    return APP.readCart().reduce((t, i) => t + (i.preco * i.qty), 0);
  },
  formatPrice(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },
  updateCartBadge() {
    const q = APP.readCart().reduce((s, i) => s + i.qty, 0);
    const el = document.querySelector('[data-cart-count]');
    if (el) el.textContent = q;
  }
};
</script>
