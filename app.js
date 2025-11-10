import express from "express";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 10000;

// Configuração de caminhos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, "public")));

// Rota inicial
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/index.html"));
});

// Rota do cardápio
app.get("/cardapio", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/cardapio.html"));
});

// API que retorna o menu (lê do menu.json)
app.get("/api/menu", async (req, res) => {
  try {
    const data = await readFile(path.join(__dirname, "data/menu.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    console.error("Erro ao ler o menu:", err);
    res.status(500).json({ erro: "Erro ao carregar o cardápio" });
  }
});

// Rota do carrinho
app.get("/carrinho", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/carrinho.html"));
});

// Rota de confirmação de pedido
app.get("/pedido-confirmado", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/pedido-confirmado.html"));
});

// Subir servidor
app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
  console.log(`✅ Aplicativo online em: http://localhost:${PORT}`);
});
