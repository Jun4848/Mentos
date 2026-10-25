const { authService } = require('../services/authService');
const { setSessionCookie } = require('../lib/session');

class AuthController {
  constructor(service = authService) {
    this.authService = service;
  }
<<<<<<< HEAD
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
<<<<<<< Updated upstream
=======
=======

  async login(req, res) {
    const { maxAge, ...data } = await this.authService.login(req.body?.id, req.body?.password);
    setSessionCookie(res, data.accessToken, maxAge);
    res.set('Cache-Control', 'no-store');
    res.json(data);
  }

  me(req, res) {
    res.json(req.account);
  }

  async logout(req, res) {
    await this.authService.logout(req.sessionToken);
    setSessionCookie(res, '', 0);
    res.status(204).end();
  }
>>>>>>> 636ef0314c1757401e7584a1d38b313850dbf995
>>>>>>> Stashed changes
}

module.exports = AuthController;
