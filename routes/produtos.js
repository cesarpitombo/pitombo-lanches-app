const express = require('express');
const router = express.Router();
const { query, getClient } = require('../db/connection');

// Auxiliares de mapeamento para padrão do usuário (Inglês)
const mapToEnglish = (p) => ({
    id: p.id,
    name: p.nome,
    description: p.descricao,
    price: p.preco,
    category_id: p.category_id,
    active: p.disponivel,
    // Mantemos os campos extras para compatibilidade com o front avançado
    image_url: p.imagem_url,
    kitchen_id: p.cozinha_id,
    stock_control: p.controlar_estoque,
    stock_current: p.estoque_atual,
    stock_min: p.estoque_minimo,
    stock_alert: p.aviso_baixo_estoque,
    stock_empty_behavior: p.comportamento_estoque_vazio,
    category_name: p.categoria_nome,
    kitchen_name: p.cozinha_nome,
    variants: p.variantes,
    modifiers: p.modificadores,
    allow_observation: p.allow_observation,
    custo: p.custo,
    desconto: p.desconto,
    sku: p.sku,
    preco_embalagem: p.preco_embalagem
});

const mapToPortuguese = (p) => {
    const data = {};
    if (p.name !== undefined) data.nome = p.name;
    if (p.description !== undefined) data.descricao = p.description;
    if (p.price !== undefined) data.preco = p.price;
    if (p.category_id !== undefined) data.categoria_id = p.category_id;
    if (p.active !== undefined) data.disponivel = p.active;
    if (p.image_url !== undefined) data.imagem_url = p.image_url;
    if (p.kitchen_id !== undefined) data.cozinha_id = p.kitchen_id;
    if (p.stock_control !== undefined) data.controlar_estoque = p.stock_control;
    if (p.stock_current !== undefined) data.estoque_atual = p.stock_current;
    if (p.stock_min !== undefined) data.estoque_minimo = p.stock_min;
    if (p.stock_alert !== undefined) data.aviso_baixo_estoque = p.stock_alert;
    if (p.stock_empty_behavior !== undefined) data.comportamento_estoque_vazio = p.stock_empty_behavior;
    if (p.allow_observation !== undefined) data.allow_observation = p.allow_observation;
    if (p.modifiers !== undefined) data.modificadores = p.modifiers;
    if (p.custo !== undefined) data.custo = p.custo;
    if (p.desconto !== undefined) data.desconto = p.desconto;
    if (p.sku !== undefined) data.sku = p.sku;
    if (p.preco_embalagem !== undefined) data.preco_embalagem = p.preco_embalagem;
    return data;
};

// GET /api/produtos ou /api/products - Listar todos (Foco: Correção GROUP BY)
router.get('/', async (req, res) => {
    const isEnglish = req.baseUrl.includes('products');
    try {
        const sql = `
            SELECT p.*, 
                   c.nome AS categoria_nome,
                   cz.nome AS cozinha_nome,
                   (
                     SELECT COALESCE(json_agg(json_build_object(
                       'id', v.id, 'nome', v.nome, 'preco', v.preco, 'ativo', v.ativo
                     )), '[]')
                     FROM produto_variantes v 
                     WHERE v.produto_id = p.id
                   ) AS variantes,
                   (
                     SELECT COALESCE(json_agg(json_build_object(
                       'id', base.modificador_id,
                       'modificador_id', base.modificador_id,
                       'min_escolhas_override', base.min_escolhas_override,
                       'max_escolhas_override', base.max_escolhas_override,
                       'obrigatorio_override', base.obrigatorio_override,
                       'selecao_unica_override', base.selecao_unica_override,
                       'ordem_override', base.ordem_override,
                       'ativo_override', base.ativo_override
                     )), '[]')
                     FROM (
                        SELECT pm.categoria_id as modificador_id, pm.min_escolhas_override, pm.max_escolhas_override, pm.obrigatorio_override, pm.selecao_unica_override, pm.ordem_override, pm.ativo_override
                        FROM produto_modificadores pm WHERE pm.produto_id = p.id
                        UNION
                        SELECT cm.modificador_categoria_id as modificador_id, NULL, NULL, NULL, NULL, NULL, NULL
                        FROM categoria_modificadores cm WHERE cm.categoria_id = p.categoria_id AND cm.modificador_categoria_id NOT IN (SELECT categoria_id FROM produto_modificadores WHERE produto_id = p.id)
                     ) AS base
                   ) AS modificadores
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            LEFT JOIN cozinhas cz ON p.cozinha_id = cz.id
            ORDER BY c.ordem ASC, p.ordem ASC, p.id ASC
        `;
        const { rows } = await query(sql);
        
        // Garantir que sempre retorne [], nunca erro se vazio
        if (isEnglish) {
            return res.json(rows.map(mapToEnglish));
        }
        res.json(rows);
    } catch (err) {
        console.error('❌ Erro SQL na listagem de produtos:', err.message);
        res.status(500).json({ error: 'Erro ao listar produtos: ' + err.message });
    }
});

