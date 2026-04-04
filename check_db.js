const { query } = require('./db/connection');
(async () => {
  const { rows } = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'pedidos'");
  console.log(rows.map(r => r.column_name));
  process.exit();
})();
