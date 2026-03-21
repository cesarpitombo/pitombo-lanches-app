const { pool } = require('./connection');

async function altSchema() {
  try {
    console.log('Adicionando colunas endereco e forma_pagamento à tabela pedidos...');
    await pool.query(`
      ALTER TABLE pedidos 
      ADD COLUMN IF NOT EXISTS endereco TEXT,
      ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(50),
      ADD COLUMN IF NOT EXISTS telefone VARCHAR(50);
    `);
    console.log('✅ Colunas adicionadas com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao adicionar colunas:', err.message);
  } finally {
    pool.end();
  }
}

altSchema();
