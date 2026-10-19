const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function checkDatabaseConnection() {
  const connection = await pool.getConnection();

  try {
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}

async function createUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL DEFAULT '',
      room_number VARCHAR(10) NOT NULL DEFAULT '',
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [nameColumns] = await pool.query("SHOW COLUMNS FROM users LIKE 'name'");
  if (nameColumns.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT '' AFTER id");
  }

  const [roomColumns] = await pool.query("SHOW COLUMNS FROM users LIKE 'room_number'");
  if (roomColumns.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN room_number VARCHAR(10) NOT NULL DEFAULT '' AFTER name");
  }
}

async function createAttendanceTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS home_stay (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      choice VARCHAR(10) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_home_stay_student_period (student_id, start_date, end_date),
      CONSTRAINT chk_home_stay_choice CHECK (choice IN ('귀가', '잔류')),
      CONSTRAINT fk_home_stay_student FOREIGN KEY (student_id)
        REFERENCES users(id) ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      type VARCHAR(10) NOT NULL,
      start_at DATETIME NOT NULL,
      end_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_leave_type CHECK (type IN ('외출', '외박')),
      CONSTRAINT fk_leave_student FOREIGN KEY (student_id)
        REFERENCES users(id) ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

module.exports = {
  pool,
  checkDatabaseConnection,
  createUsersTable,
  createAttendanceTables,
};
