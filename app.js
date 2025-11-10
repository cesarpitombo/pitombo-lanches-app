// ====== IMPORTS (CommonJS) ======
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

// ====== APP/PORT ======
const app = express();
const PORT = process.env.PORT || 10000;

// ====== MIDDLEWARES ======
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ====== DB (NEON) ======
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log('Conectado ao banco de dados Neon'))
  .catch(err => console.error('Erro ao conectar ao banco:', err.message));

// ====== AUTH ADMIN (Bearer) ======
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// ====== HELPERS CONFIG ======
async function getConfigMap() {
  const rows = (await pool.query('SELECT key, value FROM config')).rows;
  const map = {};
  rows.forEach(r => map[r.key] = r.value);
  // defaults
  if (!map.appName) map.appName = 'Pitombo Lanches';
  if (!map.phone)   map.phone   = '5581999999999';
  return map;
}

async function setConfig(updates) {
  const entries = Object.entries(updates)
    .filter(([k,v]) => ['appName','phone'].includes(k) && typeof v === 'string' && v.trim() !== '');
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO config(key,value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
}

// ====== ROTAS CONFIG ======
app.get('/api/config', async (req, res) => {
  try {
    const cfg = await getConfigMap();
    res.json(cfg);
  } catch (e) {
    console.error('Erro /api/config:', e.message);
    res.status(500).json({ error: 'erro ao obter config' });
  }
});

app.put('/api/config', requireAdmin, async (req, res) => {
  try {
    const { appName, phone } = req.body || {};
    await setConfig({ appName, phone });
    const cfg = await getConfigMap();
    res.json({ ok: true, config: cfg });
  } catch (e) {
    console.error('Erro PUT /api/config:', e.message);
    res.status(500).json({ error: 'erro ao salvar config' });
  }
});

// ====== CARDÁPIO (Banco) ======
app.get('/cardapio', async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, nome, preco, imagem FROM produtos ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro /cardapio:', err.message);
    res.status(500).send('Erro ao obter cardápio');
  }
});

// ====== PÁGINAS ======
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'));
});
app.get('/cliente/cardapio.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'cardapio.html'));
});
app.get('/cliente/admin.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'admin.html'));
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
