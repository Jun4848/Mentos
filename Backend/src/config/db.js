const mysql = require('mysql2/promise');
const { createPostgresPool } = require('./postgres');
const dialect = process.env.DATABASE_URL ? 'postgres' : 'mysql';

// .env에 작성한 정보로 MySQL 연결 풀을 만듭니다.
const pool = dialect === 'postgres' ? createPostgresPool() : mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
  dateStrings: ['DATE'],
});

if (dialect === 'mysql') pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

// 서버를 시작할 때 데이터베이스 연결 상태를 확인합니다.
async function checkDatabaseConnection() {
  const connection = await pool.getConnection();

  try {
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  checkDatabaseConnection,
  dialect,
  currentTimestamp: dialect === 'postgres' ? 'CURRENT_TIMESTAMP' : 'UTC_TIMESTAMP()',
  returningId: dialect === 'postgres' ? ' RETURNING id' : '',
};
