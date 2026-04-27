const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN_MANAGER = ['Admin', 'Manager'];

// --- MODIFICADOR CATEGORIAS ---

// GET /api/modificadores/categorias - Listar categorias de modificadores
router.get('/categorias', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT mc.*, 
            COALESCE(
              json_agg(
                json_build_object(
                  'id', mi.id,
                  'nome', mi.nome,
                  'preco', mi.preco,
                  'custo', mi.custo,
                  'sku', mi.sku,
                  'quantidade_maxima', mi.quantidade_maxima,
                  'ativo', mi.ativo,
                  'ordem', mi.ordem
                )
              ) FILTER (WHERE mi.id IS NOT NULL), '[]'
            ) AS itens
            FROM modificador_categorias mc
            LEFT JOIN modificador_itens mi ON mc.id = mi.categoria_id
            GROUP BY mc.id
            ORDER BY mc.id ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Erro ao listar categorias de modificadores:', err.message);
        res.status(500).json({ error: 'Erro ao listar modificadores' });
    }
});

// POST /api/modificadores/categorias - Criar categoria de modificadores
router.post('/categorias', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const { nome, obrigatorio, selecao_unica, min_escolhas, max_escolhas, ordem, ativo } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    try {
        const { rows } = await query(
            'INSERT INTO modificador_categorias (nome, obrigatorio, selecao_unica, min_escolhas, max_escolhas, ordem, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [nome, !!obrigatorio, !!selecao_unica, Number(min_escolhas) || 0, Number(max_escolhas) || 1, Number(ordem) || 0, ativo !== false]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Erro ao criar categoria de modificadores:', err.message);
        res.status(500).json({ error: 'Erro ao criar modificadores' });
    }
});

// PUT /api/modificadores/categorias/reordenar
router.put('/categorias/reordenar', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const { itens } = req.body;
    if (!itens || !Array.isArray(itens)) return res.status(400).json({ error: 'Array "itens" é obrigatório' });
    try {
        await query('BEGIN');
        for (const item of itens) {
            await query('UPDATE modificador_categorias SET ordem = $1 WHERE id = $2', [item.ordem, item.id]);
        }
        await query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Erro ao reordenar categorias de modificadores:', err.message);
        res.status(500).json({ error: 'Erro ao reordenar' });
    }
});

// PUT /api/modificadores/categorias/:id - Atualizar categoria de modificadores
router.put('/categorias/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const id = Number(req.params.id);
    const { nome, obrigatorio, selecao_unica, min_escolhas, max_escolhas, ordem, ativo } = req.body;
    try {
        const { rows } = await query(
            'UPDATE modificador_categorias SET nome = $1, obrigatorio = $2, selecao_unica = $3, min_escolhas = $4, max_escolhas = $5, ordem = $6, ativo = $7 WHERE id = $8 RETURNING *',
            [nome, !!obrigatorio, !!selecao_unica, Number(min_escolhas) || 0, Number(max_escolhas) || 1, Number(ordem) || 0, ativo !== false, id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Categoria não encontrada' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Erro ao atualizar categoria de modificadores:', err.message);
        res.status(500).json({ error: 'Erro ao atualizar modificadores' });
    }
});

// DELETE /api/modificadores/categorias/:id - Excluir categoria de modificadores
router.delete('/categorias/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const id = Number(req.params.id);
    try {
        const { rows } = await query('DELETE FROM modificador_categorias WHERE id = $1 RETURNING *', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Categoria não encontrada' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir categoria de modificadores:', err.message);
        res.status(500).json({ error: 'Erro ao excluir modificadores' });
    }
});

// --- MODIFICADOR ITENS ---

// POST /api/modificadores/itens - Criar item de modificador
router.post('/itens', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const { categoria_id, nome, preco, custo, sku, quantidade_maxima, ativo, ordem } = req.body;
    if (!categoria_id || !nome) return res.status(400).json({ error: 'Categoria e Nome são obrigatórios' });
    try {
        const { rows } = await query(
            'INSERT INTO modificador_itens (categoria_id, nome, preco, custo, sku, quantidade_maxima, ativo, ordem) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [categoria_id, nome, Number(preco) || 0, Number(custo) || 0, sku || null, Number(quantidade_maxima) || 1, ativo !== false, Number(ordem) || 0]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Erro ao criar item de modificador:', err.message);
        res.status(500).json({ error: 'Erro ao criar item de modificador' });
    }
});

