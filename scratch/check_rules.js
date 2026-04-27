const { query } = require('../db/connection');
async function run() {
  const { rows } = await query("SELECT * FROM chatbot_whatsapp_rules ORDER BY origem, status");
  console.log('Rules in DB:');
  console.table(rows);
  process.exit(0);
}
run();
