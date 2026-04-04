const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  try {
    console.log('🚀 Iniciando migração do sistema de produtos...');
    
    // 1. Adicionar allow_observation em produtos
    console.log('- Atualizando tabela produtos...');
    await pool.query(`
      ALTER TABLE produtos 
      ADD COLUMN IF NOT EXISTS allow_observation BOOLEAN DEFAULT TRUE;
    `);

    // 2. Adicionar ordem e ativo em modificador_categorias
    console.log('- Atualizando tabela modificador_categorias...');
    await pool.query(`
      ALTER TABLE modificador_categorias 
      ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
    `);

    console.log('✅ Migração concluída com sucesso!');
  } catch (err) {
    console.error('❌ Erro na migração:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
