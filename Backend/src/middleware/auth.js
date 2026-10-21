const { pool } = require('../config/db');
const { HttpError, asyncHandler } = require('../lib/http');

const requireAuth = asyncHandler(async (req, res, next) => {
  if (!req.session?.accountId) throw new HttpError(401, '로그인이 필요합니다.');
  const [accounts] = await pool.execute(
    'SELECT id, name, room_number AS roomNumber, role FROM user_accounts WHERE id = ?',
    [req.session.accountId],
  );
  if (!accounts.length) throw new HttpError(401, '계정을 찾을 수 없습니다. 다시 로그인해주세요.');
  req.account = accounts[0];
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
