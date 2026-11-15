require('dotenv').config();

const app = require('./app');
const { checkDatabaseConnection, pool } = require('./config/db');
const { migrate } = require('./database/migrate');
const { expireAccountChecks, startCheckExpiryTimer } = require('./lib/accountChecks');

const PORT = Number(process.env.PORT) || 3000;
const DB_RETRY_ATTEMPTS = 5;
const DB_RETRY_DELAY_MS = 1000;

// 로컬 컨테이너나 원격 DB가 일시적으로 준비되지 않은 경우 재시도합니다.
async function connectToDatabaseWithRetry() {
  let lastError;

  for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await checkDatabaseConnection();
      return;
    } catch (error) {
      lastError = error;

      if (attempt < DB_RETRY_ATTEMPTS) {
        console.log(`Waiting for database... (${attempt}/${DB_RETRY_ATTEMPTS})`);
        await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
      }
    }
  }

  throw lastError;
}

let databaseReady;

function ensureDatabaseReady() {
  if (!databaseReady) {
    databaseReady = (async () => {
      await connectToDatabaseWithRetry();
      await migrate();
      await expireAccountChecks();
      console.log('Database connection successful');
    })().catch(error => {
      databaseReady = undefined;
      throw error;
    });
  }
  return databaseReady;
}

async function handleServerlessRequest(req, res) {
  try {
    await ensureDatabaseReady();
  } catch (error) {
    console.error('Database initialization failed:', error.code || error.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ message: '데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' }));
    return;
  }
  app(req, res);
}

async function startServer() {
  try {
    await ensureDatabaseReady();
  } catch (error) {
    const errorMessage = error.message || error.code || '알 수 없는 오류';
    console.error('Database connection failed:', errorMessage);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  const stopCheckExpiryTimer = startCheckExpiryTimer();
  const server = app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      stopCheckExpiryTimer();
      server.close(() => pool.end().then(() => { process.exitCode = 0; }));
    });
  }
}

// Vercel은 DB 초기화가 끝나기 전에도 요청 처리 함수를 확인할 수 있어야 합니다.
if (process.env.VERCEL === '1') module.exports = handleServerlessRequest;
else startServer();
