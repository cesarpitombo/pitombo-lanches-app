const express = require('express');
const path = require('path');
const app = express();

// Permitir JSON no backend
app.use(express.json());

// Rota principal - página do cliente
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/cliente/index.html'));
});

// Página do cardápio
app.get('/cardapio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/cliente/cardapio.html'));
});

// Página do carrinho
app.get('/carrinho', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/cliente/carrinho.html'));
});

// Página final de pedido feito
app.get('/pedido-confirmado', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/cliente/pedido-confirmado.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
