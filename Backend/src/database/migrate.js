const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../config/db');

async function tableExists(connection, name) {
  const [rows] = await connection.execute(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [name],
  );
  return rows.length > 0;
}

async function migrate(database = pool) {
  const connection = await database.getConnection();
  let locked = false;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK(CONCAT('mentos:', LEFT(DATABASE(), 50)), 30) AS acquired");
    if (Number(lock.acquired) !== 1) throw new Error('DB 마이그레이션 잠금을 얻지 못했습니다.');
    locked = true;
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    const [versions] = await connection.execute('SELECT version FROM schema_migrations WHERE version = ?', ['001_initial']);
    if (!versions.length) {
      if (await tableExists(connection, 'users')) {
        if (await tableExists(connection, 'user_accounts')) {
          throw new Error('users와 user_accounts가 모두 있습니다. 백업 후 계정 충돌을 먼저 확인해주세요.');
        }
        await connection.query('RENAME TABLE users TO user_accounts');
      }
      const sql = await fs.readFile(path.join(__dirname, '001_initial.sql'), 'utf8');
      for (const statement of sql.split(';').map((item) => item.trim()).filter(Boolean)) {
        await connection.query(statement);
      }
      const [columns] = await connection.query('SHOW COLUMNS FROM user_accounts');
      const names = new Set(columns.map((column) => column.Field));
      if (!names.has('role')) {
        await connection.query("ALTER TABLE user_accounts ADD COLUMN role ENUM('STUDENT', 'ADMIN') NOT NULL DEFAULT 'STUDENT'");
      }
      if (!names.has('updated_at')) {
        await connection.query('ALTER TABLE user_accounts ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
      }
      // 예전 choice의 '잔류' 등은 외출 신청과 의미가 달라 임의로 변환하지 않습니다.
      // 원본 테이블과 모든 기록을 보관합니다. DDL 중단 후 다시 실행해도 안전합니다.
      for (const source of ['home_stay', 'leave_requests']) {
        if (await tableExists(connection, source)) {
          if (await tableExists(connection, `legacy_${source}`)) {
            throw new Error(`${source}와 legacy_${source}가 모두 있습니다. 기존 기록을 확인해주세요.`);
          }
          await connection.query(`RENAME TABLE \`${source}\` TO \`legacy_${source}\``);
          console.log(`기존 ${source} 기록은 legacy_${source}에 보관했습니다.`);
        }
      }
      await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', ['001_initial']);
      console.log('Database migration 001_initial applied');
    }
    const [sessionVersions] = await connection.execute('SELECT version FROM schema_migrations WHERE version = ?', ['002_express_sessions']);
    if (!sessionVersions.length) {
      await connection.query(`CREATE TABLE IF NOT EXISTS express_sessions (
        sid_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        account_id VARCHAR(50) NULL,
        data JSON NOT NULL,
        expires_at DATETIME NOT NULL,
        INDEX idx_express_sessions_expiry (expires_at),
        INDEX idx_express_sessions_account (account_id),
        CONSTRAINT fk_express_sessions_account FOREIGN KEY (account_id) REFERENCES user_accounts(id)
          ON UPDATE CASCADE ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
      await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', ['002_express_sessions']);
      console.log('Database migration 002_express_sessions applied');
    }
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK(CONCAT('mentos:', LEFT(DATABASE(), 50)))");
    connection.release();
  }
}

module.exports = { migrate };
