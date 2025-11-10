import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// estáticos
app.use(express.static(path.join(__dirname, "public")));
app.use("/data", express.static(path.join(__dirname, "data"))); // <- serve menu.json

// rotas de páginas
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public/cliente/index.html"))
);

app.get("/cardapio", (req, res) =>
  res.sendFile(path.join(__dirname, "public/cliente/cardapio.html"))
);

app.get("/carrinho", (req, res) =>
  res.sendFile(path.join(__dirname, "public/cliente/carrinho.html"))
);

app.get("/pedido-confirmado", (req, res) =>
  res.sendFile(path.join(__dirname, "public/cliente/pedido-confirmado.html"))
);

app.listen(port, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${port}`);
  console.log(`✅ Acesse: http://localhost:${port}`);
});
