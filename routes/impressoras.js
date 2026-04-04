const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { pingImpressoraRede, scanImpressorasWindows, enviarTesteRede, enviarTesteWindows } = require('../services/impressoras/impressoraService');

// Auto-migration: Create table if not exists
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS impressoras (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        ip VARCHAR(50) NOT NULL,
        porta INTEGER DEFAULT 9100,
        tipo_conexao VARCHAR(50) DEFAULT 'rede',
        setor VARCHAR(50) DEFAULT 'geral',
        papel_mm INTEGER DEFAULT 80,
        ativa BOOLEAN DEFAULT true,
        padrao BOOLEAN DEFAULT false,
        ultima_verificacao TIMESTAMP,
        ultimo_status VARCHAR(50) DEFAULT 'nao_testada',
        ultimo_erro TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Setup] Tabela impressoras verificada/criada.');
  } catch (err) {
    console.error('[Setup] Erro ao criar tabela de impressoras:', err);
  }
})();

// GET - Listar todas as impressoras
router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM impressoras ORDER BY id ASC');
    res.json(rows);
  } catch (e) {
    console.error('Erro GET impressoras:', e);
    res.status(500).json({ error: 'Erro ao buscar impressoras' });
  }
});

// POST - Criar nova impressora
router.post('/', async (req, res) => {
  try {
    const { nome, ip, porta, tipo_conexao, setor, papel_mm, ativa, padrao } = req.body;
    
    // Se esta for padrao, deve remover o padrao das outras
    if (padrao) {
      await query('UPDATE impressoras SET padrao = false');
    }

    const { rows } = await query(`
      INSERT INTO impressoras (nome, ip, porta, tipo_conexao, setor, papel_mm, ativa, padrao)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [nome, ip, porta || 9100, tipo_conexao || 'rede', setor || 'geral', papel_mm || 80, ativa !== false, !!padrao]);
    
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Erro POST impressoras:', e);
    res.status(500).json({ error: 'Erro ao cadastrar impressora' });
  }
});

// PUT - Atualizar impressora
router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { nome, ip, porta, tipo_conexao, setor, papel_mm, ativa, padrao } = req.body;
      
      if (padrao) {
        await query('UPDATE impressoras SET padrao = false');
      }
  
      const { rows } = await query(`
        UPDATE impressoras 
        SET nome = $1, ip = $2, porta = $3, tipo_conexao = $4, setor = $5, papel_mm = $6, ativa = $7, padrao = $8, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $9
        RETURNING *
      `, [nome, ip, porta, tipo_conexao, setor, papel_mm, ativa, padrao, id]);
      
      if (rows.length === 0) return res.status(404).json({ error: 'Impressora não encontrada' });
      res.json(rows[0]);
    } catch (e) {
      console.error('Erro PUT impressoras:', e);
      res.status(500).json({ error: 'Erro ao atualizar impressora' });
    }
});

// DELETE - Remover impressora
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await query('DELETE FROM impressoras WHERE id = $1 RETURNING *', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Impressora não encontrada' });
        res.json({ ok: true, removed: rows[0] });
    } catch(e) {
        console.error('Erro DELETE impressoras:', e);
        res.status(500).json({ error: 'Erro ao remover impressora' });
    }
});

// POST - Autodiscovery Local (Somente Windows) e IPs genéricos
router.post('/descobrir', async (req, res) => {
    try {
        const result = await scanImpressorasWindows();
        res.json(result);
    } catch(e) {
        console.error('Erro SCAN impressoras:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST - Teste de Conexão de uma Impressora Específica
router.post('/:id/testar-conexao', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await query('SELECT * FROM impressoras WHERE id = $1', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Impressora não encontrada' });
        
        const imp = rows[0];
        let result;
        
        if (imp.tipo_conexao === 'rede') {
            result = await pingImpressoraRede(imp.ip, imp.porta || 9100);
        } else {
            // Em impressoras locais do SO, o próprio sucesso do teste atesta a conexão
            result = { ok: true, status: 'online', message: 'Testes de porta lógica não compatíveis com filas. Utilize o Teste de Impressão.' };
        }
        
        // Atualizar status no banco
        await query('UPDATE impressoras SET ultimo_status = $1, ultima_verificacao = CURRENT_TIMESTAMP WHERE id = $2', [result.status, id]);
        
        res.json(result);
    } catch(e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// POST - Teste Físico de Papel em uma Impressora (Ticket)
router.post('/:id/testar-impressao', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await query('SELECT * FROM impressoras WHERE id = $1', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Impressora não encontrada' });
        
        const imp = rows[0];
        let result;
        
        if (imp.tipo_conexao === 'rede') {
             result = await enviarTesteRede(imp.ip, imp.porta || 9100, imp.papel_mm);
        } else if (imp.tipo_conexao === 'windows' || imp.tipo_conexao === 'usb-local') {
             // O nome da fila da impressora Windows está setado na coluna "nome" ou precisaria de uma de fila?
             // Usaremos a coluna "ip" como o nome mapeado no Spooler, que costuma vir preenchida da varredura.
             const filaSpool = imp.ip || imp.nome; 
             result = await enviarTesteWindows(filaSpool);
        } else {
             result = { ok: false, message: 'Modo de impressão não suportado pelo utilitário local da Pitombo.' };
        }
        
        if (!result.ok) {
             await query('UPDATE impressoras SET ultimo_status = $1, ultimo_erro = $2, ultima_verificacao = CURRENT_TIMESTAMP WHERE id = $3', ['erro', result.message, id]);
        }
        
        res.json(result);
    } catch(e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

module.exports = router;
