/**
 * db/testar-conexao.js — Pitombo Lanches
 * 
 * Testa a conexão com o PostgreSQL e mostra diagnóstico completo.
 * 
 * Uso: node db/testar-conexao.js
 * Ou:  node db/testar-conexao.js minha_senha_aqui
 */

require('dotenv').config();
const { Pool } = require('pg');

const senhaArg   = process.argv[2]; // senha passada via argumento
const dbUrl      = process.env.DATABASE_URL || '';

// Extrair config atual do .env
let configAtual = {};
try {
  const u = new URL(dbUrl);
  configAtual = {
    host:     u.hostname,
    port:     parseInt(u.port) || 5432,
    user:     u.username,
    password: u.password,
    database: 'postgres', // usamos postgres para diagnóstico
  };
} catch {
  configAtual = {
    host:     'localhost',
    port:     5432,
    user:     'postgres',
    password: senhaArg || 'postgres',
    database: 'postgres',
  };
}

// Se senha foi passada via argumento, sobrescreve
if (senhaArg) configAtual.password = senhaArg;

console.log('\n🔍 Pitombo Lanches — Diagnóstico de Conexão\n');
console.log(`   Host:   ${configAtual.host}:${configAtual.port}`);
console.log(`   Usuário: ${configAtual.user}`);
console.log(`   Senha:  ${'*'.repeat(configAtual.password?.length || 0)} (${configAtual.password?.length || 0} chars)`);
console.log(`   DATABASE_URL no .env: ${dbUrl || '(não encontrada)'}\n`);

async function testar(cfg, label) {
  const pool = new Pool({ ...cfg, ssl: false, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    const { rows } = await client.query('SELECT version()');
    console.log(`✅ ${label}: CONECTADO!`);
    console.log(`   Versão: ${rows[0].version.split(',')[0]}`);
    client.release();
    return true;
  } catch (err) {
    console.log(`❌ ${label}: FALHOU — ${err.message}`);
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function diagnostico() {
  // Teste 1: com a configuração atual do .env
  const ok1 = await testar(configAtual, 'Configuração atual do .env');

  if (ok1) {
    console.log('\n🎉 Conexão OK com as configurações atuais!');
    console.log('   Rode agora: npm run db:setup\n');
    return;
  }

  console.log('\n🔄 Testando senhas comuns...\n');
  const senhasComuns = ['postgres', '123456', 'admin', '', '1234', 'senha123', 'root'];

  for (const senha of senhasComuns) {
    const cfg = { ...configAtual, password: senha };
    const ok  = await testar(cfg, `Senha: "${senha}"`);
    if (ok) {
      console.log(`\n✅ Senha correta encontrada: "${senha}"`);
      console.log('\n📝 Atualize seu .env com:\n');
      console.log(`   DATABASE_URL=postgresql://${configAtual.user}:${senha}@${configAtual.host}:${configAtual.port}/pitombo_lanches\n`);
      console.log('   Depois rode: npm run db:setup\n');
      return;
    }
  }

  console.log('\n⚠️  Nenhuma senha comum funcionou.');
  console.log('\n📋 O que fazer:');
  console.log('   1. Você sabe qual é a senha do postgres? Teste assim:');
  console.log('      node db/testar-conexao.js SUA_SENHA_AQUI');
  console.log('   2. Se esqueceu a senha, você pode redefinir:');
  console.log('      a) Abra o arquivo: C:\\Program Files\\PostgreSQL\\16\\data\\pg_hba.conf');
  console.log('      b) Mude "scram-sha-256" para "trust" na linha do localhost');
  console.log('      c) Reinicie o serviço PostgreSQL (Serviços do Windows)');
  console.log('      d) Rode: node db/testar-conexao.js');
  console.log('      e) Depois defina nova senha e reverta o pg_hba.conf\n');
}

diagnostico();
