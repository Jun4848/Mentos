require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');

// 실제 앱 DB는 사용하지 않습니다. 매 실행마다 별도의 임시 DB를 만들고 그 DB만 삭제합니다.
const database = `mentos_test_${randomBytes(8).toString('hex')}`;
const freshDatabase = `${database}_fresh`;
const config = {
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, timezone: 'Z', dateStrings: ['DATE'],
};
process.env.DB_NAME = database;
const { pool } = require('../src/config/db');
const { migrate } = require('../src/database/migrate');
const { hashPassword } = require('../src/lib/password');
const { hashToken } = require('../src/middleware/auth');
const { todayInSeoul } = require('../src/lib/validation');
const app = require('../src/app');

const password = 'integration-password!';

test('실제 MySQL: 마이그레이션, 로그인, 출결, 외출/귀가 권한과 영속성', async (t) => {
  let adminConnection;
  let server;
  let base;
  let student;
  let other;
  let admin;
  async function request(path, { method = 'GET', token, body, headers = {} } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
  }
  const login = (id, suppliedPassword = password) => request('/api/auth/login', { method: 'POST', body: { id, password: suppliedPassword } });

  try {
    adminConnection = await mysql.createConnection(config);
    await adminConnection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await adminConnection.query(`CREATE DATABASE \`${freshDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);

    await t.test('새 DB 초기화와 반복 실행', async () => {
      const freshPool = mysql.createPool({ ...config, database: freshDatabase });
      try {
        await migrate(freshPool);
        await migrate(freshPool);
        const [[count]] = await freshPool.query('SELECT COUNT(*) AS n FROM schema_migrations');
        assert.equal(count.n, 2);
        const [tables] = await freshPool.query('SHOW TABLES');
        assert.equal(tables.length, 5);
      } finally { await freshPool.end(); }
    });

    await t.test('001 적용 DB에 status를 추가하고 기존 계정과 재실행 시 상태를 보존한다', async () => {
      const freshPool = mysql.createPool({ ...config, database: freshDatabase });
      try {
        // 임시 DB를 001만 적용된 구조로 되돌려 기존 설치의 업그레이드를 검증합니다.
        await freshPool.query('ALTER TABLE user_accounts DROP COLUMN status');
        await freshPool.execute('DELETE FROM schema_migrations WHERE version = ?', ['002_account_status']);
        const hash = await hashPassword(password);
        await freshPool.execute('INSERT INTO user_accounts (id, name, room_number, password_hash) VALUES (?, ?, ?, ?)',
          ['existing-student', '기존학생', '401', hash]);

        await migrate(freshPool);
        const [[account]] = await freshPool.query("SELECT * FROM user_accounts WHERE id = 'existing-student'");
        assert.equal(account.name, '기존학생');
        assert.equal(account.room_number, '401');
        assert.equal(account.password_hash, hash);
        assert.equal(account.status, '');
        const [[column]] = await freshPool.query("SHOW COLUMNS FROM user_accounts LIKE 'status'");
        assert.equal(column.Type, 'varchar(15)');
        assert.equal(column.Null, 'NO');
        assert.equal(column.Default, '');
        await assert.rejects(freshPool.query("UPDATE user_accounts SET status = NULL WHERE id = 'existing-student'"), { code: 'ER_BAD_NULL_ERROR' });
        await assert.rejects(freshPool.execute("UPDATE user_accounts SET status = ? WHERE id = 'existing-student'", ['x'.repeat(16)]), { code: 'ER_DATA_TOO_LONG' });

        await freshPool.execute("UPDATE user_accounts SET status = ? WHERE id = 'existing-student'", ['잔류']);
        // 컬럼 추가 후 버전 기록 전에 중단된 경우도 기존 값을 유지해야 합니다.
        await freshPool.execute('DELETE FROM schema_migrations WHERE version = ?', ['002_account_status']);
        await migrate(freshPool);
        await migrate(freshPool);
        const [[saved]] = await freshPool.query("SELECT status FROM user_accounts WHERE id = 'existing-student'");
        assert.equal(saved.status, '잔류');
        const [[count]] = await freshPool.query('SELECT COUNT(*) AS n FROM schema_migrations');
        assert.equal(count.n, 2);
      } finally { await freshPool.end(); }
    });

    await t.test('기존 계정/해시/호수와 원본 신청 데이터를 보존한다', async () => {
      await pool.query(`CREATE TABLE users (
        id VARCHAR(50) PRIMARY KEY, name VARCHAR(100) NOT NULL, room_number VARCHAR(10) NOT NULL,
        password_hash VARCHAR(255) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
      const hash = await hashPassword(password);
      await pool.execute('INSERT INTO users (id, name, room_number, password_hash) VALUES (?, ?, ?, ?)', ['student1', '학생1', '301', hash]);
      await pool.query(`CREATE TABLE home_stay (id INT PRIMARY KEY, student_id VARCHAR(50), choice VARCHAR(10),
        FOREIGN KEY (student_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
      await pool.query("INSERT INTO home_stay VALUES (1, 'student1', '잔류')");
      await pool.query('CREATE TABLE leave_requests (id INT PRIMARY KEY, type VARCHAR(10))');
      await pool.query("INSERT INTO leave_requests VALUES (1, 'OUTING')");
      await migrate();
      await migrate();
      const [[account]] = await pool.execute('SELECT * FROM user_accounts WHERE id = ?', ['student1']);
      assert.equal(account.password_hash, hash);
      assert.equal(account.room_number, '301');
      assert.equal(account.role, 'STUDENT');
      assert.equal(account.status, '');
      const [[stay]] = await pool.query('SELECT choice FROM legacy_home_stay');
      assert.equal(stay.choice, '잔류');
      const [[oldLeave]] = await pool.query('SELECT type FROM legacy_leave_requests');
      assert.equal(oldLeave.type, 'OUTING');
      await pool.execute('INSERT INTO user_accounts (id, name, room_number, password_hash, role) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
        ['student2', '학생2', '302', hash, 'STUDENT', 'admin', '관리자', '', hash, 'ADMIN']);
    });

    await t.test('계정 생성 CLI는 비밀번호를 해시하고 중복 계정을 덮어쓰지 않는다', async () => {
      const args = ['scripts/create-account.js', '--id', 'cli-student', '--name', 'CLI학생', '--room', '303'];
      const run = (input) => spawnSync(process.execPath, args, { input, encoding: 'utf8', env: process.env });
      const created = run(`${password}\n`);
      assert.equal(created.status, 0, created.stderr);
      assert.ok(!created.stdout.includes(password));
      const [[account]] = await pool.query("SELECT password_hash FROM user_accounts WHERE id = 'cli-student'");
      assert.notEqual(account.password_hash, password);
      assert.equal(run('new-password!\n').status, 1);
      const [[again]] = await pool.query("SELECT password_hash FROM user_accounts WHERE id = 'cli-student'");
      assert.equal(again.password_hash, account.password_hash);
    });

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    await t.test('인증 없는 조회, SQL 삽입, 잘못된 비밀번호와 잘못된 입력을 거부한다', async () => {
      assert.equal((await request('/health')).status, 200);
      for (const path of ['/api/auth/me', '/api/attendance', '/api/leaves']) assert.equal((await request(path)).status, 401);
      assert.equal((await login('student1', 'wrong')).status, 401);
      assert.equal((await login("' OR 1=1 --")).status, 401);
      assert.equal((await login('missing')).status, 401);
      assert.equal((await request('/api/auth/login', { method: 'POST', body: {} })).status, 400);
      const invalidJson = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
      assert.equal(invalidJson.status, 400);
    });

    await t.test('로그인은 세션을 발급하며 쿠키와 Bearer를 모두 지원한다', async () => {
      await pool.execute('UPDATE user_accounts SET status = ? WHERE id = ?', ['잔류', 'student1']);
      await pool.execute('UPDATE user_accounts SET status = ? WHERE id = ?', ['귀가', 'student2']);
      student = await login('student1');
      other = await login('student2');
      admin = await login('admin');
      assert.equal(student.status, 200);
      assert.equal(student.body.roomNumber, '301');
      assert.equal(student.body.role, 'STUDENT');
      assert.equal(student.body.status, '잔류');
      assert.equal(other.body.status, '귀가');
      assert.equal(admin.body.status, '');
      assert.ok(!JSON.stringify(student.body).includes('password'));
      const cookie = student.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.equal((await request('/api/auth/me', { token: student.body.accessToken })).body.id, 'student1');
      const restored = await request('/api/auth/me', { headers: { Cookie: cookie.split(';')[0] } });
      assert.equal(restored.status, 200);
      assert.equal(restored.body.status, student.body.status);
      const [[session]] = await pool.execute('SELECT token_hash FROM login_sessions WHERE account_id = ?', ['student1']);
      assert.equal(session.token_hash, hashToken(student.body.accessToken));
      assert.notEqual(session.token_hash, student.body.accessToken);
    });

    await t.test('허용된 프론트 출처만 쿠키 인증 API를 호출할 수 있다', async () => {
      const allowed = await request('/api/auth/me', { token: student.body.accessToken, headers: { Origin: 'http://localhost:5173' } });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
      assert.equal((await request('/api/auth/me', { token: student.body.accessToken, headers: { Origin: 'https://untrusted.example' } })).status, 403);
    });

    await t.test('학생은 오늘 본인의 출석만 제출하고 같은 시간대 중복은 거부한다', async () => {
      const token = student.body.accessToken;
      const first = await request('/api/attendance', { method: 'POST', token, body: { period: 'LUNCH' } });
      assert.equal(first.status, 201);
      assert.equal(first.body.date, todayInSeoul());
      assert.equal((await request('/api/attendance', { method: 'POST', token, body: { period: 'LUNCH' } })).status, 409);
      assert.equal((await request('/api/attendance', { method: 'POST', token, body: { period: 'EVENING', status: 'EXCUSED', studentId: 'student2' } })).status, 400);
      assert.equal((await request('/api/attendance?studentId=student2', { token })).status, 403);
      assert.equal((await request('/api/attendance', { token: other.body.accessToken })).body.records.length, 0);
      const records = (await request('/api/attendance', { token })).body.records;
      assert.equal(records.length, 1);
      assert.equal(records[0].roomNumber, '301');
    });

    await t.test('관리자만 출결 상태를 수정하며 학생 제출로 덮어쓸 수 없다', async () => {
      const body = { studentId: 'student1', date: todayInSeoul(), period: 'EVENING', status: 'EXCUSED' };
      assert.equal((await request('/api/attendance', { method: 'PUT', token: student.body.accessToken, body })).status, 403);
      assert.equal((await request('/api/attendance', { method: 'PUT', token: admin.body.accessToken, body })).status, 200);
      assert.equal((await request('/api/attendance', { method: 'POST', token: student.body.accessToken, body: { period: 'EVENING' } })).status, 409);
      const rows = (await request('/api/attendance?period=EVENING', { token: admin.body.accessToken })).body.records;
      assert.equal(rows[0].status, 'EXCUSED');
      assert.equal(rows[0].recordedBy, 'admin');
      assert.equal((await request('/api/attendance', { method: 'PUT', token: admin.body.accessToken, body: { ...body, status: 'INVALID' } })).status, 400);
    });

    let leaveId;
    await t.test('외출과 귀가를 구분하고 시간대와 시간 순서를 검증한다', async () => {
      const token = student.body.accessToken;
      const body = { type: 'OUTING', startsAt: '2030-10-20T18:00:00+09:00', endsAt: '2030-10-20T20:00:00+09:00', reason: '외출' };
      assert.equal((await request('/api/leaves', { method: 'POST', token, body: { ...body, endsAt: body.startsAt } })).status, 400);
      assert.equal((await request('/api/leaves', { method: 'POST', token, body: { ...body, startsAt: '2030-10-20T18:00:00' } })).status, 400);
      const created = await request('/api/leaves', { method: 'POST', token, body });
      assert.equal(created.status, 201);
      leaveId = created.body.id;
      assert.equal((await request('/api/leaves', { method: 'POST', token, body })).status, 409);
      const home = await request('/api/leaves', { method: 'POST', token, body: { ...body, type: 'HOME_VISIT', startsAt: '2030-10-21T18:00:00+09:00', endsAt: '2030-10-23T20:00:00+09:00' } });
      assert.equal(home.status, 201);
      assert.equal(home.body.type, 'HOME_VISIT');
      const saved = (await request('/api/leaves?type=OUTING', { token })).body.applications;
      assert.equal(saved[0].startsAt, '2030-10-20T09:00:00.000Z');
      assert.equal(saved[0].status, 'PENDING');
    });

    await t.test('학생은 타인의 신청 조회·취소와 승인 처리를 할 수 없다', async () => {
      assert.equal((await request('/api/leaves?studentId=student1', { token: other.body.accessToken })).status, 403);
      assert.equal((await request('/api/leaves', { token: other.body.accessToken })).body.applications.length, 0);
      assert.equal((await request(`/api/leaves/${leaveId}/status`, { method: 'PATCH', token: other.body.accessToken, body: { status: 'CANCELLED' } })).status, 403);
      assert.equal((await request(`/api/leaves/${leaveId}/status`, { method: 'PATCH', token: student.body.accessToken, body: { status: 'APPROVED' } })).status, 403);
      assert.equal((await request(`/api/leaves/${leaveId}/status`, { method: 'PATCH', token: admin.body.accessToken, body: { status: 'APPROVED' } })).status, 200);
      const approved = (await request('/api/leaves?status=APPROVED', { token: admin.body.accessToken })).body.applications;
      assert.equal(approved[0].reviewedBy, 'admin');
      assert.equal((await request(`/api/leaves/${leaveId}/status`, { method: 'PATCH', token: student.body.accessToken, body: { status: 'CANCELLED' } })).status, 200);
      assert.equal((await request(`/api/leaves/${leaveId}/status`, { method: 'PATCH', token: admin.body.accessToken, body: { status: 'APPROVED' } })).status, 409);
    });

    await t.test('동시에 겹치는 신청을 보내도 하나만 저장한다', async () => {
      const options = { method: 'POST', token: other.body.accessToken, body: { type: 'OUTING', startsAt: '2030-11-01T18:00:00+09:00', endsAt: '2030-11-01T20:00:00+09:00' } };
      const results = await Promise.all([request('/api/leaves', options), request('/api/leaves', options)]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    });

    await t.test('DB가 직접 중복 출결, 잘못된 기간과 없는 학생 참조를 거부한다', async () => {
      await assert.rejects(pool.execute(`INSERT INTO attendance_records (student_id, attendance_date, period, recorded_by) VALUES ('student1', ?, 'LUNCH', 'student1')`, [todayInSeoul()]), { code: 'ER_DUP_ENTRY' });
      await assert.rejects(pool.query("INSERT INTO leave_applications (student_id, type, starts_at, ends_at) VALUES ('student1', 'OUTING', '2030-01-02', '2030-01-01')"), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      await assert.rejects(pool.query("INSERT INTO leave_applications (student_id, type, starts_at, ends_at) VALUES ('missing', 'OUTING', '2030-01-01', '2030-01-02')"), { code: 'ER_NO_REFERENCED_ROW_2' });
    });

    await t.test('만료 세션과 로그아웃한 토큰을 거부한다', async () => {
      await pool.execute('UPDATE login_sessions SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE token_hash = ?', [hashToken(other.body.accessToken)]);
      assert.equal((await request('/api/auth/me', { token: other.body.accessToken })).status, 401);
      assert.equal((await request('/api/auth/logout', { method: 'POST', token: student.body.accessToken })).status, 204);
      assert.equal((await request('/api/auth/me', { token: student.body.accessToken })).status, 401);
    });

    await t.test('로그인 반복 요청을 제한한다', async () => {
      let last;
      for (let i = 0; i < 21; i++) last = await request('/api/auth/login', { method: 'POST', body: {} });
      assert.equal(last.status, 429);
      assert.ok(Number(last.headers.get('retry-after')) > 0);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    if (adminConnection) {
      for (const name of [database, freshDatabase]) {
        assert.match(name, /^mentos_test_[a-f0-9]{16}(?:_fresh)?$/);
        await adminConnection.query(`DROP DATABASE IF EXISTS \`${name}\``);
      }
      await adminConnection.end();
    }
  }
});
