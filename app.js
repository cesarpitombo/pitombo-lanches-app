const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// JSON no body (se precisar futuramente)
app.use(express.json());

// Servir arquivos estáticos
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data'))); // <- expõe /data/menu.json

// Rota raiz: manda para a home do cliente
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'));
});

// Página de cardápio
app.get('/cardapio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'cardapio.html'));
});

// (opcional) Admin simples por enquanto
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Sobe servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});

