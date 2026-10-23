const { randomBytes } = require('node:crypto');
const { pool } = require('../config/db');

class LoginAttemptRepository {
  constructor(database = pool) {
    this.database = database;
  }

  async reserve(scope, keyHash, limit, windowSeconds) {
    const connection = await this.database.getConnection();
    const reservationId = randomBytes(16).toString('hex');
    try {
      await connection.beginTransaction();
      await connection.execute(`
        INSERT INTO login_attempts (scope, key_hash, attempt_count, reservation_id, expires_at)
        VALUES (?, ?, 0, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND))
        ON DUPLICATE KEY UPDATE key_hash = VALUES(key_hash)
      `, [scope, keyHash, reservationId, windowSeconds]);

      const [[entry]] = await connection.execute(`
        SELECT attempt_count, expires_at, expires_at <= UTC_TIMESTAMP(3) AS expired,
          DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND) AS next_expiry,
          GREATEST(1, CEIL(TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(3), expires_at) / 1000000)) AS retry_after
        FROM login_attempts WHERE scope = ? AND key_hash = ? FOR UPDATE
      `, [windowSeconds, scope, keyHash]);

      if (!entry.expired && entry.attempt_count >= limit) {
        await connection.commit();
        return { allowed: false, retryAfter: Number(entry.retry_after) };
      }

      const count = entry.expired ? 1 : entry.attempt_count + 1;
      const expiry = entry.expired ? entry.next_expiry : entry.expires_at;
      await connection.execute(`
        UPDATE login_attempts SET attempt_count = ?, reservation_id = ?, expires_at = ?
        WHERE scope = ? AND key_hash = ?
      `, [count, reservationId, expiry, scope, keyHash]);
      await connection.commit();
      return { allowed: true, reservationId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async clear(reservation) {
    await this.database.execute(`
      DELETE FROM login_attempts WHERE scope = ? AND key_hash = ? AND reservation_id = ?
    `, [reservation.scope, reservation.keyHash, reservation.reservationId]);
  }

  async deleteExpired() {
    await this.database.execute('DELETE FROM login_attempts WHERE expires_at <= UTC_TIMESTAMP(3) LIMIT 100');
  }
}

module.exports = LoginAttemptRepository;
