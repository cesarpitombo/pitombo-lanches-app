import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Banco de dados (Neon)
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Teste de conexão
pool.connect()
  .then(() => console.log("✅ Conectado ao banco de dados Neon"))
  .catch((err) => console.error("❌ Erro ao conectar ao banco:", err.message));

// Rota principal
app.get("/", (req, res) => {
  res.send("Bem-vindo ao Pitombo Lanches!");
});

// Rota para listar cardápio
app.get("/cardapio", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM produtos ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao obter cardápio:", err.message);
    res.status(500).send("Erro ao obter cardápio");
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
