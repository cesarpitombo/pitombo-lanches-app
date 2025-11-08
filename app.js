// app.js — servidor Pitombo Lanches (com painel admin simples)
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------
// Estado em memória
// (reinicia a cada deploy/restart)
// ----------------------
let CONFIG = {
  appName: 'Pitombo Lanches',
};

let MENU = [
  { id: 1, nome: 'X-Burger', preco: 15.00, img: '/public/cliente/img/xburger.png' },
  { id: 2, nome: 'X-Salada', preco: 17.00, img: '/public/cliente/img/xsalada.png' },
  { id: 3, nome: 'X-Bacon',  preco: 19.00, img: '/public/cliente/img/xbacon.png'  }
];

// ----------------------
// Middleware
// ----------------------
app.use(express.json());

// servir estáticos da pasta /public
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------
// Rotas de páginas (HTML)
// ----------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'));
});

app.get('/cardapio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'cardapio.html'));
});

app.get('/carrinho', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'carrinho.html'));
});

app.get('/pedido-confirmado', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'pedido-confirmado.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'admin.html'));
});

// ----------------------
// APIs públicas
// ----------------------
app.get('/api/config', (req, res) => {
  res.json(CONFIG);
});

app.get('/api/menu', (req, res) => {
  res.json(MENU);
});

// ----------------------
// Autorização simples (Bearer)
// ----------------------
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
}

// ----------------------
// APIs protegidas (admin)
// ----------------------
app.put('/api/config', requireAdmin, (req, res) => {
  const { appName } = req.body || {};
  if (!appName || typeof appName !== 'string') {
    return res.status(400).json({ error: 'appName inválido' });
  }
  CONFIG.appName = appName.trim();
  return res.json({ ok: true, config: CONFIG });
});

app.put('/api/menu', requireAdmin, (req, res) => {
  const novo = req.body;
  if (!Array.isArray(novo)) {
    return res.status(400).json({ error: 'formato inválido: esperado array' });
  }
  MENU = novo;
  return res.json({ ok: true, total: MENU.length });
});

// ----------------------
// Sobe o servidor
// ----------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
