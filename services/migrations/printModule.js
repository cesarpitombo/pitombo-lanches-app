/**
 * services/migrations/printModule.js
 * Migrations idempotentes do módulo AutoPrint: setores, impressora_setores,
 * print_jobs, devices, device_heartbeats, print_error_logs.
 * Também faz backfill de cozinhas → setores na primeira execução.
 */
const { query } = require('../../db/connection');

async function runPrintModuleMigrations() {
  // setores ─────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS setores (
      id             SERIAL PRIMARY KEY,
      loja_id        INTEGER     NOT NULL DEFAULT 1,
      nome           VARCHAR(80) NOT NULL,
      tipo           VARCHAR(32) NOT NULL DEFAULT 'cozinha',
      criado_em      TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(loja_id, nome)
    )
  `);

  // Seed default sectors
  await query(`
    INSERT INTO setores (loja_id, nome, tipo)
    VALUES (1, 'Cliente', 'cliente'),
           (1, 'Cozinha', 'cozinha'),
           (1, 'Bar', 'bar'),
           (1, 'Expedição', 'expedicao')
    ON CONFLICT (loja_id, nome) DO NOTHING
  `);

  // Backfill: cozinhas → setores (se tabela cozinhas existe)
  try {
    await query(`
      INSERT INTO setores (loja_id, nome, tipo)
      SELECT 1, nome, 'cozinha' FROM cozinhas
      ON CONFLICT (loja_id, nome) DO NOTHING
    `);
  } catch (_) { /* cozinhas pode não existir ainda no boot */ }

  // impressora_setores ──────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS impressora_setores (
      impressora_id  INTEGER NOT NULL,
      setor_id       INTEGER NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
      copias         INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (impressora_id, setor_id)
    )
  `);

  // devices ─────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS devices (
      id                   SERIAL PRIMARY KEY,
      loja_id              INTEGER     NOT NULL DEFAULT 1,
      nome                 VARCHAR(120) NOT NULL,
      token_hash           CHAR(64)    NOT NULL UNIQUE,
      sistema              VARCHAR(40),
      versao               VARCHAR(40),
      setores_vinculados   INTEGER[]   DEFAULT '{}',
      ultimo_ip            VARCHAR(64),
      ativo                BOOLEAN     NOT NULL DEFAULT TRUE,
      criado_em            TIMESTAMPTZ DEFAULT NOW(),
      pareado_em           TIMESTAMPTZ
    )
  `);

  // device_pair_codes — códigos curtos (6 chars) para pareamento one-shot
  await query(`
    CREATE TABLE IF NOT EXISTS device_pair_codes (
      codigo      CHAR(6)     PRIMARY KEY,
      loja_id     INTEGER     NOT NULL DEFAULT 1,
      nome_sugerido VARCHAR(120),
      setores_sugeridos INTEGER[] DEFAULT '{}',
      usado       BOOLEAN     NOT NULL DEFAULT FALSE,
      criado_em   TIMESTAMPTZ DEFAULT NOW(),
      expira_em   TIMESTAMPTZ NOT NULL
    )
  `);

  // device_heartbeats ───────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS device_heartbeats (
      device_id          INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
      ultimo_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status             VARCHAR(24) NOT NULL DEFAULT 'online',
      impressoras_online JSONB       DEFAULT '[]'::jsonb
    )
  `);

  // print_jobs ──────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS print_jobs (
      id             SERIAL PRIMARY KEY,
      loja_id        INTEGER     NOT NULL DEFAULT 1,
      pedido_id      INTEGER,
      impressora_id  INTEGER,
      setor_id       INTEGER,
      device_id      INTEGER,
      evento         VARCHAR(40) NOT NULL,
      payload        JSONB       NOT NULL DEFAULT '{}'::jsonb,
      status         VARCHAR(32) NOT NULL DEFAULT 'pending',
      tentativas     INTEGER     NOT NULL DEFAULT 0,
      ultimo_erro    TEXT,
      criado_em      TIMESTAMPTZ DEFAULT NOW(),
      entregue_em    TIMESTAMPTZ,
      impresso_em    TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status, loja_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_print_jobs_device ON print_jobs(device_id, status)`);

  // print_error_logs ────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS print_error_logs (
      id         SERIAL PRIMARY KEY,
      device_id  INTEGER,
      job_id     INTEGER,
      mensagem   TEXT NOT NULL,
      criado_em  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // store_settings.print_rules (JSONB) ──────────────────────────────────
  try {
    await query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS print_rules JSONB DEFAULT '{}'::jsonb`);
  } catch (_) { /* store_settings pode não existir ainda */ }

  console.log('✅ Migrations AutoPrint: tabelas verificadas (setores, impressora_setores, print_jobs, devices, device_heartbeats, print_error_logs).');
}

module.exports = { runPrintModuleMigrations };
