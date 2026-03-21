const express = require('express');
const router = express.Router();
const { query, getClient } = require('../db/connection');

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
  const { cliente, telefone, endereco, forma_pagamento, troco_para, observacoes, itens, total, tipo } = req.body;

  if (!cliente || !itens || !itens.length) {
    return res.status(400).json({ error: 'Dados inválidos: cliente e itens são obrigatórios.' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    
    // Inserir pedido
    let val_troco = null;
    if (forma_pagamento === 'dinheiro' && troco_para && troco_para > total) {
      val_troco = troco_para - total;
    }

    const insertPedidoText = `
      INSERT INTO pedidos (cliente, telefone, endereco, forma_pagamento, observacoes, total, status, payment_status, payment_method, troco_para, valor_troco, tipo)
      VALUES ($1, $2, $3, $4, $5, $6, 'recebido', 'pendente', $4, $7, $8, $9)
      RETURNING *
    `;
    const finalTipo = tipo === 'balcao' ? 'balcao' : 'delivery';
    const { rows: pedidoRows } = await client.query(insertPedidoText, [cliente, telefone, endereco, forma_pagamento, observacoes, total, troco_para, val_troco, finalTipo]);
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
    }

    await client.query('COMMIT');
    
    console.log(`📦 Novo pedido #${pedidoId} de "${cliente}" — R$ ${total}`);
    
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
      GROUP BY p.id
      ORDER BY p.criado_em DESC
    `;
    const { rows } = await query(sql);
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar pedidos:', err.message);
    res.status(500).json({ error: 'Erro ao listar pedidos' });
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
  
  const statusValidos = ['recebido', 'em_preparo', 'pronto', 'em_entrega', 'entregue', 'cancelado'];
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
  
  if (!['pendente', 'pago', 'cancelado'].includes(payment_status)) {
    return res.status(400).json({ error: 'Status inválido. Use: pendente, pago, cancelado' });
  }

  try {
    const text = 'UPDATE pedidos SET payment_status = $1 WHERE id = $2 RETURNING *';
    const { rows } = await query(text, [payment_status, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
    
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar pagamento:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar pagamento' });
  }
});

module.exports = router;