// GET /api/produtos/:id ou /api/products/:id - Detalhes
router.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const isEnglish = req.baseUrl.includes('products');
    try {
        const sql = `
            SELECT p.*, 
                   COALESCE(
                     json_agg(
                       json_build_object(
                         'id', v.id,
                         'nome', v.nome,
                         'preco', v.preco,
                         'custo', v.custo,
                         'desconto', v.desconto,
                         'sku', v.sku,
                         'ativo', v.ativo
                       )
                     ) FILTER (WHERE v.id IS NOT NULL), '[]'
                   ) AS variantes,
                   (
                     SELECT COALESCE(json_agg(json_build_object(
                       'id', base.modificador_id,
                       'modificador_id', base.modificador_id,
                       'min_escolhas_override', base.min_escolhas_override,
                       'max_escolhas_override', base.max_escolhas_override,
                       'obrigatorio_override', base.obrigatorio_override,
                       'selecao_unica_override', base.selecao_unica_override,
                       'ordem_override', base.ordem_override,
                       'ativo_override', base.ativo_override
                     )), '[]')
                     FROM (
                        SELECT pm.categoria_id as modificador_id, pm.min_escolhas_override, pm.max_escolhas_override, pm.obrigatorio_override, pm.selecao_unica_override, pm.ordem_override, pm.ativo_override
                        FROM produto_modificadores pm WHERE pm.produto_id = p.id
                        UNION
                        SELECT cm.modificador_categoria_id as modificador_id, NULL, NULL, NULL, NULL, NULL, NULL
                        FROM categoria_modificadores cm WHERE cm.categoria_id = p.categoria_id AND cm.modificador_categoria_id NOT IN (SELECT categoria_id FROM produto_modificadores WHERE produto_id = p.id)
                     ) AS base
                   ) AS modificadores
            FROM produtos p
            LEFT JOIN produto_variantes v ON p.id = v.produto_id
            WHERE p.id = $1
            GROUP BY p.id
        `;
        const { rows } = await query(sql, [id]);
        if (rows.length === 0) return res.status(404).json({ error: isEnglish ? 'Product not found' : 'Produto não encontrado' });
        
        res.json(isEnglish ? mapToEnglish(rows[0]) : rows[0]);
    } catch (err) {
        console.error('Erro ao buscar produto:', err.message);
        res.status(500).json({ error: 'Erro ao buscar produto' });
    }
});

