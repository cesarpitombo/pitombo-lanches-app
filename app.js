// app.js — completo
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// ====== ENV ======
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const DATABASE_URL = process.env.DATABASE_URL;

// ====== DB ======
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ====== Auth simples (Bearer) ======
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && ADMIN_TOKEN && token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// ====== Helpers de Config ======
const DEFAULT_SETTINGS = {
  app_name: 'Pitombo Lanches',
  phone: '5599999999999', // DDI+DDD+número (apenas dígitos)
  whatsapp_link: 'https://wa.me/5599999999999',
};

async function initSettings() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // upsert defaults
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.query(
      `INSERT INTO app_settings(key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }
}

async function getSettings() {
  const rows = (await pool.query('SELECT key, value FROM app_settings')).rows;
  const map = { ...DEFAULT_SETTINGS };
  rows.forEach(r => (map[r.key] = r.value));
  return map;
}

async function setSettings(patch) {
  const entries = Object.entries(patch);
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO app_settings(key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, String(value)]
    );
  }
}

// Normaliza telefone pra só dígitos e garante link do wa
function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D+/g, '');
  // Se começar sem DDI, assume Brasil 55
  const withDDI = digits.startsWith('55') ? digits : `55${digits}`;
  return withDDI;
}

// ====== App ======
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ====== Rotas de páginas ======
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'));
});
app.get('/cardapio', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'cardapio.html'));
});
app.get('/carrinho', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'carrinho.html'));
});
app.get('/pedido-confirmado', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'pedido-confirmado.html'));
});
app.get('/cliente/admin.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'admin.html'));
});

// ====== API: Config (nome do app + telefone) ======
app.get('/api/config', async (_req, res) => {
  try {
    const cfg = await getSettings();
    res.json({
      appName: cfg.app_name,
      phone: cfg.phone,
      whatsapp: cfg.whatsapp_link,
    });
  } catch (e) {
    res.status(500).json({ error: 'config_read_failed' });
  }
});

app.put('/api/config', requireAdmin, async (req, res) => {
  try {
    const { appName, phone } = req.body || {};
    const patch = {};
    if (appName) patch.app_name = String(appName).trim();

    if (phone) {
      const digits = normalizePhone(phone);
      patch.phone = digits;
      patch.whatsapp_link = `https://wa.me/${digits}`;
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'nada_para_atualizar' });
    }
    await setSettings(patch);
    const cfg = await getSettings();
    res.json({
      ok: true,
      appName: cfg.app_name,
      phone: cfg.phone,
      whatsapp: cfg.whatsapp_link,
    });
  } catch (e) {
    res.status(500).json({ error: 'config_write_failed' });
  }
});

// ====== API: Cardápio (lendo do banco) ======
app.get('/api/menu', async (_req, res) => {
  try {
    // Ajusta os nomes da sua base se necessário
    const { rows } = await pool.query(`
      SELECT id, nome, preco, imagem, categoria_id
      FROM produtos
      ORDER BY id ASC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'menu_read_failed' });
  }
});

// Start
(async () => {
  await initSettings();
  app.listen(PORT, () => {
    console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
  });
})();
