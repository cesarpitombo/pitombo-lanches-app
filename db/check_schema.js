const { query } = require('./connection');

async function check() {
  try {
    console.log('--- Tabelas Relacionadas a Modificadores ---');
    const tables = ['modificador_categorias', 'modificador_itens', 'produto_modificadores'];
    
    for (const t of tables) {
      console.log(`\nTable: ${t}`);
      const { rows } = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [t]);
      console.table(rows);
    }
  } catch (err) {
    console.error('Erro:', err);
  } finally {
    process.exit();
  }
}

check();