// POST /api/produtos ou /api/products - Criar produto
router.post('/', async (req, res) => {
    const isEnglish = req.baseUrl.includes('products');
    let body = req.body;
    
    if (isEnglish) {
        body = mapToPortuguese(req.body);
        // Map variants if present in English
        if (req.body.variants && Array.isArray(req.body.variants)) {
            body.variantes = req.body.variants.map(v => ({
                nome: v.name || v.nome,
                preco: v.price || v.preco,
                custo: v.custo,
                desconto: v.desconto,
                sku: v.sku,
                ativo: v.active !== undefined ? v.active : v.ativo
            }));
        }
    }

    const { nome, descricao, preco, categoria_id, cozinha_id, disponivel, controlar_estoque, estoque_atual, estoque_minimo, aviso_baixo_estoque, comportamento_estoque_vazio, imagem_url, variantes, modificadores, allow_observation, custo, desconto, sku, preco_embalagem } = body;
    
    if (!nome || preco === undefined) {
        return res.status(400).json({ error: isEnglish ? 'Name and Price are required' : 'Nome e Preço são obrigatórios' });
    }
    
    const client = await getClient();
    try {
        await client.query('BEGIN');
        
        const sql = `
            INSERT INTO produtos (
                nome, descricao, preco, categoria_id, cozinha_id, disponivel, 
                controlar_estoque, estoque_atual, estoque_minimo, 
                aviso_baixo_estoque, comportamento_estoque_vazio, imagem_url, allow_observation,
                custo, desconto, sku, preco_embalagem
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *
        `;
        const { rows } = await client.query(sql, [
            nome, descricao, preco, categoria_id || null, cozinha_id || null, 
            disponivel !== false, controlar_estoque === true, estoque_atual || 0,
            estoque_minimo || 0, aviso_baixo_estoque === true, 
            comportamento_estoque_vazio || 'marcar_indisponivel', imagem_url || null,
            allow_observation !== false, Number(custo)||0, Number(desconto)||0, sku||null, Number(preco_embalagem)||0
        ]);
        
        const newProduct = rows[0];

        // Inserir variantes
        if (variantes && Array.isArray(variantes)) {
            for (const v of variantes) {
                await client.query(
                    'INSERT INTO produto_variantes (produto_id, nome, preco, custo, desconto, sku, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [newProduct.id, v.nome, v.preco, v.custo || 0, v.desconto || 0, v.sku || null, v.ativo !== false]
                );
            }
        }

        // Inserir modificadores com suporte a overrides
        if (modificadores && Array.isArray(modificadores)) {
            console.log(`- Salvando ${modificadores.length} modificadores para o produto ${newProduct.id}`);
            for (const m of modificadores) {
                const modId = (typeof m === 'object') ? (m.modificador_id || m.id) : m;
                console.log(`  > Associando modificador ID: ${modId}`);
                
                const minOverride = (typeof m === 'object') ? m.min_escolhas_override : null;
                const maxOverride = (typeof m === 'object') ? m.max_escolhas_override : null;
                const obrigatorioOverride = (typeof m === 'object') ? m.obrigatorio_override : null;
                const selecaoUnicaOverride = (typeof m === 'object') ? m.selecao_unica_override : null;
                const ordemOverride = (typeof m === 'object') ? m.ordem_override : null;
                const ativoOverride = (typeof m === 'object') ? m.ativo_override : null;

                await client.query(
                    'INSERT INTO produto_modificadores (produto_id, categoria_id, min_escolhas_override, max_escolhas_override, obrigatorio_override, selecao_unica_override, ordem_override, ativo_override) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                    [newProduct.id, modId, minOverride, maxOverride, obrigatorioOverride, selecaoUnicaOverride, ordemOverride, ativoOverride]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json(isEnglish ? mapToEnglish(newProduct) : newProduct);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erro ao criar produto:', err.message);
        res.status(500).json({ error: 'Erro ao criar produto' });
    } finally {
        client.release();
    }
});

// PUT /api/produtos/reordenar - Atualizar ordem de múltiplos produtos
router.put('/reordenar', async (req, res) => {
    const { itens } = req.body; // Array de { id, ordem }
    if (!itens || !Array.isArray(itens)) return res.status(400).json({ error: 'Array "itens" é obrigatório' });
    try {
        await query('BEGIN');
        for (const item of itens) {
            await query('UPDATE produtos SET ordem = $1 WHERE id = $2', [item.ordem, item.id]);
        }
        await query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Erro ao reordenar produtos:', err.message);
        res.status(500).json({ error: 'Erro ao reordenar produtos' });
    }
});

// PUT /api/produtos/:id ou /api/products/:id - Atualizar produto
router.put('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const isEnglish = req.baseUrl.includes('products');
    let body = req.body;

    if (isEnglish) {
        body = mapToPortuguese(req.body);
        if (req.body.variants && Array.isArray(req.body.variants)) {
            body.variantes = req.body.variants.map(v => ({
                nome: v.name || v.nome,
                preco: v.price || v.preco,
                custo: v.custo,
                desconto: v.desconto,
                sku: v.sku,
                ativo: v.active !== undefined ? v.active : v.ativo
            }));
        }
    }

    const { nome, descricao, preco, categoria_id, cozinha_id, disponivel, controlar_estoque, estoque_atual, estoque_minimo, aviso_baixo_estoque, comportamento_estoque_vazio, imagem_url, variantes, modificadores, allow_observation, custo, desconto, sku, preco_embalagem } = body;
    
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const sql = `
            UPDATE produtos SET 
                nome = $1, descricao = $2, preco = $3, categoria_id = $4, cozinha_id = $5, 
                disponivel = $6, controlar_estoque = $7, estoque_atual = $8, 
                estoque_minimo = $9, aviso_baixo_estoque = $10, 
                comportamento_estoque_vazio = $11, imagem_url = $12,
                allow_observation = $13, custo = $14, desconto = $15, sku = $16, preco_embalagem = $17
            WHERE id = $18
            RETURNING *
        `;
        const { rows } = await client.query(sql, [
            nome, descricao, preco, categoria_id || null, cozinha_id || null, 
            disponivel !== false, controlar_estoque === true, estoque_atual || 0,
            estoque_minimo || 0, aviso_baixo_estoque === true, 
            comportamento_estoque_vazio || 'marcar_indisponivel', imagem_url || null,
            allow_observation !== false, Number(custo)||0, Number(desconto)||0, sku||null, Number(preco_embalagem)||0,
            id
        ]);

        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: isEnglish ? 'Product not found' : 'Produto não encontrado' });
        }

        const updatedProduct = rows[0];

        // Atualizar variantes
        if (variantes && Array.isArray(variantes)) {
            await client.query('DELETE FROM produto_variantes WHERE produto_id = $1', [id]);
            for (const v of variantes) {
                await client.query(
                    'INSERT INTO produto_variantes (produto_id, nome, preco, custo, desconto, sku, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [id, v.nome, v.preco, v.custo || 0, v.desconto || 0, v.sku || null, v.ativo !== false]
                );
            }
        }

        // Atualizar modificadores com suporte a overrides
        if (modificadores && Array.isArray(modificadores)) {
            console.log(`- Atualizando modificadores para o produto ${id}`);
            await client.query('DELETE FROM produto_modificadores WHERE produto_id = $1', [id]);
            for (const m of modificadores) {
                const modId = (typeof m === 'object') ? (m.modificador_id || m.id) : m;
                console.log(`  > Re-associando modificador ID: ${modId}`);
                
                const minOverride = (typeof m === 'object') ? m.min_escolhas_override : null;
                const maxOverride = (typeof m === 'object') ? m.max_escolhas_override : null;
                const obrigatorioOverride = (typeof m === 'object') ? m.obrigatorio_override : null;
                const selecaoUnicaOverride = (typeof m === 'object') ? m.selecao_unica_override : null;
                const ordemOverride = (typeof m === 'object') ? m.ordem_override : null;
                const ativoOverride = (typeof m === 'object') ? m.ativo_override : null;

                await client.query(
                    'INSERT INTO produto_modificadores (produto_id, categoria_id, min_escolhas_override, max_escolhas_override, obrigatorio_override, selecao_unica_override, ordem_override, ativo_override) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                    [id, modId, minOverride, maxOverride, obrigatorioOverride, selecaoUnicaOverride, ordemOverride, ativoOverride]
                );
            }
        }

        await client.query('COMMIT');
        res.json(isEnglish ? mapToEnglish(updatedProduct) : updatedProduct);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erro ao atualizar produto:', err.message);
        res.status(500).json({ error: 'Erro ao atualizar produto' });
    } finally {
        client.release();
    }
});

