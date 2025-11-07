const express = require('express');
const path = require('path');
const { Pool } = require('pg');
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// --- Auth simples por token (Bearer) ---

}

const app = express();
const PORT = process.env.PORT || 3000;

// --- Conexão Postgres (Neon requer SSL) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- Permitir JSON no backend ---
app.use(express.json());

// --- Servir arquivos estáticos de /public ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Dados simulados do cardápio ---
let MENU = [
  { id: 1, nome: "X-Burger", preco: 15.00, img: "/cliente/img/xburger.png" },
  { id: 2, nome: "X-Salada", preco: 17.00, img: "/cliente/img/xsalada.png" },
  { id: 3, nome: "X-Bacon", preco: 19.00, img: "/cliente/img/xbacon.png" }
];

// --- API pública (lista de lanches) ---
app.get('/api/menu', (req, res) => {
  res.json(MENU);
});

// --- API protegida (atualizar menu) ---
app.put('/api/menu', requireAdmin, (req, res) => {
  const novo = req.body;
  if (!Array.isArray(novo)) {
    return res.status(400).json({ error: 'formato inválido' });
  }
  MENU = novo;
  res.json({ ok: true, total: MENU.length });
});

// ====== Rotas de páginas ======

// Página inicial
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'));
});

// Página do cardápio
app.get('/cardapio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'cardapio.html'));
});

// Página do carrinho
app.get('/carrinho', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'carrinho.html'));
});

// Página do pedido confirmado
app.get('/pedido-confirmado', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'pedido-confirmado.html'));
});

// ====== Sobe o servidor ======
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
  
});
