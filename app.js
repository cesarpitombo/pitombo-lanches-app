// --- dependências
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// --- auth simples por token (Bearer <token>)
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
}

// --- app e porta
const app = express();
const PORT = process.env.PORT || 3000;

// --- conexão Postgres (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// --- middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- páginas (front)
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

// --- config para o index mostrar nome dinâmico
app.get('/api/config', (_req, res) => {
  res.json({ appName: 'Pitombo Lanches' });
});

// --- API pública: lista de produtos ativos
app.get('/api/menu', async (_req, res) => {
  try {
    const sql = `
      SELECT id, nome AS name, preco AS price_cents, imagem AS image_url
      FROM produtos
      WHERE is_active = TRUE
      ORDER BY id ASC
    `;
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (e) {
    console.error('GET /api/menu', e);
    res.status(500).json({ error: 'erro ao buscar cardápio' });
  }
});

// --- API protegida: criar item novo
app.post('/api/menu', requireAdmin, async (req, res) => {
  try {
    const { name, price_cents, image_url, categoria_id = 1 } = req.body || {};
    if (!name || !price_cents || !image_url) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, price_cents, image_url' });
    }
    const sql = `
      INSERT INTO produtos (nome, preco, imagem, categoria_id, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING id, nome AS name, preco AS price_cents, imagem AS image_url
    `;
    const { rows } = await pool.query(sql, [name, price_cents, image_url, categoria_id]);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/menu', e);
    res.status(500).json({ error: 'erro ao criar item' });
  }
});

// --- API protegida: ativar/desativar item
app.patch('/api/menu/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const sql = `
      UPDATE produtos
      SET is_active = NOT is_active
      WHERE id = $1
      RETURNING id, nome AS name, preco AS price_cents, imagem AS image_url, is_active
    `;
    const { rows } = await pool.query(sql, [id]);
    if (!rows.length) return res.status(404).json({ error: 'item não encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /api/menu/:id/toggle', e);
    res.status(500).json({ error: 'erro ao atualizar item' });
  }
});

// --- painel admin (html estático)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- sobe o servidor
app.listen(PORT, () => {
  console.log(🚀 Servidor Pitombo Lanches rodando na porta ${PORT});
});