// DELETE /api/produtos/:id ou /api/products/:id - Excluir produto
router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const isEnglish = req.baseUrl.includes('products');
    try {
        const { rows } = await query('DELETE FROM produtos WHERE id = $1 RETURNING *', [id]);
        if (rows.length === 0) return res.status(404).json({ error: isEnglish ? 'Product not found' : 'Produto não encontrado' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir produto:', err.message);
        res.status(500).json({ error: 'Erro ao excluir produto' });
    }
});

// --- VARIANTES ---

// POST /api/produtos/:id/variantes - Adicionar variante
router.post('/:id/variantes', async (req, res) => {
    const produtoId = Number(req.params.id);
    const { nome, preco, custo, desconto, sku, ativo } = req.body;
    try {
        const { rows } = await query(
            'INSERT INTO produto_variantes (produto_id, nome, preco, custo, desconto, sku, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [produtoId, nome, preco, custo || 0, desconto || 0, sku || null, ativo !== false]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Erro ao criar variante:', err.message);
        res.status(500).json({ error: 'Erro ao criar variante' });
    }
});

// PUT /api/produtos/variantes/:id - Atualizar variante
router.put('/variantes/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { nome, preco, custo, desconto, sku, ativo } = req.body;
    try {
        const { rows } = await query(
            'UPDATE produto_variantes SET nome = $1, preco = $2, custo = $3, desconto = $4, sku = $5, ativo = $6 WHERE id = $7 RETURNING *',
            [nome, preco, custo || 0, desconto || 0, sku || null, ativo !== false, id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Variante não encontrada' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Erro ao atualizar variante:', err.message);
        res.status(500).json({ error: 'Erro ao atualizar variante' });
    }
});

// DELETE /api/produtos/variantes/:id - Excluir variante
router.delete('/variantes/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
        const { rows } = await query('DELETE FROM produto_variantes WHERE id = $1 RETURNING *', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Variante não encontrada' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir variante:', err.message);
        res.status(500).json({ error: 'Erro ao excluir variante' });
    }
});

module.exports = router;
