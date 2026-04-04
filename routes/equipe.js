const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

// Auto-migration for Team table
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS equipe (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(150),
        unidade VARCHAR(100) DEFAULT 'pitombo-lanches',
        funcao VARCHAR(50) DEFAULT 'Manager',
        ativo BOOLEAN DEFAULT TRUE,
        senha VARCHAR(255),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Add default admin if table is empty
    const countRes = await query('SELECT COUNT(*) FROM equipe');
    if (parseInt(countRes.rows[0].count) === 0) {
      await query(`
        INSERT INTO equipe (nome, email, unidade, funcao, ativo) 
        VALUES ('Pitombo Lanches', 'admin@pitombo.lanches', 'pitombo-lanches', 'Admin', true)
      `);
    }

    console.log('✅ Tabela equipe carregada e verificada com sucesso.');
  } catch (err) {
    console.error('⚠️ Erro ao criar/atualizar tabela equipe:', err.message);
  }
})();

// GET ALL
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM equipe ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro GET equipe:', err.message);
    res.status(500).json({ error: 'Erro ao buscar equipe' });
  }
});

// CREATE
router.post('/', async (req, res) => {
  const { nome, email, funcao, ativo } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  
  try {
    const result = await query(
      'INSERT INTO equipe (nome, email, funcao, ativo) VALUES ($1, $2, $3, $4) RETURNING *',
      [nome, email || '', funcao || 'Manager', ativo !== undefined ? ativo : true]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro POST equipe:', err.message);
    res.status(500).json({ error: 'Erro ao criar usuário na equipe' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, email, funcao, ativo } = req.body;
  
  try {
    // Busca usuário atual para merge
    const currentRes = await query('SELECT * FROM equipe WHERE id = $1', [id]);
    if (currentRes.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    const u = currentRes.rows[0];

    const newNome = nome !== undefined ? nome : u.nome;
    const newEmail = email !== undefined ? email : u.email;
    const newFuncao = funcao !== undefined ? funcao : u.funcao;
    const newAtivo = ativo !== undefined ? ativo : u.ativo;

    const result = await query(
      'UPDATE equipe SET nome = $1, email = $2, funcao = $3, ativo = $4, atualizado_em = NOW() WHERE id = $5 RETURNING *',
      [newNome, newEmail, newFuncao, newAtivo, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro PUT equipe:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const currentRes = await query('SELECT funcao FROM equipe WHERE id = $1', [id]);
    if (currentRes.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (currentRes.rows[0].funcao === 'Admin') {
      return res.status(403).json({ error: 'Não é possível deletar o usuário Administrador Principal' });
    }

    await query('DELETE FROM equipe WHERE id = $1', [id]);
    res.json({ message: 'Usuário removido da equipe' });
  } catch (err) {
    console.error('Erro DELETE equipe:', err.message);
    res.status(500).json({ error: 'Erro ao deletar usuário' });
  }
});

module.exports = router;
