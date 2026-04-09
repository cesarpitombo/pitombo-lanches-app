const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN_MANAGER = ['Admin', 'Manager'];

// Auto-migration: Criar tabela de clientes se não existir
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        telefone VARCHAR(50) UNIQUE NOT NULL,
        observacoes TEXT,
        status_cliente VARCHAR(50) DEFAULT 'Sem pedido',
        total_pedidos INTEGER DEFAULT 0,
        total_gasto DECIMAL(10,2) DEFAULT 0.00,
        ultimo_pedido_em TIMESTAMP,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Setup] Tabela clientes verificada/criada.');
  } catch (err) {
    console.error('[Setup] Erro ao criar tabela de clientes:', err);
  }
})();

// GET - Listar todos os clientes (com busca e filtros simples)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { busca, status } = req.query;
    let sql = 'SELECT * FROM clientes';
    let params = [];
    let conditions = [];

    if (busca) {
      params.push(`%${busca}%`);
      conditions.push(`(nome ILIKE $${params.length} OR telefone ILIKE $${params.length})`);
    }

    if (status && status !== 'Todos') {
      params.push(status);
      conditions.push(`status_cliente = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY nome ASC';

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error('Erro GET clientes:', e);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

// POST - Criar novo cliente
router.post('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const { nome, telefone, observacoes } = req.body;
    
    // Validar se telefone já existe
    const exist = await query('SELECT id FROM clientes WHERE telefone = $1', [telefone]);
    if (exist.rows.length > 0) {
      return res.status(400).json({ error: 'Este telefone já está cadastrado.' });
    }

    const { rows } = await query(`
      INSERT INTO clientes (nome, telefone, observacoes, status_cliente)
      VALUES ($1, $2, $3, 'Sem pedido')
      RETURNING *
    `, [nome, telefone, observacoes]);
    
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Erro POST clientes:', e);
    res.status(500).json({ error: 'Erro ao cadastrar cliente' });
  }
});

// PUT - Atualizar cliente
router.put('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    try {
      const { id } = req.params;
      const { nome, telefone, observacoes } = req.body;
  
      const { rows } = await query(`
        UPDATE clientes 
        SET nome = $1, telefone = $2, observacoes = $3, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `, [nome, telefone, observacoes, id]);
      
      if (rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });
      res.json(rows[0]);
    } catch (e) {
      console.error('Erro PUT clientes:', e);
      res.status(500).json({ error: 'Erro ao atualizar cliente' });
    }
});

// DELETE - Remover cliente
router.delete('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await query('DELETE FROM clientes WHERE id = $1 RETURNING *', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });
        res.json({ ok: true, removed: rows[0] });
    } catch(e) {
        console.error('Erro DELETE clientes:', e);
        res.status(500).json({ error: 'Erro ao remover cliente' });
    }
});

module.exports = router;
