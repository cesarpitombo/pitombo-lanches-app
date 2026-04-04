/**
 * db/refine_menu_editor.js
 * Migração avançada para suportar Combos e Regras de Negócio de Modificadores
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  try {
    console.log('🚀 Iniciando refinamento do sistema de modificadores...');

    // 1. Atualizar modificador_categorias (Grupos)
    console.log('- Atualizando modificador_categorias...');
    await pool.query(`
      ALTER TABLE modificador_categorias 
      ADD COLUMN IF NOT EXISTS min_escolhas INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS max_escolhas INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS selecao_unica BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
    `);

    // 2. Atualizar modificador_itens (Opções)
    console.log('- Atualizando modificador_itens...');
    await pool.query(`
      ALTER TABLE modificador_itens 
      ADD COLUMN IF NOT EXISTS sku VARCHAR(50),
      ADD COLUMN IF NOT EXISTS custo DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS quantidade_maxima INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;
    `);

    // 3. Garantir tabela de vínculo produto_modificadores com campos de override
    console.log('- Garantindo tabela produto_modificadores com suporte a Combos...');
    // Se a tabela já existir e for apenas (produto_id, categoria_id), vamos recriar ou atualizar
    await pool.query(`
      CREATE TABLE IF NOT EXISTS produto_modificadores (
        id SERIAL PRIMARY KEY,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
        categoria_id INTEGER REFERENCES modificador_categorias(id) ON DELETE CASCADE,
        min_escolhas_override INTEGER,
        max_escolhas_override INTEGER,
        obrigatorio_override BOOLEAN,
        ordem INTEGER DEFAULT 0
      );
    `);

    // Se a tabela já existia sem PK, vamos garantir que ela tenha os campos novos
    await pool.query(`
        ALTER TABLE produto_modificadores ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;
        ALTER TABLE produto_modificadores ADD COLUMN IF NOT EXISTS min_escolhas_override INTEGER;
        ALTER TABLE produto_modificadores ADD COLUMN IF NOT EXISTS max_escolhas_override INTEGER;
        ALTER TABLE produto_modificadores ADD COLUMN IF NOT EXISTS obrigatorio_override BOOLEAN;
        ALTER TABLE produto_modificadores ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;
    `).catch(() => { /* Ignorar se já existem */ });

    console.log('✅ Refinamento de banco concluído com sucesso!');
  } catch (err) {
    console.error('❌ Erro na migração:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
