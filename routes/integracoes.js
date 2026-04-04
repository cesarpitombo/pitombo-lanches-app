const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

const uberEatsService = require('../services/integracoes/uberEats');
const glovoService = require('../services/integracoes/glovo');
const boltService = require('../services/integracoes/bolt');

// Auto-migration for Integrations table
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS integracoes_delivery (
        id SERIAL PRIMARY KEY,
        plataforma VARCHAR(50) NOT NULL UNIQUE,
        status VARCHAR(50) DEFAULT 'nao_conectado',
        credenciais JSONB,
        token TEXT,
        refresh_token TEXT,
        webhook_url TEXT,
        is_ativo BOOLEAN DEFAULT FALSE,
        ultima_sincronizacao TIMESTAMPTZ,
        ultimo_erro TEXT,
        ultimo_pedido_externo_id VARCHAR(100),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Injetar plataformas padrão se a tabela estiver vazia
    const countRes = await query('SELECT COUNT(*) FROM integracoes_delivery');
    if (parseInt(countRes.rows[0].count) === 0) {
      await query(`
        INSERT INTO integracoes_delivery (plataforma, status) 
        VALUES 
        ('UBEREATS', 'nao_conectado'),
        ('GLOVO', 'nao_conectado'),
        ('BOLTFOOD', 'nao_conectado')
      `);
    }

    console.log('✅ Tabela integracoes_delivery carregada e verificada com sucesso.');
  } catch (err) {
    console.error('⚠️ Erro ao criar/atualizar tabela integracoes_delivery:', err.message);
  }
})();

// Rota de Teste (Ping) solicitada
router.get('/ping', (req, res) => {
  res.json({ alive: true, module: 'integrações' });
});

// GET ALL (Mascarando credenciais sensíveis)
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM integracoes_delivery ORDER BY id ASC');
    
    // Censor secrets before returning to frontend
    const sanitizedData = result.rows.map(row => {
       const clean = { ...row };
       if (clean.token) clean.token = '****' + clean.token.slice(-4);
       if (clean.refresh_token) clean.refresh_token = '****' + clean.refresh_token.slice(-4);
       if (clean.credenciais) {
          const censCred = {};
          for (let key in clean.credenciais) {
             const val = clean.credenciais[key];
             if(typeof val === 'string' && val.length > 4) {
                 censCred[key] = '****' + val.slice(-4);
             } else {
                 censCred[key] = '****';
             }
          }
          clean.credenciais = censCred;
       }
       return clean;
    });

    res.json(sanitizedData);
  } catch (err) {
    console.error('Erro GET integracoes:', err.message);
    res.status(500).json({ error: 'Erro ao buscar integrações' });
  }
});

// POST CONECTAR/CONFIGURAR (Salva as credenciais do modal e simula envio)
router.post('/:plataforma/conectar', async (req, res) => {
  const { plataforma } = req.params;
  const { credenciais, is_ativo } = req.body;
  
  try {
    const currentRes = await query('SELECT * FROM integracoes_delivery WHERE plataforma = $1', [plataforma.toUpperCase()]);
    if (currentRes.rowCount === 0) return res.status(404).json({ error: 'Plataforma não suportada' });
    
    // Em um cenário real, o adapter correspondente faria o bind
    // Ex: const adapter = IntegrationManager.getAdapter(plataforma); await adapter.connect(credenciais);
    const mockToken = 'pitombo_' + Math.random().toString(36).substr(2, 10);
    const mockWebhook = 'https://' + req.get('host') + '/api/webhooks/' + plataforma.toLowerCase();

    // Salvar no BD definindo status = 'conectado'
    const status = is_ativo !== false ? 'conectado' : 'em_configuracao';
    
    const result = await query(
      `UPDATE integracoes_delivery 
       SET credenciais = $1, is_ativo = $2, status = $3, token = $4, webhook_url = $5, atualizado_em = NOW() 
       WHERE plataforma = $6 RETURNING *`,
      [JSON.stringify(credenciais || {}), is_ativo !== undefined ? is_ativo : true, status, mockToken, mockWebhook, plataforma.toUpperCase()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro POST conectar:', err.message);
    res.status(500).json({ error: 'Erro ao salvar credenciais de integração' });
  }
});

// POST DESCONECTAR
router.post('/:plataforma/desconectar', async (req, res) => {
  const { plataforma } = req.params;
  try {
    const result = await query(
      `UPDATE integracoes_delivery 
       SET credenciais = '{}'::jsonb, is_ativo = false, status = 'nao_conectado', token = NULL, refresh_token = NULL, webhook_url = NULL, atualizado_em = NOW() 
       WHERE plataforma = $1 RETURNING *`,
      [plataforma.toUpperCase()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro POST desconectar:', err.message);
    res.status(500).json({ error: 'Erro ao desconectar integração' });
  }
});

// ==== WEBHOOKS ====

router.post('/ubereats/webhook', (req, res) => {
    const data = req.body;
    const result = uberEatsService.handleWebhook(data);
    res.json(result);
});

router.post('/glovo/webhook', (req, res) => {
    const data = req.body;
    const result = glovoService.handleWebhook(data);
    res.json(result);
});

router.post('/bolt/webhook', (req, res) => {
    const data = req.body;
    const result = boltService.handleWebhook(data);
    res.json(result);
});

module.exports = router;
