const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'pitombo-secret-key';
const ADMIN_MANAGER = ['Admin', 'Manager'];

// ── Auto-migration ────────────────────────────────────────────────────────
(async () => {
  try {
    // Cria tabela se não existir
    await query(`
      CREATE TABLE IF NOT EXISTS equipe (
        id          SERIAL PRIMARY KEY,
        nome        VARCHAR(100) NOT NULL,
        email       VARCHAR(150),
        unidade     VARCHAR(100) DEFAULT 'pitombo-lanches',
        funcao      VARCHAR(50)  DEFAULT 'Manager',
        ativo       BOOLEAN      DEFAULT TRUE,
        senha       VARCHAR(255),
        criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Adiciona coluna senha_hash (nova) se ainda não existir
    await query(`ALTER TABLE equipe ADD COLUMN IF NOT EXISTS senha_hash VARCHAR(255)`);

    // UNIQUE index em email — só para valores não-nulos e não-vazios (preserva legado)
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS equipe_email_unique
      ON equipe (email)
      WHERE email IS NOT NULL AND email <> ''
    `);

    // Cria admin padrão se tabela estiver vazia
    const countRes = await query('SELECT COUNT(*) FROM equipe');
    if (parseInt(countRes.rows[0].count) === 0) {
      const hash = await bcrypt.hash('pitombo123', 10);
      await query(`
        INSERT INTO equipe (nome, email, unidade, funcao, ativo, senha_hash)
        VALUES ('Pitombo Lanches', 'admin@pitombo.lanches', 'pitombo-lanches', 'Admin', true, $1)
      `, [hash]);
      console.log('🔐 Admin criado: admin@pitombo.lanches / pitombo123');
    } else {
      // Garante que o admin padrão existente tenha senha_hash definida
      const adminRes = await query(
        `SELECT id, senha_hash FROM equipe WHERE email = 'admin@pitombo.lanches' LIMIT 1`
      );
      if (adminRes.rows.length > 0 && !adminRes.rows[0].senha_hash) {
        const hash = await bcrypt.hash('pitombo123', 10);
        await query('UPDATE equipe SET senha_hash = $1 WHERE email = $2',
          [hash, 'admin@pitombo.lanches']);
        console.log('🔐 Senha padrão definida: admin@pitombo.lanches → "pitombo123" (altere no painel)');
      }
    }

    console.log('✅ Tabela equipe carregada e verificada com sucesso.');
  } catch (err) {
    console.error('⚠️ Erro ao criar/atualizar tabela equipe:', err.message);
  }
})();

// ── POST /login ────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const result = await query(
      'SELECT * FROM equipe WHERE email = $1 AND ativo = true LIMIT 1',
      [email.toLowerCase().trim()]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const user = result.rows[0];

    if (!user.senha_hash) {
      return res.status(401).json({
        error: 'Este utilizador ainda não tem senha configurada. Peça ao administrador para definir uma senha.'
      });
    }

    const ok = await bcrypt.compare(senha, user.senha_hash);
    if (!ok) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const token = jwt.sign(
      { id: user.id, nome: user.nome, email: user.email, funcao: user.funcao },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    const redirectMap = {
      'Admin':      '/admin',
      'Manager':    '/admin',
      'Garçom':     '/admin',
      'Cozinheiro': '/cozinha',
      'Entregador': '/entregador'
    };

    res.json({
      token,
      redirect: redirectMap[user.funcao] || '/admin',
      funcao: user.funcao,
      nome: user.nome,
      id: user.id
    });
  } catch (err) {
    console.error('Erro POST /login:', err.message);
    res.status(500).json({ error: 'Erro interno ao processar login.' });
  }
});

// ── GET /me — valida token e retorna dados do utilizador ──────────────────
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// ── GET / — lista toda a equipe ───────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, nome, email, unidade, funcao, ativo, criado_em, atualizado_em FROM equipe ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro GET equipe:', err.message);
    res.status(500).json({ error: 'Erro ao buscar equipe.' });
  }
});

// ── POST / — criar novo utilizador ───────────────────────────────────────
router.post('/', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { nome, email, funcao, ativo, senha } = req.body;

  // Validações obrigatórias
  if (!nome || !nome.trim()) {
    return res.status(400).json({ error: 'Nome é obrigatório.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'E-mail é obrigatório.' });
  }
  if (!senha || senha.trim().length < 6) {
    return res.status(400).json({ error: 'Senha é obrigatória e deve ter no mínimo 6 caracteres.' });
  }

  const emailNorm = email.toLowerCase().trim();

  try {
    // Unicidade de e-mail
    const dup = await query(
      'SELECT id FROM equipe WHERE email = $1',
      [emailNorm]
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({ error: 'Este e-mail já está em uso por outro utilizador.' });
    }

    const senha_hash = await bcrypt.hash(senha, 10);
    const result = await query(
      `INSERT INTO equipe (nome, email, funcao, ativo, senha_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email, unidade, funcao, ativo, criado_em`,
      [
        nome.trim(),
        emailNorm,
        funcao || 'Manager',
        ativo !== undefined ? ativo : true,
        senha_hash
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro POST equipe:', err.message);
    res.status(500).json({ error: 'Erro ao criar utilizador.' });
  }
});

// ── PUT /:id — editar utilizador ─────────────────────────────────────────
router.put('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { id } = req.params;
  const { nome, email, funcao, ativo, senha } = req.body;

  try {
    const currentRes = await query('SELECT * FROM equipe WHERE id = $1', [id]);
    if (currentRes.rowCount === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }
    const u = currentRes.rows[0];

    const newNome   = nome   !== undefined ? nome.trim()                   : u.nome;
    const newEmail  = email  !== undefined ? email.toLowerCase().trim()    : u.email;
    const newFuncao = funcao !== undefined ? funcao                        : u.funcao;
    const newAtivo  = ativo  !== undefined ? ativo                        : u.ativo;

    // Unicidade de e-mail (exclui o próprio utilizador)
    if (newEmail && newEmail !== u.email) {
      const dup = await query(
        'SELECT id FROM equipe WHERE email = $1 AND id <> $2',
        [newEmail, id]
      );
      if (dup.rowCount > 0) {
        return res.status(409).json({ error: 'Este e-mail já está em uso por outro utilizador.' });
      }
    }

    // Senha: só atualiza se foi fornecida e tem >=6 chars
    let newSenhaHash = u.senha_hash;
    if (senha && senha.trim().length >= 6) {
      newSenhaHash = await bcrypt.hash(senha, 10);
    }

    const result = await query(
      `UPDATE equipe
       SET nome = $1, email = $2, funcao = $3, ativo = $4, senha_hash = $5, atualizado_em = NOW()
       WHERE id = $6
       RETURNING id, nome, email, unidade, funcao, ativo, atualizado_em`,
      [newNome, newEmail, newFuncao, newAtivo, newSenhaHash, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro PUT equipe:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar utilizador.' });
  }
});

// ── DELETE /:id ──────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { id } = req.params;
  try {
    const currentRes = await query('SELECT funcao FROM equipe WHERE id = $1', [id]);
    if (currentRes.rowCount === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }
    if (currentRes.rows[0].funcao === 'Admin') {
      return res.status(403).json({ error: 'Não é possível eliminar o Administrador Principal.' });
    }
    await query('DELETE FROM equipe WHERE id = $1', [id]);
    res.json({ message: 'Utilizador removido da equipe.' });
  } catch (err) {
    console.error('Erro DELETE equipe:', err.message);
    res.status(500).json({ error: 'Erro ao eliminar utilizador.' });
  }
});

module.exports = router;
