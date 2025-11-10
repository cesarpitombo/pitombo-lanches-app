// app.js — Pitombo Lanches (com pedidos)

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// --- Auth simples por token (Bearer) para rotas de admin ---
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

// Conexão Postgres (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// JSON no backend
app.use(express.json());

// Arquivos estáticos da pasta /public
app.use(express.static(path.join(__dirname, 'public')));

// --------- APIs ---------

// Config simples (nome do app)
app.get('/api/config', (_req, res) => {
  res.json({
    appName: 'Pitombo Lanches'
  });
});

// Lista o cardápio a partir do BD (tabela: produtos)
app.get('/api/menu', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, preco, imagem, categoria_id
       FROM produtos
       WHERE is_active IS DISTINCT FROM false
       ORDER BY id ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error('Erro /api/menu:', e);
    res.status(500).json({ error: 'menu_error' });
  }
});

// Cria pedido: body = { customer: {nome, telefone}, items: [{id, qty}], total }
app.post('/api/orders', async (req, res) => {
  const { customer = {}, items = [], total } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'carrinho_vazio' });
  }

  if (!customer.nome || !customer.telefone) {
    return res.status(400).json({ error: 'dados_cliente_invalidos' });
  }

  try {
    // cria pedido
    const insertOrder = `
      INSERT INTO pedidos (cliente_nome, cliente_telefone, subtotal)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    const orderRes = await pool.query(insertOrder, [
      customer.nome,
      customer.telefone,
      total || 0
    ]);
    const pedidoId = orderRes.rows[0].id;

    // carrega preços atuais dos produtos pra gravar no item
    const ids = items.map(i => i.id);
    const { rows: prodRows } = await pool.query(
      `SELECT id, nome, preco FROM produtos WHERE id = ANY($1)`,
      [ids]
    );
    const mapProd = Object.fromEntries(
      prodRows.map(p => [String(p.id), p])
    );

    // insere itens
    const insertItem = `
      INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unit)
      VALUES ($1, $2, $3, $4)
    `;
    for (const i of items) {
      const p = mapProd[String(i.id)];
      if (!p) continue;
      await pool.query(insertItem, [pedidoId, p.id, i.qty || 1, p.preco]);
    }

    res.json({ ok: true, pedidoId });
  } catch (e) {
    console.error('Erro /api/orders:', e);
    res.status(500).json({ error: 'order_error' });
  }
});

// (opcional) rota admin pra atualizar o menu no futuro
app.put('/api/menu', requireAdmin, async (req, res) => {
  // placeholder — vamos implementar depois (CRUD completo)
  res.json({ ok: true, msg: 'endpoint reservado' });
});

// --------- Páginas ---------
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
