const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Permitir JSON no backend
app.use(express.json());

// Servir arquivos estáticos da pasta /public
app.use(express.static(path.join(__dirname, 'public')));

// Dados padrão de configuração
let config = {
  appName: "Pitombo Lanches"
};

// API pública de configuração
app.get('/api/config', (req, res) => {
  res.json(config);
});

// Atualizar nome do app (rota protegida simples)
app.post('/api/config', (req, res) => {
  const { appName } = req.body;
  if (appName && appName.trim() !== "") {
    config.appName = appName.trim();
    res.json({ ok: true, appName });
  } else {
    res.status(400).json({ error: "Nome inválido" });
  }
});

// Páginas do cliente
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

// Página do painel admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
