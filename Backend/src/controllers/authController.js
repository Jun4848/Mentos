const { pool } = require('../config/db');
const { verifyPassword } = require('../lib/password');
const { HttpError } = require('../lib/http');
const { text } = require('../lib/validation');

async function login(req, res) {
  const id = text(req.body?.id, '아이디', 50);
  const password = req.body?.password;
  if (typeof password !== 'string' || !password || password.length > 128) {
    throw new HttpError(400, '아이디와 비밀번호를 확인해주세요.');
  }
  const [accounts] = await pool.execute(
    'SELECT id, name, room_number AS roomNumber, password_hash, role FROM user_accounts WHERE id = ?', [id],
  );
  const account = accounts[0];
  if (!await verifyPassword(password, account?.password_hash)) {
    throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.accountId = account.id;
  await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));

  res.set('Cache-Control', 'no-store');
  res.json({ id: account.id, name: account.name, roomNumber: account.roomNumber, role: account.role });
}

function me(req, res) {
  res.json(req.account);
}

async function logout(req, res) {
  await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
  res.clearCookie('mentos_session', { path: '/' });
  res.set('Cache-Control', 'no-store');
  res.status(204).end();
}

module.exports = { login, me, logout };
