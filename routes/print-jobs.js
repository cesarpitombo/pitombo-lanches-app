/**
 * routes/print-jobs.js
 * API da fila de impressão.
 *
 * Endpoints de device (header X-Device-Token):
 *  GET  /pending       → lista jobs pendentes atribuídos ao device
 *  GET  /stream        → SSE; emite { event, data } ao chegar job novo
 *  POST /:id/ack       → marca delivered_to_agent
 *  POST /:id/printed   → marca printed
 *  POST /:id/failed    → marca failed + grava log
 *
 * Endpoints admin (requireAuth):
 *  GET  /              → listagem (filtro status)
 *  POST /:id/retry     → reseta para pending
 */
const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { requireAuth, requireRole, requireDeviceAuth } = require('../middleware/auth');
const { subscribeDevice, publishToDevice } = require('../services/printTransport');

const ADMIN_MANAGER = ['Admin', 'Manager'];

// ─── Device: pending ─────────────────────────────────────────────────
router.get('/pending', requireDeviceAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, pedido_id, impressora_id, setor_id, evento, payload, tentativas
         FROM print_jobs
        WHERE device_id = $1 AND status IN ('pending','delivered_to_agent')
        ORDER BY criado_em ASC
        LIMIT 50`,
      [req.device.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Device: SSE stream ──────────────────────────────────────────────
router.get('/stream', requireDeviceAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const write = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  write('hello', { device_id: req.device.id, at: new Date().toISOString() });

  const unsubscribe = subscribeDevice(req.device.id, req.device.loja_id, ({ event, data }) => {
    write(event, data);
  });

  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

// ─── Device: ack (delivered) ─────────────────────────────────────────
router.post('/:id/ack', requireDeviceAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE print_jobs
          SET status = 'delivered_to_agent', entregue_em = NOW(), tentativas = tentativas + 1
        WHERE id = $1 AND device_id = $2 AND status IN ('pending','delivered_to_agent')
        RETURNING id, status`,
      [req.params.id, req.device.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job não encontrado para este device.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Device: printed ─────────────────────────────────────────────────
router.post('/:id/printed', requireDeviceAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE print_jobs
          SET status = 'printed', impresso_em = NOW(), ultimo_erro = NULL
        WHERE id = $1 AND device_id = $2
        RETURNING id, status, impresso_em`,
      [req.params.id, req.device.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job não encontrado.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Device: failed ──────────────────────────────────────────────────
router.post('/:id/failed', requireDeviceAuth, async (req, res) => {
  try {
    const { mensagem } = req.body || {};
    const msg = String(mensagem || 'Erro desconhecido');
    const { rows } = await query(
      `UPDATE print_jobs
          SET status = 'failed', ultimo_erro = $3, tentativas = tentativas + 1
        WHERE id = $1 AND device_id = $2
        RETURNING id, status, tentativas`,
      [req.params.id, req.device.id, msg]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job não encontrado.' });
    await query(
      `INSERT INTO print_error_logs (device_id, job_id, mensagem) VALUES ($1, $2, $3)`,
      [req.device.id, req.params.id, msg]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin: listar jobs ──────────────────────────────────────────────
router.get('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const lojaId = req.user?.loja_id || 1;
    const status = req.query.status || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const params = [lojaId];
    let where = 'loja_id = $1';
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    const { rows } = await query(
      `SELECT id, pedido_id, impressora_id, setor_id, device_id, evento, status,
              tentativas, ultimo_erro, criado_em, entregue_em, impresso_em
         FROM print_jobs
        WHERE ${where}
        ORDER BY id DESC
        LIMIT ${limit}`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin: retry ────────────────────────────────────────────────────
router.post('/:id/retry', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE print_jobs
          SET status = 'pending', ultimo_erro = NULL
        WHERE id = $1
        RETURNING id, device_id, status`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job não encontrado.' });
    if (rows[0].device_id) publishToDevice(rows[0].device_id, 'job.new', { job_id: rows[0].id });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
