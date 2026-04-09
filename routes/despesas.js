const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN_MANAGER = ['Admin', 'Manager'];

// Listar despesas de uma data específica (ou hoje)
router.get('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const data = req.query.data || new Date().toISOString().split('T')[0];
    const { rows } = await query('SELECT * FROM despesas WHERE data_despesa = $1 ORDER BY id DESC', [data]);
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar despesas:', err.message);
    res.status(500).json({ error: 'Erro ao buscar despesas' });
  }
});

// Resumo financeiro (Receitas vs Despesas do dia)
router.get('/resumo', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    const data = req.query.data || new Date().toISOString().split('T')[0];
    const sqlReceitas = `SELECT SUM(total) as total_vendas FROM pedidos WHERE DATE(criado_em) = $1 AND status != 'cancelado'`;
    const sqlDespesas = `SELECT SUM(valor) as total_despesas FROM despesas WHERE data_despesa = $1`;

    const [receitas, despesas] = await Promise.all([
      query(sqlReceitas, [data]),
      query(sqlDespesas, [data])
    ]);

    const vendas = Number(receitas.rows[0].total_vendas) || 0;
    const gastos = Number(despesas.rows[0].total_despesas) || 0;
    const liquido = vendas - gastos;

    res.json({
      data,
      vendas,
      gastos,
      liquido
    });
  } catch (err) {
    console.error('Erro ao calcular resumo:', err.message);
    res.status(500).json({ error: 'Erro ao calcular resumo' });
  }
});

// Lançar nova despesa
router.post('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { descricao, valor, data_despesa } = req.body;

  if (!descricao || !valor) {
    return res.status(400).json({ error: 'Descrição e valor são obrigatórios.' });
  }

  try {
    const text = 'INSERT INTO despesas (descricao, valor, data_despesa) VALUES ($1, $2, $3) RETURNING *';
    const values = [descricao, Number(valor), data_despesa || new Date().toISOString().split('T')[0]];
    const { rows } = await query(text, values);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao inserir despesa:', err.message);
    res.status(500).json({ error: 'Erro ao inserir despesa' });
  }
});

// Remover despesa
router.delete('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  try {
    await query('DELETE FROM despesas WHERE id = $1', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao remover despesa:', err.message);
    res.status(500).json({ error: 'Erro ao remover despesa' });
  }
});

module.exports = router;
