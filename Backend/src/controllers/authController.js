const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { pool } = require('../config/db');

const deriveKey = promisify(scrypt);

function getCredentials(body) {
  if (typeof body?.id !== 'string' || typeof body?.password !== 'string') return null;

  const id = body.id.trim();
  const { password } = body;
  if (!id || id.length > 50 || !password || password.length > 128) return null;

  return { id, password };
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await deriveKey(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function passwordMatches(password, savedHash) {
  const [salt, hashHex] = savedHash.split(':');
  if (!salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== 64) return false;

  const actual = await deriveKey(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

async function register(req, res) {
  const credentials = getCredentials(req.body);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const roomNumber = String(req.body?.roomNumber ?? '').trim();
  if (!credentials || !name || name.length > 100 || !/^\d{1,10}$/.test(roomNumber)) {
    return res.status(400).json({ message: '이름, 아이디, 비밀번호, 방 호수를 확인해주세요.' });
  }

  try {
    const passwordHash = await hashPassword(credentials.password);
    await pool.execute('INSERT INTO users (id, name, room_number, password_hash) VALUES (?, ?, ?, ?)', [
      credentials.id,
      name,
      roomNumber,
      passwordHash,
    ]);
    return res.status(201).json({ id: credentials.id, name, roomNumber });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '이미 사용 중인 아이디입니다.' });
    }
    console.error('Register failed:', error);
    return res.status(500).json({ message: '계정을 저장할 수 없습니다.' });
  }
}

async function login(req, res) {
  const credentials = getCredentials(req.body);
  if (!credentials) {
    return res.status(400).json({ message: '아이디와 비밀번호를 확인해주세요.' });
  }

  try {
    const [users] = await pool.execute(
      'SELECT id, name, room_number, password_hash FROM users WHERE id = ?',
      [credentials.id],
    );
    const user = users[0];
    if (!user || !(await passwordMatches(credentials.password, user.password_hash))) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    return res.json({ id: user.id, name: user.name, roomNumber: user.room_number });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ message: '로그인할 수 없습니다.' });
  }
}

module.exports = { register, login };
