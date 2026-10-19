const { scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { pool } = require('../config/db');

const deriveKey = promisify(scrypt);

async function login(req, res) {
  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  const password = req.body?.password;
  if (!id || id.length > 50 || typeof password !== 'string' || !password || password.length > 128) {
    return res.status(400).json({ message: '아이디와 비밀번호를 확인해주세요.' });
  }

  try {
    const [users] = await pool.execute(
      'SELECT id, name, room_number, password_hash FROM users WHERE id = ?',
      [id],
    );
    const user = users[0];
    if (!user) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const [salt, hashHex] = user.password_hash.split(':');
    const expected = Buffer.from(hashHex || '', 'hex');
    const actual = salt && expected.length === 64
      ? await deriveKey(password, salt, expected.length)
      : null;
    if (!actual || !timingSafeEqual(actual, expected)) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    return res.json({ id: user.id, name: user.name, roomNumber: user.room_number });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ message: '로그인할 수 없습니다.' });
  }
}

module.exports = { login };
