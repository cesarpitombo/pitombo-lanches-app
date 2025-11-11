// app.js — Servidor Pitombo Lanches (Render pronto)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Corrige caminhos no formato ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Serve a pasta "public" como estática
app.use(express.static(path.join(__dirname, "public")));

// Rota inicial (cliente)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/index.html"));
});

// Página de cardápio
app.get("/cardapio", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/cardapio.html"));
});

// Página do carrinho
app.get("/carrinho", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/carrinho.html"));
});

// Página de confirmação de pedido
app.get("/pedido-confirmado", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/pedido-confirmado.html"));
});

// Página do admin
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/index.html"));
});

// Rota de erro 404
app.use((req, res) => {
  res.status(404).send("Página não encontrada 😕");
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
