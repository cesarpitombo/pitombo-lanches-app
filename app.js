// app.js (ESM)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 10000;

// __dirname em ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pasta pública
const publicDir = path.join(__dirname, "public");

// Cache off pra evitar “página branca” por HTML antigo
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Servir arquivos estáticos (habilita .html automático)
app.use(express.static(publicDir, { extensions: ["html"] }));

// Rota raiz -> public/index.html (se existir)
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// /admin e arquivos dentro de /public/admin
app.get("/admin/*", (req, res) => {
  const subpath = req.path.replace(/^\/admin\/?/, "") || "index.html";
  res.sendFile(path.join(publicDir, "admin", subpath));
});

// /cliente e arquivos dentro de /public/cliente
app.get("/cliente/*", (req, res) => {
  const subpath = req.path.replace(/^\/cliente\/?/, "") || "index.html";
  res.sendFile(path.join(publicDir, "cliente", subpath));
});

// Healthcheck opcional
app.get("/healthz", (req, res) => res.send("ok"));

// Sobe o servidor
app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
