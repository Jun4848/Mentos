const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const deriveKey = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await deriveKey(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored = '') {
  const [salt, hash] = String(stored).split(':');
  const valid = Boolean(salt && salt.length <= 128 && /^[a-f0-9]{128}$/i.test(hash || ''));
  const actual = await deriveKey(password, valid ? salt : 'mentos-invalid-account', 64);
  const expected = valid ? Buffer.from(hash, 'hex') : Buffer.alloc(64);
  return timingSafeEqual(actual, expected) && valid;
}

module.exports = { hashPassword, verifyPassword };
