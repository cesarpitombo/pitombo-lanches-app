// app.js (CommonJS)
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// ---------- Auth simples por token ----------
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
}

// ---------- App e porta ----------
const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Conexão Postgres (Neon) ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------- Middlewares ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Páginas ----------
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
  // painel já existe; servido como estático
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'admin.html'));
});

// ---------- API: Cardápio ----------
app.get('/api/menu', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, preco, imagem, categoria_id
       FROM produtos
       WHERE is_active IS NULL OR is_active = TRUE
       ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    console.error('Erro /api/menu:', err);
    res.status(500).json({ error: 'erro_listar_menu' });
  }
});

// ---------- API: Criar Pedido ----------
/*
Body esperado:
{
  "cliente": { "nome": "...", "telefone": "...", "endereco": "..." },
  "itens": [ { "produto_id": 1, "quantidade": 2 }, ... ],
  "observacao": "sem cebola"
}
*/
app.post('/api/pedido', async (req, res) => {
  const { cliente, itens, observacao } = req.body || {};
  if (!cliente || !cliente.nome || !cliente.telefone || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'dados_invalidos' });
  }

  // valida itens minimamente
  for (const it of itens) {
    if (!it.produto_id || !it.quantidade || it.quantidade < 1) {
      return res.status(400).json({ error: 'itens_invalidos' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // cria (ou pega) cliente simples só para o pedido
    const { rows: cRows } = await client.query(
      `INSERT INTO clientes (nome, telefone, endereco)
       VALUES ($1,$2,$3)
       ON CONFLICT (telefone) DO UPDATE SET nome = EXCLUDED.nome, endereco = EXCLUDED.endereco
       RETURNING id`,
      [cliente.nome, cliente.telefone, cliente.endereco || null]
    );
    const clienteId = cRows[0].id;

    // total usando preços atuais
    const ids = itens.map(i => i.produto_id);
    const { rows: produtos } = await client.query(
      `SELECT id, preco FROM produtos WHERE id = ANY($1::int[])`,
      [ids]
    );
    const mapaPreco = new Map(produtos.map(p => [p.id, Number(p.preco)]));

    let subtotal = 0;
    itens.forEach(i => {
      const p = mapaPreco.get(i.produto_id) || 0;
      subtotal += p * i.quantidade;
    });

    const { rows: pRows } = await client.query(
      `INSERT INTO pedidos (cliente_id, observacao, subtotal)
       VALUES ($1,$2,$3) RETURNING id`,
      [clienteId, observacao || null, subtotal]
    );
    const pedidoId = pRows[0].id;

    const values = [];
    const params = [];
    let idx = 1;
    for (const i of itens) {
      values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(pedidoId, i.produto_id, i.quantidade, mapaPreco.get(i.produto_id) || 0);
    }
    await client.query(
      `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
       VALUES ${values.join(',')}`,
      params
    );

    await client.query('COMMIT');
    res.json({ ok: true, pedido_id: pedidoId, total: subtotal });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro criar pedido:', err);
    res.status(500).json({ error: 'erro_criar_pedido' });
  } finally {
    client.release();
  }
});

// ---------- API: Listar pedidos (admin) ----------
app.get('/api/pedidos', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.created_at, p.subtotal, p.observacao,
              c.nome AS cliente_nome, c.telefone, c.endereco,
              COALESCE(
                (
                  SELECT json_agg(row_to_json(x))
                  FROM (
                    SELECT ip.produto_id, pr.nome, ip.quantidade, ip.preco_unitario
                    FROM itens_pedido ip
                    JOIN produtos pr ON pr.id = ip.produto_id
                    WHERE ip.pedido_id = p.id
                  ) x
                ), '[]'::json
              ) AS itens
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       ORDER BY p.id DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error('Erro /api/pedidos:', err);
    res.status(500).json({ error: 'erro_listar_pedidos' });
  }
});

// ---------- Sobe servidor ----------
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
