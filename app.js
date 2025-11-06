const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Conexão Postgres (Neon requer SSL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Permitir JSON no backend
app.use(express.json());

// Servir arquivos estáticos de /public
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal -> abre public/cliente/index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'));
});

// Cardápio (página HTML)
app.get('/cardapio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'cardapio.html'));
});

// Carrinho (página HTML)
app.get('/carrinho', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'carrinho.html'));
});

// Pedido confirmado (página HTML)
app.get('/pedido-confirmado', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'pedido-confirmado.html'));
});

/* =======================
   APIs para buscar dados
   ======================= */

// Nome do app / logo
app.get('/api/config', async (req, res) => {
  try {
    const { rows } = await pool.query('select app_name, logo_url from settings order by id desc limit 1');
    res.json(rows[0] || { app_name: 'Pitombo Lanches', logo_url: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'config_error' });
  }
});

// Lista de produtos ativos
app.get('/api/cardapio', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      select id, name, price_cents, image_url
      from products
      where active = true
      order by id asc
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'products_error' });
  }
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/cliente/../admin/painel.html'));
});
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
// Rota de API para o cardápio
app.get('/api/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.json'));
});
