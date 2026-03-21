require('dotenv').config();

const express    = require('express');
const bodyParser = require('body-parser');
const path       = require('path');
const routes     = require('./routes/index');
const settingsRoutes = require('./routes/settings');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares globais ───────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve arquivos estáticos da pasta public/ (HTML, CSS, JS do frontend)
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rotas da API ─────────────────────────────────────────────────────
app.use('/api', routes);
app.use('/api/settings', settingsRoutes);

// ─── Rotas do Frontend ────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/cozinha', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cozinha.html')));
app.get('/entregador', (req, res) => res.sendFile(path.join(__dirname, 'public', 'entregador.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/sucesso', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sucesso.html')));

// ─── Erro global ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Erro interno:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ─── Inicializar servidor ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🍔 Pitombo Lanches rodando em http://localhost:${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
});

