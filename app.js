const express = require('express');
const path = require('path');

// --- Auth simples por token (Bearer) ---
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

// Permitir JSON no backend
app.use(express.json());

// Servir arquivos estáticos de /public
app.use(express.static(path.join(__dirname, 'public')));

// ====== MENU (fallback local) ======
let MENU = [
  { id: 1, nome: 'X-Burger', preco: 15.00, img: '/cliente/img/xburger.png' },
  { id: 2, nome: 'X-Salada', preco: 17.00, img: '/cliente/img/xsalada.png' },
  { id: 3, nome: 'X-Bacon',  preco: 19.00, img: '/cliente/img/xbacon.png' }
];

// ====== (Opcional) Banco de dados: usa se DATABASE_URL estiver setada ======
let pool = null;
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

// ------- APIs -------
app.get('/api/menu', async (req, res) => {
  // Se houver DB, tenta carregar dele; senão devolve o fallback local
  if (!pool) return res.json(MENU);

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        preco NUMERIC(10,2) NOT NULL,
        img TEXT
      )
    `);
    const { rows } = await pool.query('SELECT id, nome, preco, img FROM items ORDER BY id');
    if (rows.length > 0) return res.json(rows);
    return res.json(MENU);
  } catch (e) {
    console.error('DB error:', e.message);
    return res.json(MENU);
  }
});

app.put('/api/menu', requireAdmin, async (req, res) => {
  const novo = req.body;
  if (!Array.isArray(novo)) {
    return res.status(400).json({ error: 'formato inválido' });
  }

  // Se houver DB, sobrescreve tabela; senão atualiza o fallback
  if (!pool) {
    MENU = novo;
    return res.json({ ok: true, total: MENU.length });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE items RESTART IDENTITY');
    for (const item of novo) {
      await client.query(
        'INSERT INTO items (nome, preco, img) VALUES ($1, $2, $3)',
        [item.nome, item.preco, item.img || null]
      );
    }
    await client.query('COMMIT');
    return res.json({ ok: true, total: novo.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('DB save error:', e.message);
    return res.status(500).json({ error: 'erro ao salvar menu' });
  } finally {
    client.release();
  }
});

// ------- Rotas de páginas -------
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

// ------- Sobe o servidor -------
app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
