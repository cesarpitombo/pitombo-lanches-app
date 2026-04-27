const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN_MANAGER = ['Admin', 'Manager'];

// GET / — listar setores
router.get('/', requireAuth, async (req, res) => {
  try {
    const lojaId = req.user?.loja_id || 1;
    const { rows } = await query(
      'SELECT * FROM setores WHERE loja_id = $1 ORDER BY id ASC',
      [lojaId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST / — criar setor
router.post('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const lojaId = req.user?.loja_id || 1;
    const { nome, tipo } = req.body || {};
    if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });
    const { rows } = await query(
      `INSERT INTO setores (loja_id, nome, tipo) VALUES ($1, $2, $3) RETURNING *`,
      [lojaId, String(nome).trim(), String(tipo || 'cozinha').trim()]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Já existe um setor com esse nome.' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /:id — atualizar
router.put('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, tipo } = req.body || {};
    const updates = [];
    const params = [];
    if (nome !== undefined) { params.push(nome); updates.push(`nome = $${params.length}`); }
    if (tipo !== undefined) { params.push(tipo); updates.push(`tipo = $${params.length}`); }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
    params.push(id);
    const { rows } = await query(
      `UPDATE setores SET ${updates.join(', ')}, atualizado_em = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Setor não encontrado.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /:id
router.delete('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM setores WHERE id=$1 RETURNING *', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Setor não encontrado.' });
    res.json({ ok: true, removed: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Vínculo impressora ↔ setor ──────────────────────────────────────
// GET /impressora/:id → lista setores ligados à impressora
router.get('/impressora/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT s.*, ips.copias
         FROM impressora_setores ips
         JOIN setores s ON s.id = ips.setor_id
        WHERE ips.impressora_id = $1
        ORDER BY s.id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /impressora/:id → substitui vínculos. Body: { setores: [{ id, copias }] }
router.put('/impressora/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const impressoraId = parseInt(req.params.id, 10);
    const setores = Array.isArray(req.body?.setores) ? req.body.setores : [];
    await query('DELETE FROM impressora_setores WHERE impressora_id = $1', [impressoraId]);
    for (const s of setores) {
      const sid = parseInt(s.id, 10);
      const copias = parseInt(s.copias, 10) || 1;
      if (!sid) continue;
      await query(
        `INSERT INTO impressora_setores (impressora_id, setor_id, copias)
         VALUES ($1, $2, $3)
         ON CONFLICT (impressora_id, setor_id) DO UPDATE SET copias = EXCLUDED.copias`,
        [impressoraId, sid, copias]
      );
    }
    res.json({ ok: true, vinculados: setores.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
