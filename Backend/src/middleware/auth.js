const { authService } = require('../services/authService');
const { HttpError, asyncHandler } = require('../lib/http');
const { readToken } = require('../lib/session');

const requireAuth = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  req.account = await authService.authenticate(token);
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
