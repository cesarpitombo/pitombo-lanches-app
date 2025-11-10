import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 10000;

// Corrige caminhos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware para ler JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configura pasta pública
app.use(express.static(path.join(__dirname, "public")));

// Rota inicial
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cliente", "index.html"));
});

// Rota do cardápio
app.get("/cardapio", (req, res) => {
  try {
    const dataPath = path.join(__dirname, "data", "menu.json");
    const data = fs.readFileSync(dataPath, "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch (error) {
    console.error("Erro ao carregar menu:", error);
    res.status(500).send({ erro: "Erro ao carregar o menu" });
  }
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`🔥 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
