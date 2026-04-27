const { query } = require('../db/connection');
async function run() {
  const { rows } = await query("SELECT chave, mensagem FROM chatbot_mensagens WHERE chave LIKE '%pedido%'");
  console.log(rows);
  process.exit(0);
}
run();
