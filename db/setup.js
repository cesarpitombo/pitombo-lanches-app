/**
 * db/setup.js — Pitombo Lanches
 * 
 * Cria o banco de dados "pitombo_lanches" (se não existir) e executa o schema.
 * NÃO depende do comando psql no PATH — usa apenas Node.js + pg.
 *
 * Como usar:
 *   npm run db:setup
 *
 * Variáveis de ambiente necessárias (.env):
 *   DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/pitombo_lanches
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ─── Parsear a DATABASE_URL ─────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('\n❌ DATABASE_URL não encontrada no arquivo .env');
  console.error('   Formato esperado: postgresql://postgres:SUA_SENHA@localhost:5432/pitombo_lanches\n');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(dbUrl);
} catch {
  console.error('\n❌ DATABASE_URL com formato inválido:', dbUrl);
  console.error('   Formato esperado: postgresql://usuario:senha@host:porta/banco\n');
  process.exit(1);
}

const config = {
  host:     parsed.hostname,
  port:     parseInt(parsed.port) || 5432,
  user:     parsed.username,
  password: parsed.password,
  ssl:      process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

const TARGET_DB = parsed.pathname.replace('/', '');

console.log('\n🔧 Pitombo Lanches — Configuração do Banco\n');
console.log(`   Host:   ${config.host}:${config.port}`);
console.log(`   Usuário: ${config.user}`);
console.log(`   Banco:  ${TARGET_DB}\n`);

// ─── Passo 1: Conectar ao banco "postgres" (padrão) para criar o target ─────
async function criarBancoSeNaoExistir() {
  const adminPool = new Pool({ ...config, database: 'postgres' });

  try {
    const client = await adminPool.connect();
    console.log('✅ Conectado ao PostgreSQL (banco padrão: postgres)');

    // Verificar se o banco já existe
    const { rows } = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [TARGET_DB]
    );

    if (rows.length === 0) {
      // Criar o banco — não pode usar $1 para nome de banco, usar identificador seguro
      await client.query(`CREATE DATABASE "${TARGET_DB}"`);
      console.log(`✅ Banco de dados "${TARGET_DB}" criado com sucesso!`);
    } else {
      console.log(`ℹ️  Banco de dados "${TARGET_DB}" já existe.`);
    }

    client.release();
  } catch (err) {
    console.error('\n❌ Erro ao conectar ao PostgreSQL.');
    console.error('   Mensagem:', err.message);
    console.error('\n📋 Verifique:');
    console.error('   1. PostgreSQL está rodando? (Windows: Serviços → postgresql-x64-16)');
    console.error('   2. A senha no .env está correta?');
    console.error(`      DATABASE_URL atual: ${dbUrl}`);
    console.error('   3. O usuário "postgres" existe?\n');
    process.exit(1);
  } finally {
    await adminPool.end();
  }
}

// ─── Passo 2: Conectar ao banco target e executar o schema ──────────────────
async function executarSchema() {
  const appPool = new Pool({ ...config, database: TARGET_DB });

  try {
    const client = await appPool.connect();
    console.log(`\n✅ Conectado ao banco "${TARGET_DB}"`);
    console.log('🗄️  Executando schema.sql...\n');

    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    await client.query(sql);
    client.release();

    console.log('✅ Tabelas criadas / verificadas!');
    console.log('✅ Dados iniciais inseridos (produtos e entregadores).');
    console.log('\n🍔 Banco pronto! Agora rode:\n   npm run dev\n');
  } catch (err) {
    console.error('❌ Erro ao executar schema:', err.message);
    if (err.detail) console.error('   Detalhe:', err.detail);
    process.exit(1);
  } finally {
    await appPool.end();
  }
}

// ─── Executar ────────────────────────────────────────────────────────────────
(async () => {
  await criarBancoSeNaoExistir();
  await executarSchema();
})();
