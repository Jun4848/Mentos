const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { backfillCheckExpiry } = require('../../lib/accountChecks');

async function migratePostgres(database) {
  const migrations = await Promise.all(['001_initial', '002_account_checked', '003_check_expiry', '004_attendance_history'].map(async (version) => {
    const sql = await fs.readFile(path.join(__dirname, `${version}.sql`), 'utf8');
    return { version, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT pg_advisory_xact_lock(17620701)');
    await connection.query('CREATE SCHEMA IF NOT EXISTS mentos');
    await connection.query(`CREATE TABLE IF NOT EXISTS mentos.schema_migrations (
      version VARCHAR(50) PRIMARY KEY, checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await connection.query('REVOKE ALL ON SCHEMA mentos FROM PUBLIC');
    await connection.query('ALTER TABLE mentos.schema_migrations ENABLE ROW LEVEL SECURITY');
    await connection.query('REVOKE ALL ON mentos.schema_migrations FROM PUBLIC');
    for (const { version, sql, checksum } of migrations) {
      const [versions] = await connection.execute('SELECT checksum FROM mentos.schema_migrations WHERE version = ?', [version]);
      if (!versions.length) {
        await connection.query(sql);
        if (version === '003_check_expiry') await backfillCheckExpiry(connection);
        await connection.execute('INSERT INTO mentos.schema_migrations (version, checksum) VALUES (?, ?)', [version, checksum]);
        console.log(`PostgreSQL migration ${version} applied`);
      } else if (versions[0].checksum !== checksum) {
        throw new Error('적용된 PostgreSQL 마이그레이션과 파일이 다릅니다. 새 마이그레이션으로 변경해주세요.');
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { migratePostgres };
