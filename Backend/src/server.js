require('dotenv').config();

const app = require('./app');
const { checkDatabaseConnection, pool } = require('./config/db');
const { migrate } = require('./database/migrate');

const PORT = Number(process.env.PORT) || 3000;
const DB_RETRY_ATTEMPTS = 5;
const DB_RETRY_DELAY_MS = 1000;

// MySQL 컨테이너가 준비되는 데 시간이 걸릴 수 있어 몇 번 재시도합니다.
async function connectToDatabaseWithRetry() {
  let lastError;

  for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await checkDatabaseConnection();
      return;
    } catch (error) {
      lastError = error;

      if (attempt < DB_RETRY_ATTEMPTS) {
        console.log(`Waiting for MySQL... (${attempt}/${DB_RETRY_ATTEMPTS})`);
        await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
      }
    }
  }

  throw lastError;
}

async function startServer() {
  try {
    await connectToDatabaseWithRetry();
    await migrate();
    console.log('MySQL connection successful');
  } catch (error) {
    const errorMessage = error.message || error.code || '알 수 없는 오류';
    console.error('MySQL connection failed:', errorMessage);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  const server = app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(() => pool.end().then(() => { process.exitCode = 0; }));
    });
  }
}

startServer();
