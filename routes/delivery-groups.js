/**
 * routes/delivery-groups.js
 * Agrupamento de pedidos delivery por proximidade.
 */
const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const { gerarSugestoes } = require('../services/deliveryGrouping');

const ADMIN_MANAGER_PDV = ['Admin', 'Manager', 'Garçom'];

const PALETA_GRUPO = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#a855f7'];
function _proximaCor() {
  return PALETA_GRUPO[Math.floor(Math.random() * PALETA_GRUPO.length)];
}

// ── GET /api/delivery-groups/suggestions ────────────────────────────────
// Retorna mapa { pedido_id: [{id,score,motivo,...}, ...] } com candidatos a agrupar.
router.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const { rows: pedidos } = await query(`
      SELECT id, cliente, telefone, endereco, status, tipo, zona_nome,
             latitude, longitude, delivery_group_id, criado_em
        FROM pedidos
       WHERE (excluido IS NULL OR excluido = FALSE)
         AND tipo = 'delivery'
         AND status IN ('recebido','pendente_aprovacao','em_preparo','pronto','em_entrega')
    `);
    const sugestoes = gerarSugestoes(pedidos);
    const mapa = {};
    for (const s of sugestoes) mapa[s.pedido_id] = s.candidatos;
    res.json({ sugestoes: mapa, total_pedidos_avaliados: pedidos.length });
  } catch (e) {
    console.error('[DeliveryGrouping] suggestions error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/delivery-groups ────────────────────────────────────────────
// Lista grupos ativos com seus pedidos.
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT g.id, g.cor, g.nota, g.criado_em,
             COALESCE(json_agg(json_build_object(
               'id', p.id, 'cliente', p.cliente, 'endereco', p.endereco,
               'status', p.status, 'entregador_id', p.entregador_id
             ) ORDER BY p.id) FILTER (WHERE p.id IS NOT NULL), '[]') AS pedidos
        FROM delivery_groups g
        LEFT JOIN pedidos p ON p.delivery_group_id = g.id
       WHERE g.desfeito_em IS NULL
       GROUP BY g.id
       ORDER BY g.id DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/delivery-groups ───────────────────────────────────────────
// body: { pedido_ids: [int,...], nota?: string }
router.post('/', requireAuth, requireRole(ADMIN_MANAGER_PDV), async (req, res) => {
  const { pedido_ids, nota } = req.body || {};
  if (!Array.isArray(pedido_ids) || pedido_ids.length < 2) {
    return res.status(400).json({ error: 'pedido_ids deve ter ao menos 2 ids.' });
  }
  const ids = pedido_ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (ids.length < 2) return res.status(400).json({ error: 'ids inválidos' });

  try {
    // Valida: pedidos existem, são delivery, não finalizados, não já agrupados
    const { rows: validacao } = await query(
      `SELECT id, status, tipo, delivery_group_id FROM pedidos WHERE id = ANY($1::int[])`,
      [ids]
    );
    if (validacao.length !== ids.length) {
      return res.status(400).json({ error: 'Algum pedido_id não existe.' });
    }
    const TERMINAL = ['entregue', 'cancelado', 'rejeitado'];
    for (const p of validacao) {
      if (p.tipo !== 'delivery') return res.status(400).json({ error: `Pedido #${p.id} não é delivery.` });
      if (TERMINAL.includes(p.status)) return res.status(409).json({ error: `Pedido #${p.id} já finalizado (${p.status}).` });
      if (p.delivery_group_id) return res.status(409).json({ error: `Pedido #${p.id} já está em outro grupo (${p.delivery_group_id}).` });
    }

    const { rows: created } = await query(
      `INSERT INTO delivery_groups (cor, nota, criado_por) VALUES ($1, $2, $3) RETURNING *`,
      [_proximaCor(), nota || null, req.user?.id || null]
    );
    const grupo = created[0];
    await query(
      `UPDATE pedidos SET delivery_group_id = $1 WHERE id = ANY($2::int[])`,
      [grupo.id, ids]
    );
    console.log(`[DeliveryGrouping] grupo criado group=${grupo.id} pedidos=[${ids.join(',')}] por user=${req.user?.id}`);
    res.json({ ok: true, grupo, pedido_ids: ids });
  } catch (e) {
    console.error('[DeliveryGrouping] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/delivery-groups/:id ─────────────────────────────────────
router.delete('/:id', requireAuth, requireRole(ADMIN_MANAGER_PDV), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  try {
    const { rows } = await query(`SELECT id FROM delivery_groups WHERE id = $1 AND desfeito_em IS NULL`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Grupo não encontrado ou já desfeito.' });

    await query(`UPDATE pedidos SET delivery_group_id = NULL WHERE delivery_group_id = $1`, [id]);
    await query(`UPDATE delivery_groups SET desfeito_em = NOW() WHERE id = $1`, [id]);
    console.log(`[DeliveryGrouping] grupo removido group=${id} por user=${req.user?.id}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
