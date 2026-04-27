const express = require('express');
const router = express.Router();
const { query, getClient } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN_MANAGER = ['Admin', 'Manager'];

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
    await query(`DO $$ BEGIN
      ALTER TYPE status_pedido ADD VALUE IF NOT EXISTS 'chegou';
    EXCEPTION WHEN others THEN NULL; END $$`);
    // Colunas para pagamento rico + soft-delete
    await query(`ALTER TABLE pedidos
      ADD COLUMN IF NOT EXISTS valor_pago        NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS gorjeta            NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS quantia_entregue   NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS excluido           BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS excluido_em        TIMESTAMPTZ`);
    // Ticket config na store_settings
    await query(`ALTER TABLE store_settings
      ADD COLUMN IF NOT EXISTS ticket_cozinha_config JSONB DEFAULT '{"logotipo":true,"nome_empresa":true,"endereco_negocio":true,"texto_cabecalho":true,"tipo_pedido_datas":true,"nome_cliente":true,"produtos":true,"texto_rodape":true,"maiusculas":false}'::jsonb,
      ADD COLUMN IF NOT EXISTS ticket_cliente_config JSONB DEFAULT '{"logotipo":true,"nome_empresa":true,"endereco_negocio":true,"texto_cabecalho":true,"tipo_pedido_datas":true,"numero_pedido":true,"nome_cliente":true,"telefone_endereco":true,"produtos":true,"precos_resumo":true,"estado_pagamento":true,"qr_menu":true,"texto_rodape":true,"maiusculas":false}'::jsonb`);

    // Delivery grouping (agrupamento por proximidade)
    await query(`CREATE TABLE IF NOT EXISTS delivery_groups (
      id          SERIAL PRIMARY KEY,
      cor         VARCHAR(20) DEFAULT '#3b82f6',
      nota        TEXT,
      criado_por  INTEGER,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      desfeito_em TIMESTAMPTZ
    )`);
    await query(`ALTER TABLE pedidos
      ADD COLUMN IF NOT EXISTS delivery_group_id INTEGER REFERENCES delivery_groups(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS latitude          NUMERIC(10,7),
      ADD COLUMN IF NOT EXISTS longitude         NUMERIC(10,7)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pedidos_delivery_group ON pedidos(delivery_group_id)`);

    // Migration: pedidos.entregador_id deve referenciar equipe(id) (não entregadores).
    // (UI sempre usou /api/equipe filtrado por funcao=Entregador; FK antigo para entregadores
    // gerava violação ao salvar e mostrava "erro de conexão" no painel lateral)
    try {
      // 1) Drop qualquer FK antigo apontando para entregadores
      const { rows: fkOld } = await query(`
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'pedidos'::regclass
           AND contype  = 'f'
           AND pg_get_constraintdef(oid) ILIKE '%entregador_id%REFERENCES entregadores%'
      `);
      for (const r of fkOld) {
        await query(`ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS "${r.conname}"`);
        console.log(`[migration] FK antigo removido: ${r.conname}`);
      }
      // 2) Verifica se já existe FK para equipe
      const { rows: fkNew } = await query(`
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'pedidos'::regclass
           AND contype  = 'f'
           AND pg_get_constraintdef(oid) ILIKE '%entregador_id%REFERENCES equipe%'
      `);
      if (!fkNew.length) {
        // Aguarda equipe existir (criada por routes/equipe.js no boot)
        const { rows: eqExists } = await query(`SELECT to_regclass('public.equipe') AS r`);
        if (eqExists[0]?.r) {
          await query(`
            UPDATE pedidos SET entregador_id = NULL
             WHERE entregador_id IS NOT NULL
               AND entregador_id NOT IN (SELECT id FROM equipe)
          `);
          await query(`
            ALTER TABLE pedidos
              ADD CONSTRAINT pedidos_entregador_equipe_fk
              FOREIGN KEY (entregador_id) REFERENCES equipe(id) ON DELETE SET NULL
          `);
          console.log('[migration] FK pedidos.entregador_id agora referencia equipe(id)');
        } else {
          console.log('[migration] equipe ainda não existe — FK será criado no próximo boot');
        }
      }
    } catch (e) {
      console.warn('[migration] entregador FK migration:', e.message);
    }

    console.log('✅ zonas_entrega + pedidos + tickets + delivery_groups + entregador FK: colunas verificadas.');
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
  const { cliente, telefone, endereco, forma_pagamento, troco_para, observacoes, itens, tipo,
    zona_id, zona_nome, is_scheduled, scheduled_for,
    delivery_lat, delivery_lng, delivery_neighborhood } = req.body;

  if (!cliente || !itens || !itens.length) {
    return res.status(400).json({ error: 'Dados inválidos: cliente e itens são obrigatórios.' });
  }

  // ── Recalcula a taxa de entrega no servidor (não confia no cliente) ─────
  // Para tipos que não são delivery, taxa = 0.
  let serverTaxa = 0;
  let serverQuote = null;
  if (tipo === 'delivery') {
    try {
      const { quoteDelivery } = require('./delivery');
      serverQuote = await quoteDelivery({
        address: endereco,
        lat: delivery_lat,
        lng: delivery_lng,
        neighborhood: delivery_neighborhood
      });
      if (!serverQuote.in_coverage) {
        // Permite somente se admin configurou accept_outside_coverage E o quote já refletiu isso
        return res.status(400).json({
          error: serverQuote.label || 'Endereço fora da área de entrega.',
          delivery: serverQuote
        });
      }
      serverTaxa = parseFloat(serverQuote.fee) || 0;
    } catch (qErr) {
      console.error('[PEDIDO] Erro ao calcular taxa server-side:', qErr.message);
      return res.status(400).json({ error: 'Não foi possível calcular a taxa de entrega.' });
    }
  }

  // ── Guard: bloquear pedidos quando loja está fechada ────────────────────
  try {
    const { rows: cfgRows } = await query('SELECT status_loja FROM store_settings WHERE id = 1');
    const statusLoja = cfgRows[0]?.status_loja || 'aberta';
    if (statusLoja === 'fechada') {
      return res.status(403).json({ error: 'A loja está fechada no momento. Tente mais tarde.' });
    }
  } catch (cfgErr) {
    console.error('[PEDIDO] Erro ao verificar status da loja:', cfgErr.message);
    // Fail-open: se não conseguir ler, não bloquear o pedido
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

    const finalTipo = tipo === 'balcao' ? 'balcao' : (tipo === 'mesa' ? 'mesa' : 'delivery');
    // Para delivery usa SEMPRE o valor calculado server-side. Outros tipos: taxa=0.
    const taxaFinal = finalTipo === 'delivery' ? serverTaxa : 0;
    // Total recalculado: soma dos itens + taxa servidor
    const subtotalItens = itens.reduce((acc, it) => acc + (parseFloat(it.preco) || 0) * (parseInt(it.quantidade, 10) || 0), 0);
    const totalReal = Math.round((subtotalItens + taxaFinal) * 100) / 100;

    let val_troco = null;
    if (forma_pagamento === 'dinheiro' && troco_para && troco_para > totalReal) {
      val_troco = troco_para - totalReal;
    }
    const isAgendado = !!is_scheduled;
    const agendadoPara = (isAgendado && scheduled_for) ? new Date(scheduled_for) : null;
    const insertPedidoText = `
      INSERT INTO pedidos (cliente, telefone, endereco, forma_pagamento, observacoes, total, status, payment_status, payment_method, troco_para, valor_troco, tipo, taxa_entrega, zona_id, zona_nome, is_scheduled, scheduled_for)
      VALUES ($1, $2, $3, $4, $5, $6, 'pendente_aprovacao', 'pendente', $4, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    const { rows: pedidoRows } = await client.query(insertPedidoText, [
      cliente, telefone, endereco, forma_pagamento, observacoes, totalReal,
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

    console.log(`📦 Novo pedido #${pedidoId} de "${cliente}" — R$ ${totalReal} (taxa: R$ ${taxaFinal})`);

    res.status(201).json(pedidoRows[0]);

    // Notificar cliente via WhatsApp sobre novo pedido (assíncrono)
    try {
      const { notificarNovoPedido } = require('../services/whatsappBot');
      notificarNovoPedido(pedidoRows[0]).catch(err =>
        console.error('[WhatsApp] Erro ao notificar novo pedido:', err.message)
      );
    } catch (_) {}

    // Enfileirar jobs de impressão (cliente + cozinha conforme regras)
    try {
      const { enqueuePrintJobsForOrder } = require('../services/printDispatcher');
      enqueuePrintJobsForOrder(pedidoRows[0], 'criado').catch(err =>
        console.error('[PrintDispatcher] Erro ao enfileirar (novo pedido):', err.message)
      );
    } catch (_) {}
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar pedido:', err.message);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  } finally {
    client.release();
  }
});

