// app.js — Pitombo Lanches (com pedidos no Neon)

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// --------- Auth simples por Bearer (ADMIN_TOKEN no Render) ----------
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
}

// --------- App & DB ----------
const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon precisa de SSL
});

app.use(express.json());

// --------- Arquivos estáticos (/public) ----------
app.use(express.static(path.join(__dirname, 'public')));

// --------- Rotas de páginas do cliente ----------
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

// --------- API: Cardápio (lê do Neon) ----------
app.get('/api/menu', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, preco, imagem, categoria_id
       FROM produtos
       WHERE (ativo IS NULL OR ativo = true)
       ORDER BY id`
    );
    // Preço vem como string do DECIMAL — normalizamos pra número
    const data = rows.map(r => ({
      id: r.id,
      nome: r.nome,
      preco: Number(r.preco),
      imagem: r.imagem,
      categoria_id: r.categoria_id
    }));
    res.json(data);
  } catch (err) {
    console.error('Erro em /api/menu:', err);
    res.status(500).json({ error: 'erro_ao_carregar_menu' });
  }
});

// --------- API: Salvar pedido ----------
/*
  Body esperado:
  {
    "cliente": "Nome do cliente",
    "itens": [
      { "produto_id": 1, "quantidade": 2 },
      { "produto_id": 3, "quantidade": 1 }
    ]
  }
*/
app.post('/api/pedido', async (req, res) => {
  const { cliente, itens } = req.body || {};

  // validação básica
  if (!cliente || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'dados_invalidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // cria o pedido com total 0 temporariamente
    const insertPedido = await client.query(
      `INSERT INTO pedidos (cliente, total, status)
       VALUES ($1, 0, 'pendente')
       RETURNING id`,
      [cliente]
    );
    const pedidoId = insertPedido.rows[0].id;

    let total = 0;

    // para cada item, carrega o preço atual do produto e grava na itens_pedido
    for (const item of itens) {
      const { produto_id, quantidade } = item;
      if (!produto_id || !quantidade || quantidade <= 0) {
        throw new Error('item_invalido');
      }

      const prod = await client.query(
        'SELECT preco FROM produtos WHERE id = $1',
        [produto_id]
      );
      if (prod.rowCount === 0) throw new Error('produto_nao_encontrado');

      const preco = Number(prod.rows[0].preco);
      const subtotal = preco * Number(quantidade);
      total += subtotal;

      await client.query(
        `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, subtotal)
         VALUES ($1, $2, $3, $4)`,
        [pedidoId, produto_id, quantidade, subtotal]
      );
    }

    // atualiza total do pedido
    await client.query(
      'UPDATE pedidos SET total = $1 WHERE id = $2',
      [total, pedidoId]
    );

    await client.query('COMMIT');

    res.json({ ok: true, pedidoId, total });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro em /api/pedido:', err);
    res.status(500).json({ error: 'erro_ao_confirmar_pedido' });
  } finally {
    client.release();
  }
});

// --------- (Opcional) API admin pra trocar menu via token (futuro) ----------
app.put('/api/menu', requireAdmin, async (req, res) => {
  // Placeholder para futura edição de cardápio via painel
  res.json({ ok: true, message: 'endpoint reservado para painel admin' });
});

// --------- Sobe servidor ----------
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
