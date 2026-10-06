require('dotenv').config();

const app = require('./app');
const { checkDatabaseConnection } = require('./config/db');

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
    console.log('MySQL connection successful');
  } catch (error) {
    // 개발환경에서는 DB가 꺼져 있어도 기본 API를 확인할 수 있도록 서버를 계속 실행합니다.
    const errorMessage = error.message || error.code || '알 수 없는 오류';
    console.error('MySQL connection failed:', errorMessage);
  }

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
