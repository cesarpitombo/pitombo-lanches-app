const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// --- Auth simples por token (Bearer) para futuros endpoints de admin ---
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

// Conexão Postgres (Neon precisa de SSL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// JSON no backend
app.use(express.json());

// Arquivos estáticos de /public
app.use(express.static(path.join(__dirname, 'public')));

// ===== API pública: lista o cardápio a partir do banco =====
app.get('/api/menu', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, price_cents, image_url, active FROM products WHERE active = TRUE ORDER BY id'
    );
    // normaliza para o front
    const menu = rows.map(r => ({
      id: r.id,
      nome: r.name,
      preco: (r.price_cents / 100).toFixed(2),
      imagem: r.image_url
    }));
    res.json(menu);
  } catch (err) {
    console.error('Erro ao buscar menu:', err);
    res.status(500).json({ error: 'Falha ao carregar cardápio' });
  }
});

// ===== Rotas de páginas (HTML) =====
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

// (Opcional) endpoint admin para atualizar produtos depois — protegido
app.put('/api/admin/products', requireAdmin, async (req, res) => {
  // Exemplo vazio para futuro CRUD. Mantemos aqui para expandir depois.
  res.json({ ok: true, msg: 'Endpoint admin pronto para futuro CRUD.' });
});

// Sobe o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
