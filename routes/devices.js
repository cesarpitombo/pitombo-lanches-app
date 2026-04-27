/**
 * routes/devices.js
 * Pareamento e gestão de devices (app desktop AutoPrint).
 *
 * Fluxo de pareamento:
 *  1) Admin chama POST /api/devices/pair-code → recebe código curto (6 chars, 10 min).
 *  2) Usuário digita o código no app desktop → app chama POST /api/devices/pair
 *     com { codigo, nome, sistema, versao } → recebe { device_token, device }.
 *  3) App envia heartbeats via POST /api/devices/heartbeat com X-Device-Token.
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query } = require('../db/connection');
const {
  requireAuth,
  requireRole,
  requireDeviceAuth,
  hashDeviceToken,
} = require('../middleware/auth');

const ADMIN_MANAGER = ['Admin', 'Manager'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return out;
}

// ─── Admin: gerar código de pareamento ───────────────────────────────
router.post('/pair-code', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const lojaId = req.user?.loja_id || 1;
    const { nome, setores } = req.body || {};
    let codigo;
    for (let tries = 0; tries < 10; tries++) {
      codigo = genCode(6);
      try {
        await query(
          `INSERT INTO device_pair_codes (codigo, loja_id, nome_sugerido, setores_sugeridos, expira_em)
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
          [codigo, lojaId, nome || null, Array.isArray(setores) ? setores.map(Number) : []]
        );
        return res.json({ codigo, expira_em_segundos: 600 });
      } catch (e) {
        if (e.code !== '23505') throw e;
      }
    }
    res.status(500).json({ error: 'Não foi possível gerar código único.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── App desktop: trocar código por device_token ─────────────────────
router.post('/pair', async (req, res) => {
  try {
    const { codigo, nome, sistema, versao } = req.body || {};
    if (!codigo) return res.status(400).json({ error: 'codigo é obrigatório' });
    const clean = String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, '');

    const { rows } = await query(
      `SELECT * FROM device_pair_codes WHERE codigo = $1 AND usado = FALSE AND expira_em > NOW()`,
      [clean]
    );
    if (!rows.length) return res.status(404).json({ error: 'Código inválido ou expirado.' });
    const pair = rows[0];

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashDeviceToken(plainToken);
    const deviceName = nome || pair.nome_sugerido || 'AutoPrint Device';

    const { rows: devRows } = await query(
      `INSERT INTO devices (loja_id, nome, token_hash, sistema, versao, setores_vinculados, pareado_em, ultimo_ip)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7) RETURNING id, loja_id, nome, setores_vinculados`,
      [pair.loja_id, deviceName, tokenHash, sistema || null, versao || null, pair.setores_sugeridos || [], req.ip]
    );

    await query('UPDATE device_pair_codes SET usado = TRUE WHERE codigo = $1', [clean]);
    await query(
      `INSERT INTO device_heartbeats (device_id, ultimo_em, status) VALUES ($1, NOW(), 'online')
       ON CONFLICT (device_id) DO UPDATE SET ultimo_em = NOW(), status = 'online'`,
      [devRows[0].id]
    );

    res.json({ device_token: plainToken, device: devRows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Device: heartbeat ───────────────────────────────────────────────
router.post('/heartbeat', requireDeviceAuth, async (req, res) => {
  try {
    const { status, impressoras_online } = req.body || {};
    await query(
      `INSERT INTO device_heartbeats (device_id, ultimo_em, status, impressoras_online)
       VALUES ($1, NOW(), $2, $3::jsonb)
       ON CONFLICT (device_id) DO UPDATE
         SET ultimo_em = NOW(),
             status = EXCLUDED.status,
             impressoras_online = EXCLUDED.impressoras_online`,
      [req.device.id, status || 'online', JSON.stringify(impressoras_online || [])]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin: listar devices + heartbeat ────────────────────────────────
router.get('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const lojaId = req.user?.loja_id || 1;
    const { rows } = await query(`
      SELECT d.id, d.nome, d.sistema, d.versao, d.setores_vinculados, d.ultimo_ip,
             d.ativo, d.criado_em, d.pareado_em,
             h.ultimo_em AS heartbeat_em, h.status AS heartbeat_status, h.impressoras_online,
             (SELECT MAX(impresso_em) FROM print_jobs pj WHERE pj.device_id = d.id) AS ultima_impressao,
             (SELECT mensagem FROM print_error_logs pel WHERE pel.device_id = d.id ORDER BY criado_em DESC LIMIT 1) AS ultimo_erro
        FROM devices d
   LEFT JOIN device_heartbeats h ON h.device_id = d.id
       WHERE d.loja_id = $1
    ORDER BY d.id DESC
    `, [lojaId]);

    // deriva estado visual
    const now = Date.now();
    const enriched = rows.map(r => {
      let saude = 'offline';
      if (r.heartbeat_em) {
        const age = (now - new Date(r.heartbeat_em).getTime()) / 1000;
        if (age < 60) saude = 'online';
        else if (age < 180) saude = 'instavel';
      }
      return { ...r, saude };
    });
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin: atualizar device (nome, setores, ativo) ──────────────────
router.put('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const { nome, setores_vinculados, ativo } = req.body || {};
    const updates = [];
    const params = [];
    if (nome !== undefined) { params.push(nome); updates.push(`nome = $${params.length}`); }
    if (setores_vinculados !== undefined) {
      params.push(Array.isArray(setores_vinculados) ? setores_vinculados.map(Number) : []);
      updates.push(`setores_vinculados = $${params.length}`);
    }
    if (ativo !== undefined) { params.push(!!ativo); updates.push(`ativo = $${params.length}`); }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE devices SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Device não encontrado.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin: revogar device ───────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE devices SET ativo = FALSE WHERE id = $1 RETURNING id, nome`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Device não encontrado.' });
    res.json({ ok: true, revoked: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
