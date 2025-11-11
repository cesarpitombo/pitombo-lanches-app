// app.js (CommonJS)
const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 10000;

// static
app.use(express.static(path.join(__dirname, 'public')));

// home -> cliente/index
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'));
});

// cliente
app.get('/cliente', (_req, res) => {
  res.redirect('/cliente/index.html');
});

// admin
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// 404 simples
app.use((req, res) => res.status(404).send('Página não encontrada 😕'));

app.listen(PORT, () => {
  console.log(`Pitombo rodando na porta ${PORT}`);
});
