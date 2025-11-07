const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// === Autenticação simples por token (Bearer) ===
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
}

const app = express();
const PORT = process.env.PORT || 3000;

// === Conexão PostgreSQL (Neon requer SSL) ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// === Permitir JSON no backend ===
app.use(express.json());

// === Servir arquivos estáticos de /public ===
app.use(express.static(path.join(__dirname, 'public')));

// === Dados iniciais do cardápio (mock, pode vir do banco depois) ===
let MENU = [
  { nome: 'X-Burger', preco: 15.00, img: '/cliente/img/xburger.png' },
  { nome: 'X-Salada', preco: 17.00, img: '/cliente/img/xsalada.png' },
  { nome: 'X-Bacon', preco: 19.00, img: '/cliente/img/xbacon.png' }
];

// === API pública: listar cardápio ===
app.get('/api/menu', (req, res) => {
  res.json(MENU);
});

// === API protegida: atualizar cardápio ===
app.put('/api/menu', requireAdmin, (req, res) => {
  const novo = req.body;
  if (!Array.isArray(novo)) {
    return res.status(400).json({ error: 'formato inválido' });
  }
  MENU = novo;
  res.json({ ok: true, total: MENU.length });
});

// === Rotas de páginas ===
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

// === Iniciar servidor ===
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
