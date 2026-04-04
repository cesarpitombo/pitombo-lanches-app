const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

// Auto-migration: Criar tabela de cozinhas se não existir
(async () => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS cozinhas (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                is_principal BOOLEAN DEFAULT false,
                config_auto_update BOOLEAN DEFAULT true,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Garantir que exista ao menos a Cozinha Principal
        const { rows } = await query('SELECT id FROM cozinhas WHERE is_principal = true');
        if (rows.length === 0) {
            await query("INSERT INTO cozinhas (nome, is_principal) VALUES ('Cozinha principal', true)");
            console.log('[Setup] Cozinha Principal criada por padrão.');
        }
        
    } catch (err) {
        console.error('[Setup] Erro ao criar tabela de cozinhas:', err);
    }
})();

// GET - Listar todas as cozinhas
router.get('/', async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM cozinhas ORDER BY is_principal DESC, id ASC');
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST - Criar nova cozinha
router.post('/', async (req, res) => {
    try {
        const { nome } = req.body;
        const { rows } = await query(
            'INSERT INTO cozinhas (nome) VALUES ($1) RETURNING *',
            [nome]
        );
        res.status(201).json(rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT - Atualizar cozinha (Nome ou Configs)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, config_auto_update } = req.body;
        
        let updates = [];
        let params = [];
        
        if (nome !== undefined) {
            params.push(nome);
            updates.push(`nome = $${params.length}`);
        }
        
        if (config_auto_update !== undefined) {
            params.push(config_auto_update);
            updates.push(`config_auto_update = $${params.length}`);
        }
        
        if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        
        params.push(id);
        const sql = `UPDATE cozinhas SET ${updates.join(', ')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = $${params.length} RETURNING *`;
        
        const { rows } = await query(sql, params);
        res.json(rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE - Remover cozinha (Não permite remover a principal)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows: check } = await query('SELECT is_principal FROM cozinhas WHERE id = $1', [id]);
        
        if (check.length === 0) return res.status(404).json({ error: 'Cozinha não encontrada' });
        if (check[0].is_principal) return res.status(403).json({ error: 'Não é possível excluir a cozinha principal.' });
        
        await query('DELETE FROM cozinhas WHERE id = $1', [id]);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
