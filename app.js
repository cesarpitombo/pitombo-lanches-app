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
const chatbotRoutes = require('./routes/chatbot');
const setoresRoutes = require('./routes/setores');
const devicesRoutes = require('./routes/devices');
const printJobsRoutes = require('./routes/print-jobs');
const deliveryGroupsRoutes = require('./routes/delivery-groups');
const deliveryRoutes = require('./routes/delivery');
const { initBaileys } = require('./services/whatsappBot');
const { runPrintModuleMigrations } = require('./services/migrations/printModule');
const fs = require('fs');

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
app.use('/api/chatbot-whatsapp', chatbotRoutes);
app.use('/api/setores', setoresRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/print-jobs', printJobsRoutes);
app.use('/api/delivery-groups', deliveryGroupsRoutes);
app.use('/api/delivery', deliveryRoutes);

// ─── Rotas do Frontend ────────────────────────────────────────────────
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/cozinha', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cozinha.html')));
app.get('/entregador', (req, res) => res.sendFile(path.join(__dirname, 'public', 'entregador.html')));
app.get('/cardapio', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cardapio.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/sucesso', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sucesso.html')));
app.get('/links', (req, res) => res.sendFile(path.join(__dirname, 'public', 'links.html')));
app.get('/admin/chatbot-whatsapp', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/download-print-app', (req, res) => {
  const installer = path.join(__dirname, 'autoprint-app', 'dist', 'PitomboPrint_Setup.exe');
  const legacy = path.join(__dirname, 'public', 'PitomboPrint_Setup.zip');
  if (fs.existsSync(installer)) return res.download(installer);
  if (fs.existsSync(legacy))    return res.download(legacy);
  res.status(404).send('Instalador ainda não disponível. Gere com: npm run build:desktop');
});

// ─── Erro global ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Erro interno:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ─── Inicializar servidor ─────────────────────────────────────────────
const server = app.listen(PORT, async () => {
  console.log(`\n🍔 Pitombo Lanches rodando em http://localhost:${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
  try { await runPrintModuleMigrations(); }
  catch (e) { console.error('⚠️  Migrations AutoPrint falharam:', e.message); }
  // Só reconecta automaticamente se houver sessão COMPLETA salva (creds.json + key files).
  // Sem sessão completa, aguarda o usuário clicar "Vincular" na UI.
  // Isso evita que o startup gere QRs que ninguém vai escanear, desperdiçando a janela de autenticação.
  const SESSION_DIR = path.join(__dirname, 'sessions', 'wa_session');
  const sessionFiles = fs.existsSync(SESSION_DIR) ? fs.readdirSync(SESSION_DIR) : [];
  const hasCreds     = sessionFiles.includes('creds.json');
  const hasKeys      = sessionFiles.some(f => f !== 'creds.json');
  if (hasCreds && hasKeys) {
    console.log(`[Baileys] Sessão completa encontrada (${sessionFiles.length} arquivos) — reconectando...`);
    initBaileys().catch(err => console.error('❌ Baileys init error:', err.message));
  } else {
    console.log('[Baileys] Sem sessão salva — aguardando ação do usuário (clique em "Vincular").');
    if (hasCreds && !hasKeys) {
      console.warn('[Baileys] ⚠️  creds.json existe mas sem key files — sessão incompleta, será limpa no primeiro init.');
    }
  }
});

// Captura de erros globais para evitar crash silencioso
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

