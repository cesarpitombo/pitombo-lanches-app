// app.js — backend completo

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// --------- auth por token (Bearer) ----------
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
}

// --------- app/infra ----------
const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// util: nome do app (lê da tabela app_config, fallback)
async function getAppName() {
  try {
    const r = await pool.query(
      "select value from app_config where key = 'app_name' limit 1"
    );
    return r.rows[0]?.value || 'Pitombo Lanches';
  } catch {
    return 'Pitombo Lanches';
  }
}

// --------- API PÚBLICA ----------

// nome do app (para o <h1>)
app.get('/api/config', async (_req, res) => {
  res.json({ appName: await getAppName() });
});

// cardápio (vem do banco)
app.get('/api/menu', async (_req, res) => {
  try {
    const r = await pool.query(
      `select id, nome, preco, imagem, categoria_id
       from produtos
       where is_active is null or is_active = true
       order by id asc`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: 'menu_failed' });
  }
});

// criar pedido
// body: { items:[{produto_id, quantidade}], cliente? }
app.post('/api/pedidos', async (req, res) => {
  const { items = [], cliente = null } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'itens_vazios' });
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    const ped = await client.query(
      'insert into pedidos(cliente) values($1) returning id',
      [cliente]
    );
    const pedidoId = ped.rows[0].id;

    for (const it of items) {
      const pid = Number(it.produto_id);
      const q = Number(it.quantidade);
      if (!pid || !q) continue;
      const p = await client.query(
        'select preco from produtos where id = $1',
        [pid]
      );
      const preco = p.rows[0]?.preco || 0;
      await client.query(
        'insert into itens_pedido(pedido_id, produto_id, quantidade, subtotal) values ($1,$2,$3,$4)',
        [pedidoId, pid, q, preco * q]
      );
    }

    await client.query('commit');
    res.json({ ok: true, pedidoId });
  } catch (e) {
    await client.query('rollback');
    res.status(500).json({ error: 'pedido_failed' });
  } finally {
    client.release();
  }
});

// --------- API ADMIN (protegida) ----------

// trocar nome do app (salva em app_config)
app.put('/api/config', requireAdmin, async (req, res) => {
  const { appName } = req.body || {};
  if (!appName || typeof appName !== 'string') {
    return res.status(400).json({ error: 'nome_invalido' });
  }
  try {
    await pool.query(
      `insert into app_config(key, value)
       values('app_name', $1)
       on conflict (key) do update set value = excluded.value`,
      [appName]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'config_failed' });
  }
});

// substituir cardápio inteiro
// body: [{nome, preco, imagem, categoria_id}]
app.put('/api/admin/menu', requireAdmin, async (req, res) => {
  const novo = req.body;
  if (!Array.isArray(novo)) {
    return res.status(400).json({ error: 'formato_invalido' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    // limpa e recria
    await client.query('delete from produtos');

    for (const item of novo) {
      const nome = String(item.nome || '').trim();
      const preco = Number(item.preco || 0);
      const imagem = String(item.imagem || '').trim();
      const categoria_id = Number(item.categoria_id || 1);
      if (!nome || !preco) continue;

      await client.query(
        `insert into produtos(nome, preco, imagem, categoria_id, is_active)
         values ($1,$2,$3,$4,true)`,
        [nome, preco, imagem, categoria_id]
      );
    }

    await client.query('commit');
    res.json({ ok: true, total: novo.length });
  } catch (e) {
    await client.query('rollback');
    res.status(500).json({ error: 'menu_update_failed' });
  } finally {
    client.release();
  }
});

// --------- ROTAS DE PÁGINA ----------
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

// --------- sobe ----------
app.listen(PORT, () => {
  console.log(🚀 Servidor Pitombo Lanches rodando na porta ${PORT});
});
