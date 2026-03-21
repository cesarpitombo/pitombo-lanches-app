const { query } = require('./connection');

async function up() {
  try {
    await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo VARCHAR(50) DEFAULT 'delivery';`);
    console.log('✅ Coluna "tipo" adicionada à tabela pedidos.');
    
    // update existing to delivery
    await query(`UPDATE pedidos SET tipo = 'delivery' WHERE tipo IS NULL;`);
    
  } catch (err) {
    console.error('Erro:', err);
  } finally {
    process.exit(0);
  }
}

up();
