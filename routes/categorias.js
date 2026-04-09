const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN_MANAGER = ['Admin', 'Manager'];

// GET /api/categorias - Listar todas as categorias
router.get('/', async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM categorias ORDER BY ordem ASC, id ASC');
        res.json(rows);
    } catch (err) {
        console.error('Erro ao listar categorias:', err.message);
        res.status(500).json({ error: 'Erro ao listar categorias' });
    }
});

// POST /api/categorias - Criar categoria
router.post('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const { nome, ordem, ativo, is_destaque, imagem_url } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    try {
        const { rows } = await query(
            'INSERT INTO categorias (nome, ordem, ativo, is_destaque, imagem_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [nome, ordem || 0, ativo !== false, is_destaque === true, imagem_url || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Erro ao criar categoria:', err.message);
        res.status(500).json({ error: 'Erro ao criar categoria' });
    }
});

// PUT /api/categorias/reordenar - Atualizar ordem de múltiplas categorias
router.put('/reordenar', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const { itens } = req.body; // Array de { id, ordem }
    if (!itens || !Array.isArray(itens)) return res.status(400).json({ error: 'Array "itens" é obrigatório' });
    try {
        await query('BEGIN');
        for (const item of itens) {
            await query('UPDATE categorias SET ordem = $1 WHERE id = $2', [item.ordem, item.id]);
        }
        await query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Erro ao reordenar categorias:', err.message);
        res.status(500).json({ error: 'Erro ao reordenar categorias' });
    }
});

// PUT /api/categorias/:id - Atualizar categoria
router.put('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const id = Number(req.params.id);
    const { nome, ordem, ativo, is_destaque, imagem_url } = req.body;
    try {
        const { rows } = await query(
            'UPDATE categorias SET nome = $1, ordem = $2, ativo = $3, is_destaque = $4, imagem_url = $5 WHERE id = $6 RETURNING *',
            [nome, ordem || 0, ativo !== false, is_destaque === true, imagem_url || null, id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Categoria não encontrada' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Erro ao atualizar categoria:', err.message);
        res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
});

// DELETE /api/categorias/:id - Excluir categoria
router.delete('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    const id = Number(req.params.id);
    try {
        // Desatrelar produtos antes de excluir
        await query('UPDATE produtos SET categoria_id = NULL WHERE categoria_id = $1', [id]);
        const { rows } = await query('DELETE FROM categorias WHERE id = $1 RETURNING *', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Categoria não encontrada' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir categoria:', err.message);
        res.status(500).json({ error: 'Erro ao excluir categoria' });
    }
});

module.exports = router;
