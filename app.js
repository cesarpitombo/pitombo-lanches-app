const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// <<< Nome do app vindo do ambiente
const APP_NAME = process.env.APP_NAME || 'Pitombo Lanches';

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint para o front ler o nome
app.get('/config', (req, res) => {
  res.json({ appName: APP_NAME });
});

// Rotas
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

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
