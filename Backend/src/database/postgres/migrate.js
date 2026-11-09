const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function migratePostgres(database) {
  const sql = await fs.readFile(path.join(__dirname, '001_initial.sql'), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
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
    const [versions] = await connection.execute('SELECT checksum FROM mentos.schema_migrations WHERE version = ?', ['001_initial']);
    if (!versions.length) {
      await connection.query(sql);
      await connection.execute('INSERT INTO mentos.schema_migrations (version, checksum) VALUES (?, ?)', ['001_initial', checksum]);
      console.log('PostgreSQL migration 001_initial applied');
    } else if (versions[0].checksum !== checksum) {
      throw new Error('적용된 PostgreSQL 마이그레이션과 파일이 다릅니다. 새 마이그레이션으로 변경해주세요.');
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