// PUT /api/modificadores/itens/reordenar
router.put('/itens/reordenar', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const { itens } = req.body;
    if (!itens || !Array.isArray(itens)) return res.status(400).json({ error: 'Array "itens" é obrigatório' });
    try {
        await query('BEGIN');
        for (const item of itens) {
            await query('UPDATE modificador_itens SET ordem = $1 WHERE id = $2', [item.ordem, item.id]);
        }
        await query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Erro ao reordenar itens de modificadores:', err.message);
        res.status(500).json({ error: 'Erro ao reordenar itens' });
    }
});

// PUT /api/modificadores/itens/:id - Atualizar item de modificador
router.put('/itens/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const id = Number(req.params.id);
    const { nome, preco, custo, sku, quantidade_maxima, ativo, ordem } = req.body;
    try {
        const { rows } = await query(
            'UPDATE modificador_itens SET nome = $1, preco = $2, custo = $3, sku = $4, quantidade_maxima = $5, ativo = $6, ordem = $7 WHERE id = $8 RETURNING *',
            [nome, Number(preco) || 0, Number(custo) || 0, sku || null, Number(quantidade_maxima) || 1, ativo !== false, Number(ordem) || 0, id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Item não encontrado' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Erro ao atualizar item de modificador:', err.message);
        res.status(500).json({ error: 'Erro ao atualizar item de modificador' });
    }
});

// DELETE /api/modificadores/itens/:id - Excluir item de modificador
router.delete('/itens/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const id = Number(req.params.id);
    try {
        const { rows } = await query('DELETE FROM modificador_itens WHERE id = $1 RETURNING *', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Item não encontrado' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir item de modificador:', err.message);
        res.status(500).json({ error: 'Erro ao excluir item de modificador' });
    }
});

// --- VINCULOS PRODUTO <-> MODIFICADORES ---

// GET /api/modificadores/produto/:id - Listar modificadores de um produto (com seus itens)
// Respeita ordem_override e obrigatorio_override salvos no vínculo produto<->modificador.
// A ordem_override é a fonte única da verdade para ordenação no cliente.
router.get('/produto/:id', async (req, res) => {
    const produtoId = Number(req.params.id);
    try {
        const { rows } = await query(`
            SELECT
              mc.id,
              mc.nome,
              mc.ativo,
              mc.ordem,
              -- Usa obrigatorio_override quando explicitamente definido no vínculo,
              -- caso contrário cai de volta ao valor global da categoria
              COALESCE(pm_link.obrigatorio_override, mc.obrigatorio) AS obrigatorio,
              COALESCE(pm_link.selecao_unica_override, mc.selecao_unica) AS selecao_unica,
              COALESCE(pm_link.min_escolhas_override, mc.min_escolhas) AS min_escolhas,
              COALESCE(pm_link.max_escolhas_override, mc.max_escolhas) AS max_escolhas,
              pm_link.ordem_override,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id',              mi.id,
                    'nome',            mi.nome,
                    'preco',           mi.preco,
                    'quantidade_maxima', mi.quantidade_maxima
                  ) ORDER BY mi.ordem ASC
                ) FILTER (WHERE mi.id IS NOT NULL AND mi.ativo = true), '[]'
              ) AS itens
            FROM modificador_categorias mc
            -- Left join no vínculo direto do produto para pegar os overrides
            LEFT JOIN produto_modificadores pm_link
              ON pm_link.categoria_id = mc.id AND pm_link.produto_id = $1
            -- Inner join para filtrar apenas modificadores associados a este produto
            JOIN (
              -- links diretos ao produto
              SELECT categoria_id FROM produto_modificadores WHERE produto_id = $1

              UNION

              -- links via categoria do produto
              SELECT cm.modificador_categoria_id
              FROM categoria_modificadores cm
              JOIN produtos p ON p.categoria_id = cm.categoria_id AND p.id = $1
            ) pm ON mc.id = pm.categoria_id
            LEFT JOIN modificador_itens mi ON mc.id = mi.categoria_id
            WHERE mc.ativo = true
            GROUP BY mc.id, mc.nome, mc.ativo, mc.ordem,
                     mc.obrigatorio, mc.selecao_unica, mc.min_escolhas, mc.max_escolhas,
                     pm_link.obrigatorio_override, pm_link.selecao_unica_override,
                     pm_link.min_escolhas_override, pm_link.max_escolhas_override,
                     pm_link.ordem_override
            -- Ordenar por ordem_override (a posição definida no produto),
            -- fallback para mc.ordem global e depois mc.id para desempate
            ORDER BY COALESCE(pm_link.ordem_override, mc.ordem, 9999) ASC, mc.id ASC
        `, [produtoId]);
        res.json(rows);
    } catch (err) {
        console.error('Erro ao listar modificadores do produto:', err.message);
        res.status(500).json({ error: 'Erro ao recuperar modificadores' });
    }
});

