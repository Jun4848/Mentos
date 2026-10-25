const { createHash } = require('node:crypto');
const { pool } = require('../config/db');
const { HttpError, asyncHandler } = require('../lib/http');

const COOKIE_NAME = 'mentos_session';
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function readToken(req) {
  const authorization = req.get('authorization');
  if (authorization) return /^Bearer ([a-f0-9]{64})$/i.exec(authorization)?.[1] || null;
  const cookies = (req.get('cookie') || '').split(';').map((part) => part.trim());
  const value = cookies.find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

const requireAuth = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (!token) throw new HttpError(401, '로그인이 필요합니다.');
  const [accounts] = await pool.execute(`
    SELECT a.id, a.name, a.room_number AS roomNumber, a.role, a.status
    FROM login_sessions s JOIN user_accounts a ON a.id = s.account_id
    WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()
  `, [hashToken(token)]);
  if (!accounts.length) throw new HttpError(401, '세션이 만료되었습니다. 다시 로그인해주세요.');
  req.account = accounts[0];
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

function setSessionCookie(res, token, maxAge) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', path: '/', maxAge,
  });
}

module.exports = { requireAuth, requireRole, hashToken, setSessionCookie };
