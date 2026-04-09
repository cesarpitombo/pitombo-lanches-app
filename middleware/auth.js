const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'pitombo-secret-key';

/**
 * requireAuth — verifica JWT no header Authorization.
 * Retorna 401 se ausente/inválido (nunca faz redirect — isso é responsabilidade do frontend).
 */
// TEMP: auth desabilitada para testes — reativar: remover o bloco abaixo e descomentar o original
function requireAuth(req, res, next) {
  req.user = { id: 0, funcao: 'Admin', nome: 'Teste' }; // bypass total
  return next();
}
/* ORIGINAL — descomentar para reativar:
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}
*/

/**
 * requireRole(...roles) — verifica que req.user.funcao está na lista de funções permitidas.
 * Deve ser usado APÓS requireAuth.
 *
 * Uso:  router.post('/', requireAuth, requireRole('Admin', 'Manager'), handler)
 *       router.post('/', requireAuth, requireRole(['Admin', 'Manager']), handler)
 */
function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    if (!allowed.includes(req.user.funcao)) {
      return res.status(403).json({
        error: `Acesso não autorizado. Função "${req.user.funcao}" não tem permissão para esta operação.`
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
