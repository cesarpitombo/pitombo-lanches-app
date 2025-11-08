// app.js — Pitombo Lanches (Node + Express + Postgres/Neon)
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// -------- Config --------
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Conexão Postgres (Neon) via variável DATABASE_URL
// Ex.: postgres://user:pass@host/dbname?sslmode=require
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false } // Neon exige SSL; false funciona no Render
    : false,
});

// -------- App --------
const app = express();

// Permitir JSON no backend
app.use(express.json());

// Servir arquivos estáticos da pasta /public
app.use(express.static(path.join(__dirname, 'public')));

// -------- Helpers DB --------
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows;
  } finally {
    client.release();
  }
}

// -------- API --------

// Saúde do serviço
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1;');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Nome do app para a página inicial (pode trocar aqui se quiser)
app.get('/api/config', (req, res) => {
  res.json({ appName: 'Pitombo Lanches' });
});

// Cardápio vindo do banco (produtos ativos + categoria)
app.get('/api/menu', async (req, res) => {
  try {
    const rows = await query(
      `
      SELECT p.id,
             p.nome,
             p.preco,              -- decimal no banco
             p.imagem,
             c.nome AS categoria
      FROM produtos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.is_active = TRUE
      ORDER BY c.nome NULLS LAST, p.id;
      `
    );

    // normaliza resposta: preco em centavos e número
    const itens = rows.map(r => ({
      id: r.id,
      nome: r.nome,
      // se quiser centavos no front, troque para Math.round(Number(r.preco) * 100)
      preco: Number(r.preco),
      imagem: r.imagem,
      categoria: r.categoria || 'Outros',
    }));

    res.json(itens);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// (Opcional) lista de categorias
app.get('/api/categorias', async (req, res) => {
  try {
    const cats = await query(`SELECT id, nome FROM categorias ORDER BY nome;`);
    res.json(cats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------- Rotas de páginas (HTML) --------
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

// -------- Sobe o servidor --------
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
