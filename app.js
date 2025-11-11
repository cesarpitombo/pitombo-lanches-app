import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// estáticos
app.use(express.static(path.join(__dirname, "public")));

// home
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// atalhos bonitos
app.get("/cardapio", (_req, res) => {
  res.redirect("/cliente/cardapio.html");
});
app.get("/cliente", (_req, res) => {
  res.redirect("/cliente/index.html");
});
app.get("/admin", (_req, res) => {
  res.redirect("/admin/index.html");
});

// 404 simples
app.use((_req, res) => {
  res.status(404).send("Página não encontrada 😔");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
