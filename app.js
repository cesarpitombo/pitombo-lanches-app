// app.js
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// --- ENV ---
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'pitombo1';

// --- DB (Neon) ---
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// --- App ---
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- helpers ---
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// ---------- API ----------

// Lista de produtos (cardápio)
app.get('/api/menu', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.nome, p.preco, p.imagem, p.categoria_id, c.nome AS categoria
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.ativo IS TRUE OR p.ativo IS NULL
       ORDER BY c.nome, p.nome`
    );
    res.json(rows);
  } catch (e) {
    console.error('Erro /api/menu', e);
    res.status(500).json({ error: 'Falha ao carregar menu' });
  }
});

// Atualiza menu (admin) – envia array de itens {nome, preco, imagem, categoria_id}
app.put('/api/menu', requireAdmin, async (req, res) => {
  const itens = req.body;
  if (!Array.isArray(itens)) return res.status(400).json({ error: 'Formato inválido' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM produtos');
    for (const it of itens) {
      await client.query(
        'INSERT INTO produtos (nome, preco, imagem, categoria_id, ativo) VALUES ($1,$2,$3,$4, true)',
        [it.nome, it.preco, it.imagem, it.categoria_id || 1]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, total: itens.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Erro PUT /api/menu', e);
    res.status(500).json({ error: 'Falha ao atualizar menu' });
  } finally {
    client.release();
  }
});

// Checkout do carrinho
// Body: { cliente: {nome, telefone, endereco}, itens: [{produto_id, quantidade, preco}] }
app.post('/api/checkout', async (req, res) => {
  try {
    const { cliente, itens } = req.body || {};
    if (!cliente || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // cria/obtém cliente simples pelo telefone
      let clienteId;
      const c = await client.query('SELECT id FROM clientes WHERE telefone = $1 LIMIT 1', [cliente.telefone]);
      if (c.rowCount) {
        clienteId = c.rows[0].id;
        await client.query('UPDATE clientes SET nome=$1, endereco=$2 WHERE id=$3',
          [cliente.nome || '', cliente.endereco || '', clienteId]);
      } else {
        const ins = await client.query(
          'INSERT INTO clientes (nome, telefone, endereco) VALUES ($1,$2,$3) RETURNING id',
          [cliente.nome || '', cliente.telefone || '', cliente.endereco || '']
        );
        clienteId = ins.rows[0].id;
      }

      // cria pedido
      const ped = await client.query(
        'INSERT INTO pedidos (cliente_id, status, subtotal) VALUES ($1,$2,$3) RETURNING id',
        [clienteId, 'novo', 0]
      );
      const pedidoId = ped.rows[0].id;

      // itens + subtotal
      let subtotal = 0;
      for (const it of itens) {
        const q = Number(it.quantidade || 1);
        const preco = Number(it.preco || 0);
        subtotal += q * preco;

        await client.query(
          `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unit)
           VALUES ($1,$2,$3,$4)`,
          [pedidoId, it.produto_id, q, preco]
        );
      }
      await client.query('UPDATE pedidos SET subtotal=$1 WHERE id=$2', [subtotal, pedidoId]);

      await client.query('COMMIT');
      return res.json({ ok: true, pedido_id: pedidoId });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Erro /api/checkout', e);
      return res.status(500).json({ error: 'Falha no checkout' });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Erro /api/checkout outer', e);
    res.status(500).json({ error: 'Erro inesperado' });
  }
});

// --------- Páginas (HTML) ---------
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
app.get('/cliente/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'admin.html'));
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
