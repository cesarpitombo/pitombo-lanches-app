const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// Detecta automaticamente a pasta estática: public / publico / público
const CANDIDATES = ['public', 'publico', 'público'];
const STATIC_DIR = CANDIDATES.find(d => fs.existsSync(path.join(__dirname, d))) || 'public';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, STATIC_DIR)));

function sendCliente(res, file) {
  res.sendFile(path.join(__dirname, STATIC_DIR, 'cliente', file));
}

// Rotas de páginas
app.get('/', (_req, res) => sendCliente(res, 'index.html'));
app.get('/cardapio', (_req, res) => sendCliente(res, 'cardapio.html'));
app.get('/carrinho', (_req, res) => sendCliente(res, 'carrinho.html'));
app.get('/pedido-confirmado', (_req, res) => sendCliente(res, 'pedido-confirmado.html'));

// Healthcheck simples
app.get('/health', (_req, res) => res.json({ ok: true }));

// 404 básico
app.use((_req, res) => res.status(404).send('Rota não encontrada'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} usando pasta "${STATIC_DIR}"`);
});
