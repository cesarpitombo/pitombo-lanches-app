require('dotenv').config();

const express    = require('express');
const bodyParser = require('body-parser');
const path       = require('path');
const routes     = require('./routes/index');
const settingsRoutes = require('./routes/settings');
const despesasRoutes = require('./routes/despesas');
const equipeRoutes   = require('./routes/equipe');
const integracoesRoutes = require('./routes/integracoes');
const impressorasRoutes = require('./routes/impressoras');
const clientesRoutes = require('./routes/clientes');
const cozinhasRoutes = require('./routes/cozinhas');
const categoriasRoutes = require('./routes/categorias');
const modificadoresRoutes = require('./routes/modificadores');
const produtosRoutes = require('./routes/produtos');
const uploadsRoutes = require('./routes/uploads');
const iaRoutes = require('./routes/ia');

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
app.use('/api/despesas', despesasRoutes);
app.use('/api/equipe', equipeRoutes);
app.use('/api/integracoes', integracoesRoutes);
app.use('/api/impressoras', impressorasRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/cozinhas', cozinhasRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/modificadores', modificadoresRoutes);
app.use('/api/v2/produtos', produtosRoutes);
app.use('/api/products', produtosRoutes);
app.use('/api/upload', uploadsRoutes);
app.use('/api/ia', iaRoutes);

// ─── Rotas do Frontend ────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/cozinha', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cozinha.html')));
app.get('/entregador', (req, res) => res.sendFile(path.join(__dirname, 'public', 'entregador.html')));
app.get('/cardapio', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cardapio.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/sucesso', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sucesso.html')));
app.get('/links', (req, res) => res.sendFile(path.join(__dirname, 'public', 'links.html')));
app.get('/download-print-app', (req, res) => res.download(path.join(__dirname, 'public', 'PitomboPrint_Setup.zip')));

// ─── Erro global ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Erro interno:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ─── Inicializar servidor ─────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🍔 Pitombo Lanches rodando em http://localhost:${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
});

// Captura de erros globais para evitar crash silencioso
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

