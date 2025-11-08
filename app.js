import express from "express";
import pkg from "pg";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 10000;

// Caminho absoluto para pastas públicas
const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Configuração do banco de dados Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Teste de conexão
pool.connect()
  .then(() => console.log("🟢 Conectado ao banco de dados Neon"))
  .catch((err) => console.error("🔴 Erro ao conectar ao banco:", err));

// Rota principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/index.html"));
});

// Rota para pegar o cardápio
app.get("/api/cardapio", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.nome, p.preco, p.imagem, c.nome AS categoria
      FROM produtos p
      JOIN categorias c ON p.categoria_id = c.id
      ORDER BY c.nome, p.nome
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar cardápio:", error);
    res.status(500).json({ error: "Erro ao buscar cardápio" });
  }
});

// Rota para atualizar o menu via painel admin
app.post("/api/admin/menu", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: "Token inválido" });
  }

  try {
    const novosItens = req.body;
    await pool.query("DELETE FROM produtos");

    for (const item of novosItens) {
      await pool.query(
        "INSERT INTO produtos (nome, preco, imagem, categoria_id) VALUES ($1, $2, $3, 1)",
        [item.nome, item.preco, item.img]
      );
    }

    res.json({ message: "Cardápio atualizado com sucesso!" });
  } catch (error) {
    console.error("Erro ao atualizar menu:", error);
    res.status(500).json({ error: "Erro ao atualizar menu" });
  }
});

// Rota para servir o painel admin
app.get("/cliente/admin.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cliente/admin.html"));
});

// Inicialização do servidor
app.listen(PORT, () => {
  console.log(Servidor Pitombo Lanches rodando na porta ${PORT});
});
