const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Testa a conexão ao iniciar
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco de dados:', err.message);
    console.error('   Verifique o DATABASE_URL no arquivo .env');
  } else {
    console.log('✅ Conectado ao PostgreSQL com sucesso!');
    release();
  }
});

/**
 * Helper para executar queries SQL.
 * Uso: const { rows } = await query('SELECT * FROM produtos WHERE id = $1', [id]);
 */
const query = (text, params) => pool.query(text, params);

/**
 * Helper para transações.
 * Uso:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
