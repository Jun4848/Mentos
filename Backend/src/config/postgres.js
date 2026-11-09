const fs = require('node:fs');
const { Pool, TypeOverrides } = require('pg');

// 애플리케이션 쿼리의 바인딩만 변환합니다. 따옴표 안의 ?는 그대로 둡니다.
function bindParameters(sql) {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g,
    (part) => part === '?' ? `$${++index}` : part);
}

function createPostgresPool(env = process.env) {
  const url = new URL(env.DATABASE_URL);
  const sslDisabled = env.DATABASE_SSL === 'false';
  if (sslDisabled && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('원격 PostgreSQL 연결에는 DATABASE_SSL=true가 필요합니다.');
  }
  // URL의 sslmode가 CA 검증 설정을 덮어쓰지 않게 한 곳에서 TLS를 설정합니다.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const types = new TypeOverrides();
  types.setTypeParser(1082, (value) => value); // DATE는 MySQL과 동일하게 YYYY-MM-DD 문자열
  const native = new Pool({
    connectionString: url.toString(),
    ssl: sslDisabled ? false : {
      rejectUnauthorized: true,
      ...(env.DATABASE_SSL_CA_FILE ? { ca: fs.readFileSync(env.DATABASE_SSL_CA_FILE, 'utf8') } : {}),
    },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    types,
  });
  native.on('error', (error) => console.error('PostgreSQL idle connection failed:', error.code || 'connection error'));

  function wrap(client) {
    async function query(sql, values = []) {
      const result = await client.query(values.length ? bindParameters(sql) : sql, values);
      if (Array.isArray(result)) return [[]]; // 여러 DDL문을 한 트랜잭션 안에서 실행
      return [result.command === 'SELECT' ? result.rows : {
        affectedRows: result.rowCount, insertId: result.rows[0]?.id,
      }];
    }
    return {
      query, execute: query,
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK'),
      release: () => client.release(),
    };
  }
  const initialized = new WeakSet();
  async function getConnection() {
    const client = await native.connect();
    try {
      // Session pooler에서도 시작 옵션 지원 여부에 의존하지 않고 세션을 초기화합니다.
      if (!initialized.has(client)) {
        await client.query("SET search_path TO mentos, pg_catalog; SET TIME ZONE 'UTC'");
        initialized.add(client);
      }
      return wrap(client);
    } catch (error) {
      client.release(error);
      throw error;
    }
  }
  async function query(sql, values) {
    const client = await getConnection();
    try { return await client.query(sql, values); }
    finally { client.release(); }
  }
  return { query, execute: query, getConnection, end: () => native.end() };
}

module.exports = { createPostgresPool, bindParameters };
