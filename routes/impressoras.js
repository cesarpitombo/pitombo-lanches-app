const express = require('express');
const router  = express.Router();
const { query } = require('../db/connection');
const {
  pingImpressoraRede,
  testarIpDireto,
  escanearRedeLocal,
  scanImpressorasWindows,
  enviarTesteRede,
  enviarTesteWindows,
  getLocalSubnet,
} = require('../services/impressoras/impressoraService');

// ─── Auto-migration ───────────────────────────────────────────────────────────
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS impressoras (
        id               SERIAL PRIMARY KEY,
        nome             VARCHAR(100) NOT NULL,
        ip               VARCHAR(50)  NOT NULL,
        porta            INTEGER      DEFAULT 9100,
        tipo_conexao     VARCHAR(50)  DEFAULT 'rede',
        setor            VARCHAR(50)  DEFAULT 'geral',
        papel_mm         INTEGER      DEFAULT 80,
        ativa            BOOLEAN      DEFAULT true,
        padrao           BOOLEAN      DEFAULT false,
        ultima_verificacao TIMESTAMP,
        ultimo_status    VARCHAR(50)  DEFAULT 'nao_testada',
        ultimo_erro      TEXT,
        criado_em        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        atualizado_em    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Setup] Tabela impressoras OK.');
  } catch (err) {
    console.error('[Setup] Erro ao criar tabela de impressoras:', err.message);
  }
})();

// ─── GET / — list all printers ────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query('SELECT * FROM impressoras ORDER BY padrao DESC, id ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar impressoras' });
  }
});

// ─── POST / — create printer ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { nome, ip, porta, tipo_conexao, setor, papel_mm, ativa, padrao } = req.body;
    if (padrao) await query('UPDATE impressoras SET padrao = false');
    const { rows } = await query(`
      INSERT INTO impressoras (nome, ip, porta, tipo_conexao, setor, papel_mm, ativa, padrao)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [nome, ip, porta || 9100, tipo_conexao || 'rede', setor || 'geral', papel_mm || 80, ativa !== false, !!padrao]);
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao cadastrar impressora: ' + e.message });
  }
});

// ─── PUT /:id — update printer ────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, ip, porta, tipo_conexao, setor, papel_mm, ativa, padrao } = req.body;
    if (padrao) await query('UPDATE impressoras SET padrao = false');
    const { rows } = await query(`
      UPDATE impressoras
      SET nome=$1, ip=$2, porta=$3, tipo_conexao=$4, setor=$5, papel_mm=$6, ativa=$7, padrao=$8, atualizado_em=CURRENT_TIMESTAMP
      WHERE id=$9 RETURNING *
    `, [nome, ip, porta, tipo_conexao, setor, papel_mm, ativa, padrao, id]);
    if (!rows.length) return res.status(404).json({ error: 'Impressora não encontrada' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar impressora: ' + e.message });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {  // req used for req.params.id
  try {
    const { rows } = await query('DELETE FROM impressoras WHERE id=$1 RETURNING *', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Impressora não encontrada' });
    res.json({ ok: true, removed: rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover impressora' });
  }
});

// ─── POST /descobrir — scan Windows spooler for USB printers ──────────────────
router.post('/descobrir', async (req, res) => {
  try {
    const result = await scanImpressorasWindows();
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /escanear-rede — probe local subnet for ESC/POS printers (port 9100) ─
// Scans 254 IPs concurrently. Takes ~5-10s. Returns list of responsive IPs.
router.post('/escanear-rede', async (req, res) => {
  try {
    const { faixa, porta } = req.body;
    const result = await escanearRedeLocal(faixa || null, parseInt(porta, 10) || 9100);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /testar-ip — test arbitrary IP:port without saving ──────────────────
// Used by the modal "Testar Conexão" button before saving.
router.post('/testar-ip', async (req, res) => {
  try {
    const { ip, porta } = req.body;
    if (!ip) return res.status(400).json({ ok: false, message: 'IP é obrigatório' });
    const result = await testarIpDireto(ip.trim(), porta || 9100);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ─── GET /subnet — return local subnet info ───────────────────────────────────
router.get('/subnet', (_req, res) => {
  res.json(getLocalSubnet());
});

// ─── POST /:id/testar-conexao — ping a saved printer ─────────────────────────
router.post('/:id/testar-conexao', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM impressoras WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Impressora não encontrada' });
    const imp = rows[0];

    let result;
    if (imp.tipo_conexao === 'rede') {
      result = await pingImpressoraRede(imp.ip, imp.porta || 9100);
    } else {
      result = { ok: true, status: 'online', message: 'Impressora USB/Windows: use Testar Impressão para validar.' };
    }

    await query(
      'UPDATE impressoras SET ultimo_status=$1, ultima_verificacao=CURRENT_TIMESTAMP WHERE id=$2',
      [result.status || (result.ok ? 'online' : 'erro'), imp.id]
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ─── POST /:id/testar-impressao — send test ticket ───────────────────────────
router.post('/:id/testar-impressao', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM impressoras WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Impressora não encontrada' });
    const imp = rows[0];

    let result;
    if (imp.tipo_conexao === 'rede') {
      result = await enviarTesteRede(imp.ip, imp.porta || 9100, imp.papel_mm || 80);
    } else if (imp.tipo_conexao === 'windows') {
      // For Windows printers: ip column stores the Windows queue name
      const fila = imp.ip || imp.nome;
      result = await enviarTesteWindows(fila);
    } else {
      result = { ok: false, message: 'Tipo de conexão não suportado: ' + imp.tipo_conexao };
    }

    const statusCol = result.ok ? 'online' : 'erro';
    await query(
      'UPDATE impressoras SET ultimo_status=$1, ultimo_erro=$2, ultima_verificacao=CURRENT_TIMESTAMP WHERE id=$3',
      [statusCol, result.ok ? null : result.message, imp.id]
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
