const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static para cliente e admin
app.use('/static', express.static(path.join(__dirname, 'public')));

// HOME
app.get('/', (req, res) => {
  res.send('🚀 Pitombo Lanches online! Endpoints: /cliente, /admin (em breve).');
});

// ====== CLIENTE ======
app.get('/cliente', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'));
});

app.get('/cliente/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'status.html'));
});

// API mock de produtos (trocaremos por DB depois)
app.get('/api/products', (req, res) => {
  res.json([
    { id: 'p1', name: 'X-Burger', desc: 'Hambúrguer com queijo', price_cents: 750, img: '/static/cliente/img/burger.png' },
    { id: 'p2', name: 'Refrigerante 350ml', desc: 'Lata 350ml', price_cents: 250, img: '/static/cliente/img/soda.png' }
  ]);
});

// API mock de pedido
app.post('/api/order', (req, res) => {
  const { items, payment, note, address } = req.body;
  // TODO: validar e salvar no DB futuramente
  const orderId = 'PD' + Math.floor(100000 + Math.random() * 900000);
  console.log('🧾 Novo pedido:', { orderId, items, payment, note, address });
  res.json({ ok: true, orderId, status: 'pending' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Pitombo Lanches rodando na porta ${PORT}`);
});