// app.js — Pitombo Lanches (CommonJS)

const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { Pool } = require('pg');

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIM_TOKEN || ''; // fallback se tiver typo

// Caminhos úteis
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');

// ---------- DB (opcional) ----------
let pool = null;
(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('🔌 DATABASE_URL não configurada — seguindo sem DB (menu via JSON).');
    return;
  }
  try {
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
    const { rows } = await pool.query('select now() as now');
    console.log('✅ Conectado ao Neon:', rows[0].now);
  } catch (err) {
    console.log('⚠️  Falha ao conectar no Neon. Continuando sem DB.', err.message);
    pool = null;
  }
})();

// ---------- App ----------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// arquivos estáticos
app.use(express.static(PUBLIC_DIR));

// ---------- Helpers ----------
async function readMenuFromFile() {
  try {
    const raw = await fs.readFile(MENU_FILE, 'utf8');
    const data = JSON.parse(raw || '[]');
    if (!Array.isArray(data)) return [];
    return data;
  } catch (e) {
    // cria arquivo se não existir
    if (e.code === 'ENOENT') {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(MENU_FILE, '[]', 'utf8');
      return [];
    }
    throw e;
  }
}

async function writeMenuToFile(items) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MENU_FILE, JSON.stringify(items, null, 2), 'utf8');
}

// pega menu (DB se disponível; senão arquivo)
async function getMenu() {
  if (pool) {
    const sql = `
      SELECT id, nome AS name, preco::numeric AS price, imagem AS img
      FROM produtos
      WHERE ativo IS TRUE OR ativo IS NULL
      ORDER BY id ASC
    `;
    const { rows } = await pool.query(sql);
    // normaliza para o front: [{id,name,price,img}]
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      price: Number(r.price),
      img: r.img,
    }));
  }
  return readMenuFromFile();
}

async function setMenu(newItems) {
  if (pool) {
    // sobrescreve tabela produtos com o JSON recebido
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM produtos');
      for (const item of newItems) {
        await client.query(
          `INSERT INTO produtos (nome, preco, imagem, ativo)
           VALUES ($1, $2, $3, true)`,
          [item.name, item.price, item.img || '']
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return true;
  }
  await writeMenuToFile(newItems);
  return true;
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// ---------- API ----------
app.get('/api/menu', async (req, res) => {
  try {
    const items = await getMenu();
    res.json(items);
  } catch (e) {
    console.error('Erro /api/menu:', e);
    res.status(500).json({ error: 'falha ao obter menu' });
  }
});

// atualiza menu (protegido)
app.put('/api/menu', requireAdmin, async (req, res) => {
  try {
    const novo = req.body;
    if (!Array.isArray(novo)) {
      return res.status(400).json({ error: 'formato inválido: esperado array' });
    }
    // validações simples
    const sane = novo.map((i, idx) => ({
      id: i.id ?? idx + 1,
      name: String(i.name || '').trim(),
      price: Number(i.price || 0),
      img: String(i.img || ''),
    }));
    await setMenu(sane);
    res.json({ ok: true, total: sane.length });
  } catch (e) {
    console.error('Erro PUT /api/menu:', e);
    res.status(500).json({ error: 'falha ao salvar menu' });
  }
});

// ---------- Rotas de páginas ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// cliente
app.get('/cliente', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'cliente', 'index.html'));
});
app.get('/cardapio', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'cliente', 'cardapio.html'));
});
app.get('/carrinho', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'cliente', 'carrinho.html'));
});
app.get('/pedido-confirmado', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'cliente', 'pedido-confirmado.html'));
});

// admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html'));
});
app.get('/painel', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'painel.html'));
});

// healthcheck simples
app.get('/health', (req, res) => res.json({ ok: true }));

// 404 amigável para paths desconhecidos
app.use((req, res) => {
  res.status(404).send('Não foi possível obter ' + req.path);
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
