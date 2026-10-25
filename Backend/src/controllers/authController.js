const { randomBytes } = require('node:crypto');
const { pool } = require('../config/db');
const { verifyPassword } = require('../lib/password');
const { HttpError } = require('../lib/http');
const { text } = require('../lib/validation');
const { hashToken, setSessionCookie } = require('../middleware/auth');

async function login(req, res) {
  const id = text(req.body?.id, '아이디', 50);
  const password = req.body?.password;
  if (typeof password !== 'string' || !password || password.length > 128) {
    throw new HttpError(400, '아이디와 비밀번호를 확인해주세요.');
  }
  const [accounts] = await pool.execute(
    'SELECT id, name, room_number AS roomNumber, password_hash, role, status FROM user_accounts WHERE id = ?', [id],
  );
  const account = accounts[0];
  if (!await verifyPassword(password, account?.password_hash)) {
    throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  const accessToken = randomBytes(32).toString('hex');
  const hours = Number(process.env.SESSION_HOURS || 24);
  if (!Number.isFinite(hours) || hours < 1 || hours > 720) throw new Error('SESSION_HOURS는 1~720이어야 합니다.');
  const maxAge = hours * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + maxAge);
  await pool.execute('DELETE FROM login_sessions WHERE expires_at <= UTC_TIMESTAMP()');
  await pool.execute('INSERT INTO login_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)', [hashToken(accessToken), account.id, expiresAt]);
  setSessionCookie(res, accessToken, maxAge);
  res.set('Cache-Control', 'no-store');
  res.json({ id: account.id, name: account.name, roomNumber: account.roomNumber, role: account.role, status: account.status, accessToken, expiresAt: expiresAt.toISOString() });
}

function me(req, res) {
  res.json(req.account);
}

async function logout(req, res) {
  await pool.execute('DELETE FROM login_sessions WHERE token_hash = ?', [hashToken(req.sessionToken)]);
  setSessionCookie(res, '', 0);
  res.status(204).end();
}

module.exports = { login, me, logout };
