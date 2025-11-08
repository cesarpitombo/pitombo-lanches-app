const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// --------- ENV ---------
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';           // definido no Render
const DATABASE_URL = process.env.DATABASE_URL;               // definido no Render

// --------- DB (Neon) ---------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Neon requer SSL
});

// --------- Auth Bearer simples ---------
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

const app = express();
app.use(express.json());

// --------- Static ---------
app.use(express.static(path.join(__dirname, 'public')));

// --------- Páginas HTML ---------
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

// --------- APIs ---------

// Config p/ título dinâmico na home
app.get('/api/config', (req, res) => {
  res.json({ appName: process.env.APP_NAME || 'Pitombo Lanches' });
});

// Lista pública do cardápio (lê do banco)
app.get('/api/menu', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, price_cents, image_url
         FROM menu_items
        WHERE is_active = TRUE
        ORDER BY id`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/menu error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Atualiza cardápio (somente admin). Envie um array de itens.
app.put('/api/menu', requireAdmin, async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'formato inválido: envie um array' });
    }

    const upsertSQL = `
      INSERT INTO menu_items (name, price_cents, image_url, is_active)
      VALUES ($1, $2, COALESCE($3, ''), COALESCE($4, TRUE))
      ON CONFLICT (name) DO UPDATE
      SET price_cents = EXCLUDED.price_cents,
          image_url   = EXCLUDED.image_url,
          is_active   = EXCLUDED.is_active
      RETURNING id;
    `;

    let count = 0;
    for (const it of items) {
      const name = String(it.name || '').trim();
      const price_cents = Number(it.price_cents ?? it.priceCents ?? 0);
      const image_url = it.image_url ?? it.imageUrl ?? '';
      const is_active = it.is_active ?? it.isActive ?? true;
      if (!name || !price_cents) continue;
      await pool.query(upsertSQL, [name, price_cents, image_url, is_active]);
      count++;
    }

    res.json({ ok: true, total: count });
  } catch (e) {
    console.error('PUT /api/menu error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Healthcheck simples
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// --------- Start ---------
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
