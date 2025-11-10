import express from "express";
import path from "path";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// arquivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// =================== API ===================
app.get("/api/menu", async (_req, res) => {
  try {
    const file = path.join(__dirname, "data", "menu.json");
    const raw = await readFile(file, "utf8");
    const data = JSON.parse(raw);
    res.json(data);
  } catch (err) {
    console.error("Erro lendo menu.json:", err);
    res.status(500).json({ error: "Falha ao carregar cardápio" });
  }
});

// =================== PÁGINAS ===================
app.get("/", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "cliente", "index.html"))
);

app.get("/cardapio", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "cliente", "cardapio.html"))
);

app.get("/carrinho", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "cliente", "carrinho.html"))
);

app.get("/pedido-confirmado", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "cliente", "pedido-confirmado.html"))
);

// (opcional) admin
app.get("/admin", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin", "index.html"))
);

app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
