const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  try {
    console.log('Adicionando campos de pagamento...');
    await pool.query(`
      ALTER TABLE pedidos 
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pendente',
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'dinheiro',
      ADD COLUMN IF NOT EXISTS troco_para DECIMAL(10,2),
      ADD COLUMN IF NOT EXISTS valor_troco DECIMAL(10,2);
    `);
    console.log('Campos de pagamento adicionados com sucesso!');
  } catch (err) {
    console.error('Erro na migração:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
