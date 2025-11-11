// app.js — versão ES Modules (Render compatível)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware para servir arquivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// Rota principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/index.html"));
});

// Rota para cardápio
app.get("/cardapio", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/cardapio.html"));
});

// Rota para carrinho
app.get("/carrinho", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/carrinho.html"));
});

// Rota para página de confirmação
app.get("/pedido-confirmado", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/pedido-confirmado.html"));
});

// Rota para admin
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/index.html"));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo
