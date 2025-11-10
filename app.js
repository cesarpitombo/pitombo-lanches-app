import express from "express";
import pkg from "pg";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(express.json());
app.use(cors());

// __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Conexão Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Estáticos
app.use(express.static(path.join(__dirname, "public")));

// ===== API =====
app.get("/api/produtos", async (req, res) => {
  try {
    const sql = "SELECT id, nome, preco, imagem, categoria_id FROM produtos ORDER BY id ASC";
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error("Erro ao buscar produtos:", err);
    res.status(500).json({ error: "Erro ao buscar produtos" });
  }
});

app.post("/api/pedidos", async (req, res) => {
  try {
    const { cliente_nome, total } = req.body;
    const sql = "INSERT INTO pedidos (cliente_nome, total) VALUES ($1, $2) RETURNING *";
    const { rows } = await pool.query(sql, [cliente_nome, total]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Erro ao registrar pedido:", err);
    res.status(500).json({ error: "Erro ao registrar pedido" });
  }
});

// ===== Páginas (sempre apontando pra /public/cliente) =====
const c = (...p) => path.join(__dirname, "public", "cliente", ...p);

app.get("/",            (req, res) => res.sendFile(c("index.html")));
app.get("/cardapio",    (req, res) => res.sendFile(c("cardapio.html")));
app.get("/carrinho",    (req, res) => res.sendFile(c("carrinho.html")));
app.get("/pedido-confirmado", (req, res) => res.sendFile(c("pedido-confirmado.html")));

// Painel admin opcional em /public/admin/painel.html
app.get("/admin", (req, res) => {
  const adminPath = path.join(__dirname, "public", "admin", "painel.html");
  res.sendFile(adminPath);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🔥 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
