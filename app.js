import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// arquivos estáticos (CSS, imagens etc.)
app.use(express.static(path.join(__dirname, 'public')));

// home
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// páginas do cliente
app.get('/cliente', (_req, res) => {
  res.sendFile(path.join(__dirname, 'cliente', 'index.html'));
});
app.get('/cliente/cardapio.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'cliente', 'cardapio.html'));
});
app.get('/cliente/carrinho.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'cliente', 'carrinho.html'));
});
app.get('/cliente/pedido-confirmado.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'cliente', 'pedido-confirmado.html'));
});
app.get('/cliente/cliente.js', (_req, res) => {
  res.sendFile(path.join(__dirname, 'cliente', 'cliente.js'));
});

// admin
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// 404
app.use((_req, res) => res.status(404).send('Página não encontrada 😔'));

app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
