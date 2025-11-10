import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware para JSON e arquivos estáticos
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Caminho do menu.json
const menuPath = path.join(__dirname, "data", "menu.json");

// Página inicial
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cliente", "index.html"));
});

// Rota para o cardápio
app.get("/cardapio", (req, res) => {
  try {
    const data = fs.readFileSync(menuPath);
    const menu = JSON.parse(data);
    res.json(menu);
  } catch (err) {
    res.status(500).send("Erro ao carregar cardápio");
  }
});

// Adicionar item (admin)
app.post("/admin/adicionar", (req, res) => {
  try {
    const novoItem = req.body;
    const data = fs.readFileSync(menuPath);
    const menu = JSON.parse(data);

    menu.push(novoItem);
    fs.writeFileSync(menuPath, JSON.stringify(menu, null, 2));

    res.send("Item adicionado com sucesso!");
  } catch (err) {
    res.status(500).send("Erro ao adicionar item");
  }
});

// Página de carrinho
app.get("/carrinho", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cliente", "carrinho.html"));
});

// Página de confirmação
app.get("/pedido-confirmado", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cliente", "pedido-confirmado.html"));
});

// Inicializar servidor
app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
