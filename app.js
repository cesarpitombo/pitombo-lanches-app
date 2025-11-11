// app.js (CommonJS)
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// diretório público
const PUBLIC_DIR = path.join(process.cwd(), 'public');

// serve arquivos estáticos (html, css, js, imagens) de /public
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// rotas de atalho
app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/cliente', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'cliente', 'index.html'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html'));
});

// atalho legado: /cardapio -> /cliente/cardapio.html
app.get('/cardapio', (_req, res) => {
  res.redirect(301, '/cliente/cardapio.html');
});

// 404
app.use((_req, res) => {
  res.status(404).send('Página não encontrada 😕');
});

app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
  console.log(`Servindo estáticos de: ${PUBLIC_DIR}`);
});
