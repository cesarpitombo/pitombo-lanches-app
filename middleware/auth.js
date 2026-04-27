const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'pitombo-secret-key';
const AUTH_BYPASS = String(process.env.AUTH_BYPASS || '1') === '1';

/**
 * requireAuth — JWT de usuário humano no header Authorization: Bearer <token>.
 * Em dev (AUTH_BYPASS=1 — default) injeta um Admin fake para não travar o frontend atual.
 * Em produção (AUTH_BYPASS=0) valida o JWT emitido por /api/equipe/login.
 */
function requireAuth(req, res, next) {
  if (AUTH_BYPASS) {
    req.user = { id: 0, funcao: 'Admin', nome: 'Dev (AUTH_BYPASS)', loja_id: 1 };
    return next();
  }
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { loja_id: 1, ...payload };
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

/**
 * requireRole(...roles) — usado após requireAuth.
 */
function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    if (!allowed.includes(req.user.funcao)) {
      return res.status(403).json({
        error: `Acesso não autorizado. Função "${req.user.funcao}" não tem permissão.`
      });
    }
    next();
  };
}

/**
 * hashDeviceToken — SHA-256 do token plano. Armazenamos só o hash em devices.token_hash.
 */
function hashDeviceToken(plain) {
  return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

/**
 * requireDeviceAuth — valida header X-Device-Token contra devices.token_hash.
 * Injeta req.device = { id, loja_id, nome, setores_vinculados }.
 */
async function requireDeviceAuth(req, res, next) {
  // Support multiple token sources: header, Authorization, or query param (for SSE)
  let raw = (req.headers['x-device-token'] || '').trim();
  if (!raw) {
    const authHeader = (req.headers['authorization'] || '').trim();
    if (authHeader.startsWith('DeviceToken ')) raw = authHeader.slice(12).trim();
  }
  if (!raw && req.query.token) raw = req.query.token.trim();
  if (!raw) return res.status(401).json({ error: 'Device token ausente.' });
  try {
    const hash = hashDeviceToken(raw);
    const { rows } = await query(
      `SELECT id, loja_id, nome, setores_vinculados, ativo
         FROM devices WHERE token_hash = $1 LIMIT 1`,
      [hash]
    );
    if (!rows.length || !rows[0].ativo) {
      return res.status(401).json({ error: 'Device token inválido ou revogado.' });
    }
    req.device = rows[0];
    // best-effort update of last seen ip
    query('UPDATE devices SET ultimo_ip=$1 WHERE id=$2', [req.ip, rows[0].id]).catch(() => {});
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Erro validando device token.' });
  }
}

module.exports = { requireAuth, requireRole, requireDeviceAuth, hashDeviceToken, JWT_SECRET };
