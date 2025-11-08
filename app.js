const express = require('express');
const path = require('path');

// DB (opcional: já deixa pronto para o Neon)
let pool = null;
try {
  const { Pool } = require('pg');
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
} catch (_) {
  // se pg não carregar por algum motivo, seguimos sem DB
}

// --- Auth simples por token (Bearer) para rotas de admin ---
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
}

const app = express();
const PORT = process.env.PORT || 3000;

// JSON no backend
app.use(express.json());

// Servir estáticos da pasta /public
app.use(express.static(path.join(__dirname, 'public')));

// -------- Dados em memória (pode vir do DB depois) --------
let MENU = [
  { id: 1, nome: 'X-Burger', preco: 15.00, img: '/cliente/img/xburger.png' },
  { id: 2, nome: 'X-Salada', preco: 17.00, img: '/cliente/img/xsalada.png' },
  { id: 3, nome: 'X-Bacon',  preco: 19.00, img: '/cliente/img/xbacon.png' }
];

// ---------- APIs ----------
app.get('/api/config', (req, res) => {
  res.json({ appName: 'Pitombo Lanches' });
});

app.get('/api/menu', (req, res) => {
  res.json(MENU);
});

app.put('/api/menu', requireAdmin, (req, res) => {
  const novo = req.body;
  if (!Array.isArray(novo)) {
    return res.status(400).json({ error: 'formato inválido' });
  }
  MENU = novo;
  res.json({ ok: true, total: MENU.length });
});

// (opcional) ping no DB
app.get('/api/db-ping', async (req, res) => {
  if (!pool) return res.status(200).json({ db: 'off' });
  try {
    await pool.query('select 1');
    res.json({ db: 'ok' });
  } catch (e) {
    res.status(500).json({ db: 'erro', detalhe: String(e) });
  }
});

// ---------- Rotas de páginas ----------
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

// ---------- Sobe o servidor ----------
app.listen(PORT, () => {
  console.log(🚀 Servidor Pitombo Lanches rodando na porta ${PORT});
});