// Buscar um pedido específico — GET /api/pedidos/:id (público: clientes acompanham pelo ID)
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
router.get('/pedidos', requireAuth, async (req, res) => {
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
      WHERE (p.excluido IS NULL OR p.excluido = FALSE)
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
// entregador_id deve referenciar equipe.id (funcao='Entregador', ativo=true). null = remover.
router.patch('/pedidos/:id/entregador', requireAuth, async (req, res) => {
  const pedidoId = Number(req.params.id);
  const entregadorId = req.body?.entregador_id ? Number(req.body.entregador_id) : null;
  console.log(`[Entregador] salvar atribuicao pedido=${pedidoId} entregador=${entregadorId} user=${req.user?.id}`);

  if (!pedidoId) return res.status(400).json({ error: 'pedido id inválido' });

  try {
    if (entregadorId !== null) {
      const { rows: ent } = await query(
        `SELECT id, nome, funcao, ativo FROM equipe WHERE id = $1`,
        [entregadorId]
      );
      if (!ent.length) {
        console.warn(`[Entregador] erro pedido=${pedidoId} motivo=entregador_inexistente id=${entregadorId}`);
        return res.status(400).json({ error: 'Entregador não encontrado na equipe.' });
      }
      if (ent[0].funcao !== 'Entregador' || !ent[0].ativo) {
        console.warn(`[Entregador] erro pedido=${pedidoId} motivo=funcao_ou_ativo funcao=${ent[0].funcao} ativo=${ent[0].ativo}`);
        return res.status(400).json({ error: 'Membro da equipe não é entregador ativo.' });
      }
    }

    const { rows } = await query(
      `UPDATE pedidos SET entregador_id = $1 WHERE id = $2 RETURNING *`,
      [entregadorId, pedidoId]
    );
    if (!rows.length) {
      console.warn(`[Entregador] erro pedido=${pedidoId} motivo=pedido_inexistente`);
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    console.log(`[Entregador] ${entregadorId ? 'OK' : 'removido'} pedido=${pedidoId} entregador=${entregadorId}`);
    res.json(rows[0]);
  } catch (err) {
    console.error(`[Entregador] erro pedido=${pedidoId} motivo=${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Buscar historico do cliente — GET /api/clientes/:telefone/ultimo
router.get('/clientes/:telefone/ultimo', requireAuth, async (req, res) => {
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
router.patch('/pedidos/:id/status', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;

  // Origem da transição: o frontend envia explicitamente (cozinha/entregador/admin),
  // mas se faltar caímos no role do JWT — não confiamos só no body, pois cozinheiro
  // logado nunca pode mascarar como admin para forçar envio de WhatsApp.
  const FUNCAO_TO_ORIGEM = {
    Cozinheiro: 'cozinha',
    Entregador: 'entregador',
    Admin:      'admin',
    Manager:    'admin',
    'Garçom':   'pdv',
  };
  const origemRole = FUNCAO_TO_ORIGEM[req.user?.funcao] || 'sistema';
  // Se o role do usuário força "cozinha" ou "entregador", body não pode override.
  const origem = (origemRole === 'cozinha' || origemRole === 'entregador')
    ? origemRole
    : String(req.body?.origem || origemRole).toLowerCase();

  const statusValidos = ['recebido', 'pendente_aprovacao', 'em_preparo', 'pronto', 'em_entrega', 'chegou', 'entregue', 'cancelado', 'rejeitado'];
  if (!statusValidos.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Use: ${statusValidos.join(', ')}` });
  }

  // Regras de acesso por função (baseadas no JWT, não em parâmetro manipulável)
  const STATUS_POR_FUNCAO = {
    'Admin':      null,  // null = sem restrição
    'Manager':    null,
    'Garçom':     null,  // Garçom gere o PDV, pode alterar qualquer status
    'Cozinheiro': ['em_preparo', 'pronto'],
    'Entregador': ['em_entrega', 'entregue'],
  };
  const permitidos = STATUS_POR_FUNCAO[req.user.funcao];
  if (permitidos !== null && !permitidos.includes(status)) {
    return res.status(403).json({
      error: `Função "${req.user.funcao}" não pode definir o status "${status}".`
    });
  }

  try {
    // Buscar status atual antes de atualizar para bloquear transições inválidas.
    const { rows: atual } = await query('SELECT status, tipo, notificacoes_historico FROM pedidos WHERE id = $1', [id]);
    if (atual.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const pedidoA = atual[0];
    const currStatus = pedidoA.status;

    // Se usuário tentar sobrepor com o MÊS MO status (double click)
    if (currStatus === status) {
      console.log(`[StatusFlow] pedido #${id} bloqueado: status "${status}" já aplicado`);
      return res.json({ ...pedidoA, _status_blocked: 'same_status' });
    }

    // Máquina de estados explícita
    const allowedTransitions = {
      'recebido': ['pendente_aprovacao', 'em_preparo', 'pronto', 'cancelado', 'rejeitado'],
      'pendente_aprovacao': ['em_preparo', 'pronto', 'cancelado', 'rejeitado'],
      'em_preparo': ['pronto', 'cancelado'],
      'pronto': ['em_entrega', 'entregue', 'cancelado'],
      'em_entrega': ['chegou', 'entregue', 'cancelado'],
      'chegou': ['entregue', 'cancelado'],
      'entregue': [],
      'cancelado': [],
      'rejeitado': []
    };

    if (!allowedTransitions[currStatus]?.includes(status)) {
       console.warn(`[StatusFlow] pedido #${id} bloqueado: transição inválida de "${currStatus}" para "${status}"`);
       return res.status(400).json({ error: `Transição inválida de "${currStatus}" para "${status}".` });
    }

    // GUARD POR TIPO: somente pedidos delivery podem ir para "chegou"
    if (status === 'chegou' && pedidoA.tipo !== 'delivery') {
      return res.status(403).json({
        error: `Pedido do tipo "${pedidoA.tipo}" não pode ir para "chegou". Apenas pedidos delivery seguem esse fluxo.`
      });
    }

    // GUARD POR TIPO: somente pedidos delivery podem ir para "em_entrega"
    if (status === 'em_entrega' && pedidoA.tipo !== 'delivery') {
      console.warn(`[TIPO-GUARD] Pedido #${id} é do tipo "${pedidoA.tipo}" — bloquear transicão para em_entrega`);
      return res.status(403).json({
        error: `Pedido do tipo "${pedidoA.tipo}" não pode ir para "em_entrega". Apenas pedidos delivery seguem esse fluxo.`
      });
    }

    console.log(`[StatusFlow] pedido #${id} transição válida: ${currStatus} -> ${status}`);

    const text = 'UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING *';
    const { rows } = await query(text, [status, id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    res.json(rows[0]);

    // Notificar cliente via WhatsApp (assíncrono, não bloqueia a resposta)
    try {
      const { notificarStatusPedido } = require('../services/whatsappBot');
      notificarStatusPedido(rows[0], status, origem).catch(err =>
        console.error('[WhatsApp] Erro ao notificar status:', err.message)
      );
    } catch (importErr) {
      console.error('[WhatsApp] Falha ao importar whatsappBot:', importErr.message);
    }

    // Enfileirar jobs de impressão conforme regras por evento
    try {
      const { enqueuePrintJobsForOrder } = require('../services/printDispatcher');
      enqueuePrintJobsForOrder(rows[0], status).catch(err =>
        console.error('[PrintDispatcher] Erro ao enfileirar (status):', err.message)
      );
    } catch (_) {}

  } catch (err) {
    console.error('Erro ao atualizar status do pedido:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar status do pedido' });

  }
});

// Atualizar pagamento — PATCH /api/pedidos/:id/pagamento (versão rica estilo OlaClick)
router.patch('/pedidos/:id/pagamento', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  const { payment_status, payment_method, valor_pago, gorjeta, quantia_entregue, finalizar_pedido } = req.body;

  // Retrocompatibilidade: aceita tanto o fluxo antigo (só payment_status) quanto o novo (valores ricos)
  const validStatuses = ['pendente', 'pago', 'cancelado', 'nao_pago', 'parcial'];
  if (payment_status && !validStatuses.includes(payment_status)) {
    return res.status(400).json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` });
  }

  try {
    // Buscar dados atuais do pedido
    const { rows: atual } = await query('SELECT * FROM pedidos WHERE id = $1', [id]);
    if (!atual.length) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const pedido = atual[0];

    // Calcular valores
    const novoValorPago = valor_pago !== undefined ? parseFloat(valor_pago) : (parseFloat(pedido.valor_pago) || 0);
    const novaGorjeta = gorjeta !== undefined ? parseFloat(gorjeta) : (parseFloat(pedido.gorjeta) || 0);
    const novaQuantiaEntregue = quantia_entregue !== undefined ? parseFloat(quantia_entregue) : (parseFloat(pedido.quantia_entregue) || 0);
    const novoMetodo = payment_method || pedido.payment_method || 'dinheiro';

    // Determinar payment_status automaticamente
    const totalPedido = parseFloat(pedido.total) || 0;
    let finalPayStatus = payment_status;
    if (!finalPayStatus) {
      if (novoValorPago >= totalPedido) finalPayStatus = 'pago';
      else if (novoValorPago > 0) finalPayStatus = 'parcial';
      else finalPayStatus = 'pendente';
    }

    // Calcular troco
    const troco = novaQuantiaEntregue > (novoValorPago + novaGorjeta)
      ? novaQuantiaEntregue - novoValorPago - novaGorjeta
      : 0;

    // Montar UPDATE
    let statusClause = '';
    if (finalizar_pedido || ((finalPayStatus === 'pago' || finalPayStatus === 'nao_pago') && !payment_status)) {
      statusClause = `, status = CASE WHEN status IN ('cancelado','rejeitado','entregue') THEN status ELSE 'entregue' END`;
    }
    if (finalizar_pedido) {
      statusClause = `, status = CASE WHEN status IN ('cancelado','rejeitado','entregue') THEN status ELSE 'entregue' END`;
    }

    const text = `UPDATE pedidos SET
      payment_status = $1,
      payment_method = $2,
      valor_pago = $3,
      gorjeta = $4,
      quantia_entregue = $5,
      valor_troco = $6
      ${statusClause}
      WHERE id = $7 RETURNING *`;
    const { rows } = await query(text, [
      finalPayStatus, novoMetodo, novoValorPago, novaGorjeta, novaQuantiaEntregue, troco, id
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado.' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar pagamento:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar pagamento' });
  }
});

// Cancelar pedido — PATCH /api/pedidos/:id/cancelar
router.patch('/pedidos/:id/cancelar', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows: atual } = await query('SELECT status FROM pedidos WHERE id = $1', [id]);
    if (!atual.length) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (['cancelado', 'rejeitado'].includes(atual[0].status)) {
      return res.status(409).json({ error: 'Pedido já está cancelado/rejeitado.' });
    }
    const { rows } = await query(
      `UPDATE pedidos SET status = 'cancelado' WHERE id = $1 RETURNING *`, [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao cancelar pedido:', err.message);
    res.status(500).json({ error: 'Erro ao cancelar pedido' });
  }
});

// Soft-delete pedido — DELETE /api/pedidos/:id
router.delete('/pedidos/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE pedidos SET excluido = TRUE, excluido_em = NOW() WHERE id = $1 RETURNING id, excluido`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado.' });
    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    console.error('Erro ao excluir pedido:', err.message);
    res.status(500).json({ error: 'Erro ao excluir pedido' });
  }
});

// Impressão manual — POST /api/pedidos/:id/imprimir
router.post('/pedidos/:id/imprimir', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { tipo_ticket } = req.body; // 'cozinha' | 'cliente'
  if (!['cozinha', 'cliente'].includes(tipo_ticket)) {
    return res.status(400).json({ error: 'tipo_ticket deve ser "cozinha" ou "cliente"' });
  }
  try {
    // Buscar pedido completo
    const { rows: pedidoRows } = await query(`
      SELECT p.*, COALESCE(
        json_agg(json_build_object(
          'id', i.id, 'produto_id', i.produto_id,
          'nome_produto', i.nome_produto, 'quantidade', i.quantidade,
          'preco_unitario', i.preco_unitario
        )) FILTER (WHERE i.id IS NOT NULL), '[]'
      ) AS itens
      FROM pedidos p LEFT JOIN itens_pedido i ON p.id = i.pedido_id
      WHERE p.id = $1 GROUP BY p.id
    `, [id]);
    if (!pedidoRows.length) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const pedido = pedidoRows[0];

    // Determinar setor alvo baseado no tipo de ticket
    const lojaId = pedido.loja_id || 1;
    const setorTipo = tipo_ticket === 'cozinha' ? 'cozinha' : 'cliente';
    const { rows: setores } = await query(
      `SELECT id FROM setores WHERE loja_id = $1 AND (tipo = $2 OR LOWER(nome) LIKE $3) LIMIT 5`,
      [lojaId, setorTipo, `%${setorTipo}%`]
    );

    if (!setores.length) {
      return res.status(404).json({ error: `Nenhum setor do tipo "${setorTipo}" encontrado. Crie um setor primeiro.` });
    }

    const setorIds = setores.map(s => s.id);
    // Buscar impressoras vinculadas aos setores
    const { rows: vinculos } = await query(
      `SELECT ips.impressora_id, ips.setor_id, ips.copias, i.ativa
         FROM impressora_setores ips
         JOIN impressoras i ON i.id = ips.impressora_id
        WHERE ips.setor_id = ANY($1::int[]) AND i.ativa = TRUE`,
      [setorIds]
    );

    if (!vinculos.length) {
      return res.status(404).json({ error: `Nenhuma impressora ativa vinculada ao setor "${setorTipo}".` });
    }

    const { publishToDevice } = require('../services/printTransport');
    const payload = {
      pedido_id: pedido.id,
      cliente: pedido.cliente,
      telefone: pedido.telefone || null,
      total: pedido.total,
      itens: pedido.itens || [],
      endereco: pedido.endereco || null,
      tipo: pedido.tipo || null,
      observacoes: pedido.observacoes || null,
      criado_em: pedido.criado_em,
      tipo_ticket: tipo_ticket,
    };

    let inserted = 0;
    for (const v of vinculos) {
      const copias = Math.max(1, v.copias || 1);
      for (let c = 0; c < copias; c++) {
        const { rows: devs } = await query(
          `SELECT id FROM devices WHERE loja_id = $1 AND ativo = TRUE AND $2 = ANY(setores_vinculados) ORDER BY id LIMIT 1`,
          [lojaId, v.setor_id]
        );
        const deviceId = devs[0]?.id || null;
        const { rows: jobRows } = await query(
          `INSERT INTO print_jobs (loja_id, pedido_id, impressora_id, setor_id, device_id, evento, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id`,
          [lojaId, pedido.id, v.impressora_id, v.setor_id, deviceId, `manual_${tipo_ticket}`, JSON.stringify(payload)]
        );
        inserted++;
        if (deviceId) publishToDevice(deviceId, 'job.new', { job_id: jobRows[0].id });
      }
    }

    console.log(`[PrintManual] tipo=${tipo_ticket} pedido=#${id} → ${inserted} job(s)`);
    res.json({ success: true, jobs_enqueued: inserted });
  } catch (err) {
    console.error('Erro na impressão manual:', err.message);
    res.status(500).json({ error: 'Erro ao enfileirar impressão manual' });
  }
});

// GET /api/settings/tickets — ticket config
router.get('/settings/tickets', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT ticket_cozinha_config, ticket_cliente_config FROM store_settings WHERE id = 1');
    if (!rows.length) return res.json({ ticket_cozinha_config: {}, ticket_cliente_config: {} });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar config de tickets' });
  }
});