// POST /api/modificadores/produto/:id - Associar categoria de modificador a um produto
router.post('/produto/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const produtoId = Number(req.params.id);
    const { categoria_id } = req.body;
    try {
        await query(
            'INSERT INTO produto_modificadores (produto_id, categoria_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [produtoId, categoria_id]
        );
        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Erro ao associar modificador:', err.message);
        res.status(500).json({ error: 'Erro ao associar modificador' });
    }
});

// DELETE /api/modificadores/produto/:id/:categoria_id - Desassociar categoria de modificador de um produto
router.delete('/produto/:id/:categoria_id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const produtoId = Number(req.params.id);
    const categeoriaId = Number(req.params.categoria_id);
    try {
        await query('DELETE FROM produto_modificadores WHERE produto_id = $1 AND categoria_id = $2', [produtoId, categeoriaId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao desassociar modificador:', err.message);
        res.status(500).json({ error: 'Erro ao desassociar modificador' });
    }
});

// --- VINCULOS CATEGORIA <-> MODIFICADORES ---

// GET /api/modificadores/categoria/:id - Listar modificadores associados a uma categoria
router.get('/categoria/:id', async (req, res) => {
    const categoriaId = Number(req.params.id);
    try {
        const { rows } = await query(`
            SELECT mc.* 
            FROM modificador_categorias mc
            JOIN categoria_modificadores cm ON mc.id = cm.modificador_categoria_id
            WHERE cm.categoria_id = $1
            ORDER BY mc.id ASC
        `, [categoriaId]);
        res.json(rows);
    } catch (err) {
        console.error('Erro ao listar associacoes de categoria:', err.message);
        res.status(500).json({ error: 'Erro ao recuperar associacoes' });
    }
});

// POST /api/modificadores/categoria/:id - Associar modificador a uma categoria
router.post('/categoria/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const categoriaId = Number(req.params.id);
    const { modificador_categoria_id } = req.body;
    try {
        await query(
            'INSERT INTO categoria_modificadores (categoria_id, modificador_categoria_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [categoriaId, modificador_categoria_id]
        );
        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Erro ao associar modificador a categoria:', err.message);
        res.status(500).json({ error: 'Erro ao associar' });
    }
});

// DELETE /api/modificadores/categoria/:id/:modificador_categoria_id - Desassociar
router.delete('/categoria/:id/:modificador_categoria_id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const categoriaId = Number(req.params.id);
    const modificadorCategoriaId = Number(req.params.modificador_categoria_id);
    try {
        await query(
            'DELETE FROM categoria_modificadores WHERE categoria_id = $1 AND modificador_categoria_id = $2', 
            [categoriaId, modificadorCategoriaId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao desassociar modificador de categoria:', err.message);
        res.status(500).json({ error: 'Erro ao desassociar' });
    }
});

// GET /api/modificadores/categorias_associadas/:modificador_categoria_id - Listar categorias que tem este modificador
router.get('/categorias_associadas/:modificador_categoria_id', async (req, res) => {
    const modId = Number(req.params.modificador_categoria_id);
    try {
        const { rows } = await query(`
            SELECT categoria_id FROM categoria_modificadores WHERE modificador_categoria_id = $1
        `, [modId]);
        res.json(rows.map(r => r.categoria_id));
    } catch (err) {
        console.error('Erro ao listar associacoes:', err.message);
        res.status(500).json({ error: 'Erro' });
    }
});

// POST /api/modificadores/associar_em_massa - Sincroniza todas as contas
router.post('/associar_em_massa', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const { modificador_categoria_id, categorias_ids } = req.body;
    try {
        await query('DELETE FROM categoria_modificadores WHERE modificador_categoria_id = $1', [modificador_categoria_id]);
        if (categorias_ids && categorias_ids.length > 0) {
            for (const catId of categorias_ids) {
                await query('INSERT INTO categoria_modificadores (categoria_id, modificador_categoria_id) VALUES ($1, $2)', [catId, modificador_categoria_id]);
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao associar em massa:', err.message);
        res.status(500).json({ error: 'Erro' });
    }
});

module.exports = router;
