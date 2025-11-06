// app.js
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Autenticação simples por Bearer Token p/ painel admin ======
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
}

// ====== Estado em memória (menu) – depois ligamos no banco ======
let MENU = [
  { id: 1, nome: 'X-Burger', preco: 15.0, img: '/cliente/img/xburger.jpg' },
  { id: 2, nome: 'X-Salada', preco: 17.0, img: '/cliente/img/xsalada.jpg' },
  { id: 3, nome: 'X-Bacon',  preco: 19.0, img: '/cliente/img/xbacon.jpg' }
];

// ====== Middlewares ======
app.use(express.json());                           // ler JSON no body
app.use(express.static(path.join(__dirname, 'public'))); // servir /public

// ====== APIs ======
// nome do app (para o título dinâmico)
app.get('/api/config', (req, res) => {
  res.json({ appName: process.env.APP_NAME || 'Pitombo Lanches' });
});

// lista pública do cardápio
app.get('/api/menu', (req, res) => {
  res.json(MENU);
});

// atualizar menu (protegido por token Bearer)
app.put('/api/menu', requireAdmin, (req, res) => {
  const novo = req.body;
  if (!Array.isArray(novo)) {
    return res.status(400).json({ error: 'formato inválido: esperado array de itens' });
  }
  MENU = novo;
  res.json({ ok: true, total: MENU.length });
});

// ====== Rotas de páginas ======
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

// ====== Sobe o servidor ======
app.listen(PORT, () => {
  console.log(Servidor Pitombo Lanches rodando na porta ${PORT});
});
