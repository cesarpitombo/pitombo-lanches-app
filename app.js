// app.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

// --- DB (opcional): usa DATABASE_URL se existir, senão cai no arquivo data/menu.json
let pool = null;
const { DATABASE_URL } = process.env;
if (DATABASE_URL) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: DATABASE_URL,
    // Render/Neon exigem SSL
    ssl: { rejectUnauthorized: false },
  });
}

// util: carrega cardápio do DB ou do arquivo
async function loadMenu() {
  if (pool) {
    // esquema simples: tabela "produtos" com colunas: id, nome, preco, imagem
    const { rows } = await pool.query(
      "SELECT id, nome, preco, imagem FROM produtos WHERE is_active IS TRUE ORDER BY id ASC"
    );
    // normaliza preco para número
    return rows.map(r => ({
      id: r.id,
      nome: r.nome,
      preco: Number(r.preco),
      imagem: r.imagem || "",
    }));
  }

  // fallback: arquivo
  const filePath = path.join(__dirname, "data", "menu.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const list = JSON.parse(raw || "[]");
  return list.map((r, i) => ({
    id: r.id ?? i + 1,
    nome: r.nome,
    preco: Number(r.preco),
    imagem: r.imagem || "",
  }));
}

// --------- middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --------- API
app.get("/api/menu", async (req, res) => {
  try {
    const menu = await loadMenu();
    return res.json(menu);
  } catch (err) {
    console.error("Erro /api/menu:", err);
    return res.status(500).json({ error: "Falha ao carregar cardápio" });
  }
});

// --------- rotas de páginas (atalhos amigáveis)
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "cliente", "index.html"))
);
app.get("/cardapio", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "cliente", "cardapio.html"))
);
app.get("/carrinho", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "cliente", "carrinho.html"))
);
app.get("/pedido-confirmado", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "pedido-confirmado.html"))
);

// --------- start
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
