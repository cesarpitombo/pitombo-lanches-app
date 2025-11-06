const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
// JSON no corpo das requisições
app.use(express.json());

// --- Persistência simples em JSON (disco) ---
const DATA_DIR = path.join(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Páginas (cliente) ---
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'))
);
app.get('/cardapio', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'cardapio.html'))
);
app.get('/carrinho', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'carrinho.html'))
);
app.get('/pedido-confirmado', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'pedido-confirmado.html'))
);

// --- Painel Admin ---
app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'))
);

// --- API: Config ---
app.get('/api/config', (req, res) => {
  const cfg = readJson(CONFIG_FILE, { appName: 'Pitombo Lanches' });
  res.json(cfg);
});
app.post('/api/config', (req, res) => {
  const { appName } = req.body || {};
  if (!appName || typeof appName !== 'string') {
    return res.status(400).json({ error: 'appName inválido' });
  }
  const cfg = { appName: appName.trim() };
  writeJson(CONFIG_FILE, cfg);
  res.json(cfg);
});

// --- API: Menu ---
app.get('/api/menu', (req, res) => {
  const items = readJson(MENU_FILE, []);
  res.json(items);
});
app.post('/api/menu', (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items deve ser array' });
  }
  const clean = items.map((it, i) => ({
    id: it.id ?? i + 1,
    name: String(it.name || '').trim(),
    price: Number(it.price || 0),
    image: String(it.image || '').trim()
  }));
  writeJson(MENU_FILE, clean);
  res.json(clean);
});

app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
