const { authService } = require('../services/authService');
const { HttpError, asyncHandler } = require('../lib/http');
const { readToken } = require('../lib/session');

const requireAuth = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
<<<<<<< HEAD
  if (!token) throw new HttpError(401, '로그인이 필요합니다.');
  const [accounts] = await pool.execute(`
    SELECT a.id, a.name, a.room_number AS roomNumber, a.role, a.status
    FROM login_sessions s JOIN user_accounts a ON a.id = s.account_id
    WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()
  `, [hashToken(token)]);
  if (!accounts.length) throw new HttpError(401, '세션이 만료되었습니다. 다시 로그인해주세요.');
  req.account = accounts[0];
=======
  req.account = await authService.authenticate(token);
>>>>>>> 636ef0314c1757401e7584a1d38b313850dbf995
  req.sessionToken = token;
  res.set('Cache-Control', 'no-store');
  next();
});

function requireRole(role) {
  return (req, res, next) => {
    if (req.account.role !== role) return next(new HttpError(403, '이 작업을 수행할 권한이 없습니다.'));
    next();
  };
}

module.exports = { requireAuth, requireRole };
