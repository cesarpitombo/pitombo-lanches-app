/**
 * services/printDispatcher.js
 * Converte eventos do ciclo de vida do pedido em print_jobs.
 *
 * enqueuePrintJobsForOrder(pedido, evento)
 *   evento ∈ ['criado','recebido','em_preparo','pronto','em_entrega','entregue','cancelado','rejeitado','pendente_aprovacao','aceito','finalizado']
 *
 * Lê store_settings.print_rules (JSONB) no formato:
 * {
 *   "<evento>": { "setores": [<setor_id>, ...], "ativo": true }
 * }
 * Fallback: se print_rules vazio, aplica regras default:
 *   - pedido "criado" → setor Cozinha + setor Cliente
 *   - pedido "pronto" → setor Expedição
 */
const { query } = require('../db/connection');
const { publishToDevice } = require('./printTransport');

const DEFAULT_RULES = {
  criado:   { setores: ['Cozinha', 'Cliente'], ativo: true },
  aceito:   { setores: ['Cozinha'], ativo: false },
  pronto:   { setores: ['Expedição'], ativo: false },
};

async function _resolveSetoresByNome(lojaId, nomes) {
  if (!nomes?.length) return [];
  const { rows } = await query(
    `SELECT id, nome FROM setores WHERE loja_id = $1 AND nome = ANY($2::text[])`,
    [lojaId, nomes]
  );
  return rows.map(r => r.id);
}

async function _loadRules(lojaId) {
  try {
    const { rows } = await query(
      `SELECT print_rules FROM store_settings WHERE id = $1 LIMIT 1`,
      [lojaId]
    );
    const rules = rows[0]?.print_rules;
    if (rules && typeof rules === 'object' && Object.keys(rules).length) return rules;
  } catch (_) { /* store_settings pode não ter coluna ainda */ }
  return null;
}

async function enqueuePrintJobsForOrder(pedido, evento) {
  try {
    if (!pedido || !evento) return { enqueued: 0 };
    const lojaId = pedido.loja_id || 1;

    const rules = await _loadRules(lojaId);
    let setorIds = [];

    if (rules && rules[evento]?.ativo && Array.isArray(rules[evento].setores)) {
      // rules persistidas usam IDs
      setorIds = rules[evento].setores.map(Number).filter(Boolean);
    } else if (DEFAULT_RULES[evento]?.ativo) {
      setorIds = await _resolveSetoresByNome(lojaId, DEFAULT_RULES[evento].setores);
    }

    if (!setorIds.length) return { enqueued: 0 };

    // Para cada setor, encontra impressoras vinculadas
    const { rows: vinculos } = await query(
      `SELECT ips.impressora_id, ips.setor_id, ips.copias, i.ativa
         FROM impressora_setores ips
         JOIN impressoras i ON i.id = ips.impressora_id
        WHERE ips.setor_id = ANY($1::int[]) AND i.ativa = TRUE`,
      [setorIds]
    );

    if (!vinculos.length) {
      console.warn(`[PrintDispatcher] evento=${evento} pedido=${pedido.id} — sem impressoras vinculadas aos setores [${setorIds.join(',')}].`);
      return { enqueued: 0 };
    }

    const payload = {
      pedido_id: pedido.id,
      cliente: pedido.cliente_nome || pedido.cliente || null,
      telefone: pedido.telefone || null,
      total: pedido.total,
      itens: pedido.itens || [],
      endereco: pedido.endereco || null,
      tipo: pedido.tipo || null,
      observacoes: pedido.observacoes || null,
      criado_em: pedido.criado_em || new Date().toISOString(),
    };

    let inserted = 0;
    for (const v of vinculos) {
      const copias = Math.max(1, v.copias || 1);
      for (let c = 0; c < copias; c++) {
        // Resolve device dono da impressora (via device.setores_vinculados)
        const { rows: devs } = await query(
          `SELECT id FROM devices
            WHERE loja_id = $1 AND ativo = TRUE AND $2 = ANY(setores_vinculados)
            ORDER BY id LIMIT 1`,
          [lojaId, v.setor_id]
        );
        const deviceId = devs[0]?.id || null;

        const { rows: jobRows } = await query(
          `INSERT INTO print_jobs (loja_id, pedido_id, impressora_id, setor_id, device_id, evento, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id`,
          [lojaId, pedido.id, v.impressora_id, v.setor_id, deviceId, evento, JSON.stringify(payload)]
        );
        inserted++;

        if (deviceId) {
          publishToDevice(deviceId, 'job.new', { job_id: jobRows[0].id });
        }
      }
    }

    console.log(`[PrintDispatcher] evento=${evento} pedido=${pedido.id} → ${inserted} job(s) enfileirado(s).`);
    return { enqueued: inserted };
  } catch (e) {
    console.error('[PrintDispatcher] erro:', e.message);
    return { enqueued: 0, error: e.message };
  }
}

module.exports = { enqueuePrintJobsForOrder };
