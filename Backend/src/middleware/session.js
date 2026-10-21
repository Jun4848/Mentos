const { createHash } = require('node:crypto');
const session = require('express-session');
const { pool } = require('../config/db');

const hashId = (id) => createHash('sha256').update(id).digest('hex');

class MySqlSessionStore extends session.Store {
  constructor(database = pool) {
    super();
    this.database = database;
    this.cleanup = setInterval(() => this.prune().catch((error) => console.error('Session cleanup failed:', error)), 60 * 60 * 1000);
    this.cleanup.unref();
  }

  get(id, callback) {
    this.database.execute(
      'SELECT data FROM express_sessions WHERE sid_hash = ? AND expires_at > UTC_TIMESTAMP()', [hashId(id)],
    ).then(([rows]) => {
      const data = rows[0]?.data;
      callback(null, data ? (typeof data === 'string' ? JSON.parse(data) : data) : null);
    }).catch(callback);
  }

  set(id, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires) : new Date(Date.now() + 86400000);
    this.database.execute(`INSERT INTO express_sessions (sid_hash, account_id, data, expires_at)
      VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE account_id = VALUES(account_id),
      data = VALUES(data), expires_at = VALUES(expires_at)`,
    [hashId(id), value.accountId || null, JSON.stringify(value), expires])
      .then(() => callback()).catch(callback);
  }

  destroy(id, callback = () => {}) {
    this.database.execute('DELETE FROM express_sessions WHERE sid_hash = ?', [hashId(id)])
      .then(() => callback()).catch(callback);
  }

  touch(id, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires) : new Date(Date.now() + 86400000);
    this.database.execute('UPDATE express_sessions SET expires_at = ? WHERE sid_hash = ?', [expires, hashId(id)])
      .then(() => callback()).catch(callback);
  }

  prune() {
    return this.database.query('DELETE FROM express_sessions WHERE expires_at <= UTC_TIMESTAMP()');
  }
}

function createSessionMiddleware(database = pool) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('replace_with_')) {
    throw new Error('SESSION_SECRET은 32자 이상의 임의 문자열이어야 합니다.');
  }
  const hours = Number(process.env.SESSION_HOURS || 24);
  if (!Number.isFinite(hours) || hours < 1 || hours > 720) throw new Error('SESSION_HOURS는 1~720이어야 합니다.');

  return session({
    name: 'mentos_session',
    secret,
    store: new MySqlSessionStore(database),
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: hours * 60 * 60 * 1000,
    },
  });
}

module.exports = { MySqlSessionStore, createSessionMiddleware, hashId };
