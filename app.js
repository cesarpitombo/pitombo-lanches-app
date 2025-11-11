// app.js (CommonJS)
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// serve tudo que estiver em /public
app.use(express.static(path.join(__dirname, 'public')));

// atalhos amigáveis (redirecionam pros htmls)
app.get('/cliente', (_req, res) => res.redirect('/cliente/index.html'));
app.get('/admin',  (_req, res) => res.redirect('/admin/index.html'));

app.get('/cardapio',           (_req, res) => res.redirect('/cliente/cardapio.html'));
app.get('/carrinho',           (_req, res) => res.redirect('/cliente/carrinho.html'));
app.get('/pedido-confirmado',  (_req, res) => res.redirect('/cliente/pedido-confirmado.html'));

// health
app.get('/healthz', (_req, res) => res.send('ok'));

// 404
app.use((_req, res) => res.status(404).send('Página não encontrada 😔'));

app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
