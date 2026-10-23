require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mysql = require('mysql2/promise');

const database = `mentos_test_login_${randomBytes(8).toString('hex')}`;
const config = {
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, timezone: 'Z',
};
process.env.DB_NAME = database;
const { pool } = require('../src/config/db');
const { migrate } = require('../src/database/migrate');
const app = require('../src/app');
const { AuthService } = require('../src/services/authService');
const { LoginProtection } = require('../src/services/loginProtection');
const LoginAttemptRepository = require('../src/repositories/loginAttemptRepository');
const UserRepository = require('../src/repositories/userRepository');
const SessionRepository = require('../src/repositories/sessionRepository');
const fixture = require('./fixtures/legacyAccount');

test('실제 MySQL: 로그인 무차별 대입 방어', async (t) => {
  let connection;
  let server;
  let base;
  const createProtection = () => new LoginProtection(new LoginAttemptRepository(pool));
  const createAuth = () => new AuthService(new UserRepository(pool), new SessionRepository(pool), createProtection());
  async function login(id = 'guard-student', password = 'wrong', headers = {}) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ id, password }),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  async function scenario(name, callback) {
    await t.test(name, async (context) => {
      await pool.query('DELETE FROM login_attempts');
      await pool.query('DELETE FROM login_sessions');
      await callback(context);
    });
  }

  try {
    connection = await mysql.createConnection(config);
    await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await migrate();
    for (const id of ['guard-student', 'other-student', 'Café-Student']) {
      await pool.execute('INSERT INTO user_accounts (id, name, room_number, password_hash) VALUES (?, ?, ?, ?)',
        [id, '방어 테스트 학생', '301', fixture.password_hash]);
    }
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    await scenario('001이 적용된 기존 DB에도 002만 추가하고 계정 구조와 데이터를 유지한다', async () => {
      const [[before]] = await pool.query('SHOW CREATE TABLE user_accounts');
      const [accountsBefore] = await pool.query('SELECT * FROM user_accounts ORDER BY id');
      await pool.query('DROP TABLE login_attempts');
      await pool.execute('DELETE FROM schema_migrations WHERE version = ?', ['002_login_attempts']);
      await migrate();
      await migrate();
      const [[after]] = await pool.query('SHOW CREATE TABLE user_accounts');
      const [accountsAfter] = await pool.query('SELECT * FROM user_accounts ORDER BY id');
      const [versions] = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
      assert.deepEqual(after, before);
      assert.deepEqual(accountsAfter, accountsBefore);
      assert.deepEqual(versions.map((row) => row.version), ['001_initial', '002_login_attempts']);
    });

    await scenario('5회 실패 후 정답도 429이며 계정 표기 변경으로 우회할 수 없다', async () => {
      for (const id of ['Café-Student', 'cafe-student', ' CAFE-STUDENT ', 'café-student', 'CAFE-STUDENT']) {
        const result = await login(id);
        assert.equal(result.status, 401);
        assert.deepEqual(result.body, { message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      }
      const [[before]] = await pool.query("SELECT * FROM login_attempts WHERE scope = 'ACCOUNT'");
      const blocked = await login('cafe-student', fixture.password);
      assert.equal(blocked.status, 429);
      assert.deepEqual(blocked.body, { message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' });
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
      assert.ok(Number(blocked.headers.get('retry-after')) <= 900);
      assert.equal(blocked.headers.get('set-cookie'), null);
      assert.equal(blocked.headers.get('cache-control'), 'no-store');
      const [[after]] = await pool.query("SELECT * FROM login_attempts WHERE scope = 'ACCOUNT'");
      assert.deepEqual(after, before);
      assert.equal(after.attempt_count, 5);
      assert.match(after.key_hash, /^[a-f0-9]{64}$/);
      assert.equal((await login('other-student', fixture.password)).status, 200);
    });

    await scenario('정상 로그인은 계정 실패 횟수를 초기화하고 IP 횟수는 유지한다', async () => {
      for (let round = 0; round < 2; round++) {
        for (let i = 0; i < 4; i++) assert.equal((await login()).status, 401);
        assert.equal((await login('guard-student', fixture.password)).status, 200);
        const [[count]] = await pool.query("SELECT COUNT(*) AS n FROM login_attempts WHERE scope = 'ACCOUNT'");
        assert.equal(count.n, 0);
      }
      const [[ip]] = await pool.query("SELECT attempt_count FROM login_attempts WHERE scope = 'IP'");
      assert.equal(ip.attempt_count, 10);
    });

    await scenario('IP를 바꾸거나 인증 서비스 인스턴스를 새로 만들어도 계정 제한이 공유된다', async () => {
      for (let i = 1; i <= 5; i++) {
        await createProtection().checkIp(`203.0.113.${i}`);
        await assert.rejects(createAuth().login('guard-student', 'wrong'), { status: 401 });
      }
      await createProtection().checkIp('203.0.113.6');
      await assert.rejects(createAuth().login('guard-student', fixture.password), { status: 429 });
      const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM login_sessions');
      assert.equal(count.n, 0);
    });

    await scenario('동시 요청도 5회만 검증하며 만료된 제한은 자동 해제한다', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => login()));
      assert.deepEqual(results.map((result) => result.status).sort(), [401, 401, 401, 401, 401, 429, 429, 429, 429, 429, 429, 429]);
      assert.equal((await login('guard-student', fixture.password)).status, 429);
      await pool.query('UPDATE login_attempts SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND');
      assert.equal((await login('guard-student', fixture.password)).status, 200);
      const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM login_sessions');
      assert.equal(count.n, 1);
    });

    await scenario('없는 계정도 동일하게 실패하고 제한한다', async () => {
      for (let i = 0; i < 5; i++) {
        assert.equal((await login(i % 2 ? ' MISSING-STUDENT ' : 'missing-student')).status, 401);
      }
      assert.equal((await login('missing-student', fixture.password)).status, 429);
      const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM login_sessions');
      assert.equal(count.n, 0);
    });

    await scenario('IP 제한은 잘못된 입력에도 적용되고 X-Forwarded-For 위조로 우회하지 못한다', async () => {
      assert.equal(app.get('trust proxy'), false);
      for (let i = 0; i < 20; i++) {
        assert.equal((await login('', '', { 'X-Forwarded-For': `203.0.113.${i}` })).status, 400);
      }
      const [[before]] = await pool.query("SELECT * FROM login_attempts WHERE scope = 'IP'");
      const blocked = await login('other-student', fixture.password, { 'X-Forwarded-For': '198.51.100.1' });
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
      const [[after]] = await pool.query("SELECT * FROM login_attempts WHERE scope = 'IP'");
      assert.deepEqual(after, before);
      assert.equal(after.attempt_count, 20);
      await pool.query('UPDATE login_attempts SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND');
      assert.equal((await login('', '')).status, 400);
    });

    await scenario('여러 서버 인스턴스가 공유하는 IP 제한은 재시작 후에도 유지된다', async () => {
      for (let i = 0; i < 20; i++) await createProtection().checkIp('203.0.113.10');
      await assert.rejects(createProtection().checkIp('203.0.113.10'), { status: 429 });
      await createProtection().checkIp('203.0.113.11');
    });

    await scenario('늦게 끝난 정상 로그인은 이후 시도나 새 제한 구간을 지우지 못한다', async () => {
      const protection = createProtection();
      const earlier = await protection.reserveAccount('guard-student');
      const later = await protection.reserveAccount('guard-student');
      await protection.clearAccount(earlier);
      const [[entry]] = await pool.query("SELECT attempt_count FROM login_attempts WHERE scope = 'ACCOUNT'");
      assert.equal(entry.attempt_count, 2);
      await pool.query('UPDATE login_attempts SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND');
      const nextWindow = await protection.reserveAccount('guard-student');
      await protection.clearAccount(later);
      const [[current]] = await pool.query("SELECT reservation_id, attempt_count FROM login_attempts WHERE scope = 'ACCOUNT'");
      assert.equal(current.reservation_id, nextWindow.reservationId);
      assert.equal(current.attempt_count, 1);
      await protection.clearAccount(nextWindow);
      const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM login_attempts');
      assert.equal(count.n, 0);
    });

    await scenario('제한 저장소 장애 시 로그인을 허용하지 않고 일반 500으로 응답한다', async (t) => {
      const failure = new Error('private database detail');
      failure.code = 'ER_TEST_UNAVAILABLE';
      t.mock.method(pool, 'getConnection', async () => { throw failure; });
      const result = await login('guard-student', fixture.password);
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, { message: '요청을 처리할 수 없습니다.' });
      assert.equal(result.headers.get('set-cookie'), null);
      const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM login_sessions');
      assert.equal(count.n, 0);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    if (connection) {
      assert.match(database, /^mentos_test_login_[a-f0-9]{16}$/);
      await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
      await connection.end();
    }
  }
});
