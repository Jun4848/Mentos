const { pool } = require('../config/db');

class SessionRepository {
  constructor(database = pool) {
    this.database = database;
  }

  async deleteExpired() {
    await this.database.execute('DELETE FROM login_sessions WHERE expires_at <= UTC_TIMESTAMP()');
  }

  async create(tokenHash, accountId, expiresAt) {
    await this.database.execute(
      'INSERT INTO login_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)',
      [tokenHash, accountId, expiresAt],
    );
  }

  async findAccountByTokenHash(tokenHash) {
    const [accounts] = await this.database.execute(`
      SELECT a.id, a.name, a.room_number AS roomNumber, a.role
      FROM login_sessions s JOIN user_accounts a ON a.id = s.account_id
      WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()
    `, [tokenHash]);
    return accounts[0];
  }

  async deleteByTokenHash(tokenHash) {
    await this.database.execute('DELETE FROM login_sessions WHERE token_hash = ?', [tokenHash]);
  }
}

module.exports = SessionRepository;
