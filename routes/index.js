const express = require('express');
const router = express.Router();
const { query, getClient } = require('../db/connection');

// ─── Auto-migrate: zonas_entrega + pedidos columns ────────────────────────────
(async () => {
  try {
    await query(`CREATE TABLE IF NOT EXISTS zonas_entrega (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      descricao TEXT,
      taxa NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (taxa >= 0),
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`ALTER TABLE pedidos
      ADD COLUMN IF NOT EXISTS taxa_entrega    NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS zona_id         INTEGER REFERENCES zonas_entrega(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS zona_nome       VARCHAR(100),
      ADD COLUMN IF NOT EXISTS is_scheduled    BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS scheduled_for   TIMESTAMPTZ`);
    // Garante que todos os valores do fluxo existem no ENUM status_pedido
    await query(`DO $$ BEGIN
      ALTER TYPE status_pedido ADD VALUE IF NOT EXISTS 'cancelado';
    EXCEPTION WHEN others THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      ALTER TYPE status_pedido ADD VALUE IF NOT EXISTS 'pendente_aprovacao';
    EXCEPTION WHEN others THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      ALTER TYPE status_pedido ADD VALUE IF NOT EXISTS 'rejeitado';
    EXCEPTION WHEN others THEN NULL; END $$`);
    console.log('✅ zonas_entrega + pedidos: colunas verificadas.');
  } catch (e) {
    console.error('⚠️ Migration zonas/agendamento:', e.message);
  }
})();

// Healthcheck — GET /api/status
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Pitombo Lanches',
    timestamp: new Date().toISOString(),
  });
});

// Produtos reais — GET /api/produtos
router.get('/produtos', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM produtos WHERE disponivel = true ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar produtos:', err.message);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// Criar pedido — POST /api/pedidos
router.post('/pedidos', async (req, res) => {
  const { cliente, telefone, endereco, forma_pagamento, troco_para, observacoes, itens, total, tipo,
    taxa_entrega, zona_id, zona_nome, is_scheduled, scheduled_for } = req.body;

  if (!cliente || !itens || !itens.length) {
    return res.status(400).json({ error: 'Dados inválidos: cliente e itens são obrigatórios.' });
  }

  console.log("ITENS RECEBIDOS:", itens);

  const client = await getClient();
  try {
    // Validar integridade dos IDs de produtos antes de qualquer INSERT
    const productIds = itens.map(i => parseInt(i.id)).filter(id => !isNaN(id));
    if (productIds.length > 0) {
      const { rows: validProducts } = await client.query(
        'SELECT id FROM produtos WHERE id = ANY($1::int[])',
        [productIds]
      );

      const validIds = validProducts.map(p => p.id);
      const invalidIds = productIds.filter(id => !validIds.includes(id));

      if (invalidIds.length > 0) {
        return res.status(400).json({
          error: `IDs inválidos: ${invalidIds.join(', ')}. Por favor, recarregue a página e tente novamente.`
        });
      }
    }

    await client.query('BEGIN');

    let val_troco = null;
    if (forma_pagamento === 'dinheiro' && troco_para && troco_para > total) {
      val_troco = troco_para - total;
    }

    const taxaFinal = parseFloat(taxa_entrega) || 0;
    const isAgendado = !!is_scheduled;
    const agendadoPara = (isAgendado && scheduled_for) ? new Date(scheduled_for) : null;
    const insertPedidoText = `
      INSERT INTO pedidos (cliente, telefone, endereco, forma_pagamento, observacoes, total, status, payment_status, payment_method, troco_para, valor_troco, tipo, taxa_entrega, zona_id, zona_nome, is_scheduled, scheduled_for)
      VALUES ($1, $2, $3, $4, $5, $6, 'pendente_aprovacao', 'pendente', $4, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    const finalTipo = tipo === 'balcao' ? 'balcao' : (tipo === 'mesa' ? 'mesa' : 'delivery');
    const { rows: pedidoRows } = await client.query(insertPedidoText, [
      cliente, telefone, endereco, forma_pagamento, observacoes, total,
      troco_para, val_troco, finalTipo,
      taxaFinal, zona_id || null, zona_nome || null,
      isAgendado, agendadoPara
    ]);
    const pedidoId = pedidoRows[0].id;

    // Inserir itens
    const insertItemText = `
      INSERT INTO itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
      VALUES ($1, $2, $3, $4, $5)
    `;

    for (const item of itens) {
      await client.query(insertItemText, [
        pedidoId,
        item.id,
        item.nome,
        item.quantidade,
        item.preco
      ]);

      // Baixa no estoque
      await client.query(`
        UPDATE produtos 
        SET estoque_atual = GREATEST(estoque_atual - $1, 0) 
        WHERE id = $2 AND controlar_estoque = true
      `, [item.quantidade, item.id]);
    }

    await client.query('COMMIT');

    console.log(`📦 Novo pedido #${pedidoId} de "${cliente}" — R$ ${total} (taxa: R$ ${taxaFinal})`);

    res.status(201).json(pedidoRows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar pedido:', err.message);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  } finally {
    client.release();
  }
});

// Buscar um pedido específico — GET /api/pedidos/:id
router.get('/pedidos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID Inválido' });
    const sql = `
      SELECT p.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', i.id,
              'produto_id', i.produto_id,
              'nome_produto', i.nome_produto,
              'quantidade', i.quantidade,
              'preco_unitario', i.preco_unitario
            )
          ) FILTER (WHERE i.id IS NOT NULL), '[]'
        ) AS itens,
        (SELECT COUNT(*) FROM pedidos p2 WHERE p2.telefone = p.telefone AND p2.telefone IS NOT NULL AND length(trim(p2.telefone)) > 5) as cliente_pedidos_count,
        (SELECT AVG(total) FROM pedidos p3 WHERE p3.telefone = p.telefone AND p3.telefone IS NOT NULL AND length(trim(p3.telefone)) > 5) as cliente_ticket_medio
      FROM pedidos p
      LEFT JOIN itens_pedido i ON p.id = i.pedido_id
      WHERE p.id = $1
      GROUP BY p.id
    `;
    const { rows } = await query(sql, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao buscar pedido específico:', err.message);
    res.status(500).json({ error: 'Erro interno ao buscar pedido' });
  }
});

// Listar pedidos — GET /api/pedidos (usado pelo admin/cozinha)
router.get('/pedidos', async (req, res) => {
  try {
    const sql = `
      SELECT p.*,
        e.nome as entregador,
        COALESCE(
          json_agg(
            json_build_object(
              'id', i.id,
              'produto_id', i.produto_id,
              'nome_produto', i.nome_produto,
              'quantidade', i.quantidade,
              'preco_unitario', i.preco_unitario
            )
          ) FILTER (WHERE i.id IS NOT NULL), '[]'
        ) AS itens,
        (SELECT COUNT(*) FROM pedidos p2 WHERE p2.telefone = p.telefone AND p2.telefone IS NOT NULL AND length(trim(p2.telefone)) > 5) as cliente_pedidos_count,
        (SELECT AVG(total) FROM pedidos p3 WHERE p3.telefone = p.telefone AND p3.telefone IS NOT NULL AND length(trim(p3.telefone)) > 5) as cliente_ticket_medio
      FROM pedidos p
      LEFT JOIN itens_pedido i ON p.id = i.pedido_id
      LEFT JOIN equipe e ON p.entregador_id = e.id
      GROUP BY p.id, e.nome
      ORDER BY p.criado_em DESC
    `;
    const { rows } = await query(sql);
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar pedidos:', err.message);
    res.status(500).json({ error: 'Erro ao listar pedidos' });
  }
});

// Atualizar entregador — PATCH /api/pedidos/:id/entregador
router.patch('/pedidos/:id/entregador', async (req, res) => {
  const id = Number(req.params.id);
  const { entregador_id } = req.body;
  try {
    const { rows } = await query('UPDATE pedidos SET entregador_id = $1 WHERE id = $2 RETURNING *', [entregador_id || null, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar entregador:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar entregador' });
  }
});

// Buscar historico do cliente — GET /api/clientes/:telefone/ultimo
router.get('/clientes/:telefone/ultimo', async (req, res) => {
  try {
    const tel = req.params.telefone.replace(/\D/g, '');
    if (!tel || tel.length < 8) return res.status(400).json({ error: 'Telefone Inválido' });

    // Pega o ultimo pedido do cliente usando LIKE %telefone%
    const sql = `
      SELECT p.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', i.id,
              'produto_id', i.produto_id,
              'nome_produto', i.nome_produto,
              'quantidade', i.quantidade,
              'preco_unitario', i.preco_unitario
            )
          ) FILTER (WHERE i.id IS NOT NULL), '[]'
        ) AS itens
      FROM pedidos p
      LEFT JOIN itens_pedido i ON p.id = i.pedido_id
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(p.telefone, '-', ''), ' ', ''), '(', ''), ')', '') LIKE $1
      GROUP BY p.id
      ORDER BY p.criado_em DESC
      LIMIT 1
    `;
    const { rows } = await query(sql, [`%${tel}%`]);
    if (rows.length === 0) return res.status(404).json({ error: 'Nenhum pedido anterior encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao buscar histórico cliente:', err.message);
    res.status(500).json({ error: 'Erro interno ao buscar dados do cliente' });
  }
});

// Atualizar status — PATCH /api/pedidos/:id/status (usado pelo admin/cozinha/entregador)
router.patch('/pedidos/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const { status, origem } = req.body;

  const statusValidos = ['recebido', 'pendente_aprovacao', 'em_preparo', 'pronto', 'em_entrega', 'entregue', 'cancelado', 'rejeitado'];
  if (!statusValidos.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Use: ${statusValidos.join(', ')}` });
  }

  // Regras de Segurança Operacional
  if (origem === 'cozinha' && !['em_preparo', 'pronto'].includes(status)) {
    return res.status(403).json({ error: 'Acesso negado: Cozinha apenas prepara e finaliza.' });
  }
  if (origem === 'entregador' && !['em_entrega', 'entregue'].includes(status)) {
    return res.status(403).json({ error: 'Acesso negado: Entregador apenas despacha e entrega.' });
  }

  try {
    // Buscar status atual antes de atualizar para bloquear transições inválidas.
    // Impede que um clique residual em botão stale ressuscite um pedido já finalizado.
    const { rows: atual } = await query('SELECT status FROM pedidos WHERE id = $1', [id]);
    if (atual.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const TERMINAL = ['entregue', 'cancelado', 'rejeitado'];
    if (TERMINAL.includes(atual[0].status)) {
      return res.status(409).json({
        error: `Pedido já finalizado com status "${atual[0].status}". Nenhuma alteração permitida.`
      });
    }

    const text = 'UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING *';
    const { rows } = await query(text, [status, id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar status do pedido:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar status do pedido' });
  }
});

// Atualizar pagamento — PATCH /api/pedidos/:id/pagamento
router.patch('/pedidos/:id/pagamento', async (req, res) => {
  const id = Number(req.params.id);
  const { payment_status } = req.body;

  if (!['pendente', 'pago', 'cancelado', 'nao_pago'].includes(payment_status)) {
    return res.status(400).json({ error: 'Status inválido. Use: pendente, pago, cancelado, nao_pago' });
  }

  try {
    // Ao finalizar pagamento (pago ou nao_pago), encerra o pedido (status = entregue) se ainda não estiver em estado terminal
    let text;
    if (payment_status === 'pago' || payment_status === 'nao_pago') {
      text = `UPDATE pedidos SET payment_status = $1,
              status = CASE WHEN status IN ('cancelado','rejeitado','entregue') THEN status ELSE 'entregue' END
              WHERE id = $2 RETURNING *`;
    } else {
      text = 'UPDATE pedidos SET payment_status = $1 WHERE id = $2 RETURNING *';
    }
    const { rows } = await query(text, [payment_status, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar pagamento:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar pagamento' });
  }
});

// Atualizar estoque do produto — PATCH /api/produtos/:id/estoque
router.patch('/produtos/:id/estoque', async (req, res) => {
  const id = Number(req.params.id);
  const { controlar_estoque, estoque_atual } = req.body;

  try {
    const text = 'UPDATE produtos SET controlar_estoque = $1, estoque_atual = $2 WHERE id = $3 RETURNING *';
    const { rows } = await query(text, [Boolean(controlar_estoque), Number(estoque_atual) || 0, id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado.' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar estoque:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar estoque' });
  }
});

// ─── ZONAS DE ENTREGA ─────────────────────────────────────────────────────────

// GET /api/zonas — listar todas
router.get('/zonas', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM zonas_entrega ORDER BY nome ASC');
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar zonas:', err.message);
    res.status(500).json({ error: 'Erro ao listar zonas de entrega' });
  }
});

// GET /api/zonas/ativas — listar zonas ativas (usa o checkout)
router.get('/zonas/ativas', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM zonas_entrega WHERE ativo = true ORDER BY nome ASC');
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar zonas ativas:', err.message);
    res.status(500).json({ error: 'Erro ao listar zonas ativas' });
  }
});

// POST /api/zonas — criar
router.post('/zonas', async (req, res) => {
  const { nome, descricao, taxa, ativo } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome da zona é obrigatório.' });
  try {
    const { rows } = await query(
      'INSERT INTO zonas_entrega (nome, descricao, taxa, ativo) VALUES ($1, $2, $3, $4) RETURNING *',
      [nome.trim(), descricao || '', parseFloat(taxa) || 0, ativo !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao criar zona:', err.message);
    res.status(500).json({ error: 'Erro ao criar zona de entrega' });
  }
});

// PUT /api/zonas/:id — atualizar
router.put('/zonas/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nome, descricao, taxa, ativo } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome da zona é obrigatório.' });
  try {
    const { rows } = await query(
      'UPDATE zonas_entrega SET nome=$1, descricao=$2, taxa=$3, ativo=$4 WHERE id=$5 RETURNING *',
      [nome.trim(), descricao || '', parseFloat(taxa) || 0, ativo !== false, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Zona não encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar zona:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar zona de entrega' });
  }
});

// DELETE /api/zonas/:id — excluir
router.delete('/zonas/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    // Desreferencia pedidos antes de deletar
    await query('UPDATE pedidos SET zona_id = NULL WHERE zona_id = $1', [id]);
    const { rows } = await query('DELETE FROM zonas_entrega WHERE id=$1 RETURNING *', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Zona não encontrada.' });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir zona:', err.message);
    res.status(500).json({ error: 'Erro ao excluir zona de entrega' });
  }
});

module.exports = router;