// POST /api/settings/tickets — salvar ticket config
router.post('/settings/tickets', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { ticket_cozinha_config, ticket_cliente_config } = req.body;
  try {
    const sets = [];
    const vals = [];
    let idx = 1;
    if (ticket_cozinha_config) {
      sets.push(`ticket_cozinha_config = $${idx++}::jsonb`);
      vals.push(JSON.stringify(ticket_cozinha_config));
    }
    if (ticket_cliente_config) {
      sets.push(`ticket_cliente_config = $${idx++}::jsonb`);
      vals.push(JSON.stringify(ticket_cliente_config));
    }
    if (!sets.length) return res.status(400).json({ error: 'Nenhum campo para salvar.' });
    vals.push(1);
    const { rows } = await query(
      `UPDATE store_settings SET ${sets.join(', ')} WHERE id = $${idx} RETURNING ticket_cozinha_config, ticket_cliente_config`,
      vals
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao salvar config de tickets:', err.message);
    res.status(500).json({ error: 'Erro ao salvar config de tickets' });
  }
});

// Atualizar estoque do produto — PATCH /api/produtos/:id/estoque
router.patch('/produtos/:id/estoque', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
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

// GET /api/zonas — listar todas (admin)
router.get('/zonas', requireAuth, async (req, res) => {
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
router.post('/zonas', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { nome, descricao, taxa, ativo, max_km } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome da zona é obrigatório.' });
  try {
    const { rows } = await query(
      'INSERT INTO zonas_entrega (nome, descricao, taxa, ativo, max_km) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [nome.trim(), descricao || '', parseFloat(taxa) || 0, ativo !== false, max_km ? parseFloat(max_km) : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao criar zona:', err.message);
    res.status(500).json({ error: 'Erro ao criar zona de entrega' });
  }
});

// PUT /api/zonas/:id — atualizar
router.put('/zonas/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  const { nome, descricao, taxa, ativo, max_km } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome da zona é obrigatório.' });
  try {
    const { rows } = await query(
      'UPDATE zonas_entrega SET nome=$1, descricao=$2, taxa=$3, ativo=$4, max_km=$5 WHERE id=$6 RETURNING *',
      [nome.trim(), descricao || '', parseFloat(taxa) || 0, ativo !== false, max_km ? parseFloat(max_km) : null, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Zona não encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar zona:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar zona de entrega' });
  }
});

// DELETE /api/zonas/:id — excluir
router.delete('/zonas/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
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
