const { query } = require('../db/connection');

async function run() {
  try {
    await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS notificacoes_historico JSONB DEFAULT '{}'::jsonb`);
    console.log('Migration completed');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
