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
const { hashToken } = require('../src/lib/session');
const { todayInSeoul } = require('../src/lib/validation');
const app = require('../src/app');
const legacyAccount = require('./fixtures/legacyAccount');
const { seedTestData } = require('../scripts/seed');
const { AuthService } = require('../src/services/authService');
const UserRepository = require('../src/repositories/userRepository');
const SessionRepository = require('../src/repositories/sessionRepository');
const LoginAttemptRepository = require('../src/repositories/loginAttemptRepository');
const { LoginProtection } = require('../src/services/loginProtection');

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
        assert.equal(tables.length, 6);
      } finally { await freshPool.end(); }
    });

    await t.test('현재 로컬 DB와 같은 테스트 계정 seed', async (t) => {
      const seedPool = mysql.createPool({ ...config, database: freshDatabase });
      const seedAccounts = [
        { id: '26_1208', name: '오건우', roomNumber: '403', role: 'STUDENT' },
        { id: '26_1211', name: '이준혁', roomNumber: '406', role: 'STUDENT' },
        { id: '26_1213', name: '정영준', roomNumber: '409', role: 'STUDENT' },
      ];
      const ids = seedAccounts.map((account) => account.id);
      const cli = (...args) => spawnSync(process.execPath, ['scripts/seed.js', ...args], {
        encoding: 'utf8', env: { ...process.env, DB_NAME: freshDatabase },
      });
      try {
        await t.test('CLI가 기존 계정을 보존하고 로컬 DB와 같은 학생 3명만 생성한다', async () => {
          const existingHash = await hashPassword('existing-password!');
          await seedPool.execute('INSERT INTO user_accounts (id, name, room_number, password_hash) VALUES (?, ?, ?, ?)',
            ['existing-user', '보존할 계정', '501', existingHash]);
          const result = cli();
          assert.equal(result.status, 0, result.stderr);
          assert.match(result.stdout, /학생 계정 3개/);
          const [[existing]] = await seedPool.query("SELECT password_hash FROM user_accounts WHERE id = 'existing-user'");
          assert.equal(existing.password_hash, existingHash);
          const [accounts] = await seedPool.execute(
            'SELECT id, name, room_number AS roomNumber, role FROM user_accounts WHERE id IN (?, ?, ?) ORDER BY id', ids,
          );
          assert.deepEqual(accounts, seedAccounts);
          const [[counts]] = await seedPool.query(`SELECT
            (SELECT COUNT(*) FROM user_accounts WHERE role = 'ADMIN') AS admins,
            (SELECT COUNT(*) FROM attendance_records) AS attendance,
            (SELECT COUNT(*) FROM leave_applications) AS leaves,
            (SELECT COUNT(*) FROM login_sessions) AS sessions`);
          assert.deepEqual(counts, { admins: 0, attendance: 0, leaves: 0, sessions: 0 });
          const protection = new LoginProtection(new LoginAttemptRepository(seedPool));
          const auth = new AuthService(new UserRepository(seedPool), new SessionRepository(seedPool), protection);
          for (const expected of seedAccounts) {
            const account = await auth.login(expected.id, '1234');
            assert.equal(account.name, expected.name);
            assert.equal(account.roomNumber, expected.roomNumber);
            assert.equal(account.role, expected.role);
            await auth.logout(account.accessToken);
          }
        });

        await t.test('재실행·동시 실행에도 중복되지 않는다', async () => {
          const results = await Promise.all([seedTestData(seedPool), seedTestData(seedPool)]);
          for (const result of results) {
            assert.equal(result.accounts, 0);
            assert.deepEqual(result.skippedAccounts, []);
          }
          const [[count]] = await seedPool.query('SELECT COUNT(*) AS n FROM user_accounts');
          assert.equal(count.n, 4);
        });

        await t.test('생성 도중 실패하면 앞서 추가한 계정도 롤백한다', async () => {
          await seedPool.execute('DELETE FROM user_accounts WHERE id IN (?, ?, ?)', ids);
          await seedPool.query(`CREATE TRIGGER seed_test_failure BEFORE INSERT ON user_accounts
            FOR EACH ROW BEGIN
              IF NEW.id = '26_1213' THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'seed rollback test';
              END IF;
            END`);
          try {
            await assert.rejects(seedTestData(seedPool), /seed rollback test/);
            const [[count]] = await seedPool.query('SELECT COUNT(*) AS n FROM user_accounts');
            assert.equal(count.n, 1);
          } finally {
            await seedPool.query('DROP TRIGGER seed_test_failure');
            await seedTestData(seedPool);
          }
        });

        await t.test('수정한 비밀번호·이름·호수·권한을 덮어쓰지 않는다', async () => {
          const changedHash = await hashPassword('changed-password!');
          await seedPool.execute("UPDATE user_accounts SET password_hash = ? WHERE id = '26_1208'", [changedHash]);
          await seedPool.query("UPDATE user_accounts SET name = '수정한 이름', room_number = '601' WHERE id = '26_1211'");
          await seedPool.query("UPDATE user_accounts SET role = 'ADMIN' WHERE id = '26_1213'");
          const result = await seedTestData(seedPool);
          assert.deepEqual(result.skippedAccounts, ['26_1211', '26_1213']);
          const [[student]] = await seedPool.query("SELECT password_hash FROM user_accounts WHERE id = '26_1208'");
          const [[changed]] = await seedPool.query("SELECT name, room_number FROM user_accounts WHERE id = '26_1211'");
          const [[admin]] = await seedPool.query("SELECT role FROM user_accounts WHERE id = '26_1213'");
          assert.equal(student.password_hash, changedHash);
          assert.deepEqual(changed, { name: '수정한 이름', room_number: '601' });
          assert.equal(admin.role, 'ADMIN');
        });

        await t.test('잘못된 옵션과 운영 환경에서는 데이터를 추가하지 않는다', async () => {
          assert.equal(cli('--unknown').status, 1);
          const result = spawnSync(process.execPath, ['scripts/seed.js'], {
            encoding: 'utf8', env: { ...process.env, DB_NAME: freshDatabase, NODE_ENV: 'production' },
          });
          assert.equal(result.status, 1);
          assert.match(result.stderr, /운영 환경/);
          const [[count]] = await seedPool.query('SELECT COUNT(*) AS n FROM user_accounts');
          assert.equal(count.n, 4);
        });
      } finally {
        await seedPool.end();
      }
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
      student = await login('student1');
      other = await login('student2');
      admin = await login('admin');
      assert.equal(student.status, 200);
      assert.equal(student.body.roomNumber, '301');
      assert.equal(student.body.role, 'STUDENT');
      assert.deepEqual(Object.keys(student.body).sort(), ['accessToken', 'expiresAt', 'id', 'name', 'role', 'roomNumber']);
      assert.equal(student.headers.get('cache-control'), 'no-store');
      assert.match(student.body.accessToken, /^[a-f0-9]{64}$/);
      assert.equal(new Date(student.body.expiresAt).toISOString(), student.body.expiresAt);
      assert.ok(!JSON.stringify(student.body).includes('password'));
      const cookie = student.headers.get('set-cookie');
      assert.match(cookie, /^mentos_session=/);
      assert.match(cookie, /Path=\//);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.equal((await request('/api/auth/me', { token: student.body.accessToken })).body.id, 'student1');
      const me = await request('/api/auth/me', { headers: { Cookie: cookie.split(';')[0] } });
      assert.equal(me.status, 200);
      assert.deepEqual(me.body, { id: 'student1', name: '학생1', roomNumber: '301', role: 'STUDENT' });
      const [[session]] = await pool.execute('SELECT token_hash FROM login_sessions WHERE account_id = ?', ['student1']);
      assert.equal(session.token_hash, hashToken(student.body.accessToken));
      assert.notEqual(session.token_hash, student.body.accessToken);
    });

    await t.test('기존 고정 scrypt 해시와 4자리 비밀번호가 변경 없이 로그인된다', async () => {
      await pool.execute('INSERT INTO user_accounts (id, name, room_number, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [legacyAccount.id, legacyAccount.name, legacyAccount.roomNumber, legacyAccount.password_hash, legacyAccount.role]);
      const response = await login(` ${legacyAccount.id} `, legacyAccount.password);
      assert.equal(response.status, 200);
      assert.equal(response.body.id, legacyAccount.id);
      const [[saved]] = await pool.execute('SELECT password_hash FROM user_accounts WHERE id = ?', [legacyAccount.id]);
      assert.equal(saved.password_hash, legacyAccount.password_hash);
      const logout = await request('/api/auth/logout', { method: 'POST', token: response.body.accessToken });
      assert.equal(logout.status, 204);
      assert.equal(logout.body, null);
      assert.match(logout.headers.get('set-cookie'), /mentos_session=;/);
      assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
      const expired = await request('/api/auth/me', { token: response.body.accessToken });
      assert.equal(expired.status, 401);
      assert.deepEqual(expired.body, { message: '세션이 만료되었습니다. 다시 로그인해주세요.' });
    });

    await t.test('로그인과 세션 조회의 DB 오류는 상세 정보 없이 기존 500 형식으로 응답한다', async (t) => {
      const failure = new Error('private database detail');
      failure.code = 'ER_TEST_UNAVAILABLE';
      t.mock.method(pool, 'execute', async () => { throw failure; });
      const response = await login('student1');
      assert.equal(response.status, 500);
      assert.deepEqual(response.body, { message: '요청을 처리할 수 없습니다.' });
      assert.equal(response.headers.get('set-cookie'), null);
      const me = await request('/api/auth/me', { token: student.body.accessToken });
      assert.equal(me.status, 500);
      assert.deepEqual(me.body, { message: '요청을 처리할 수 없습니다.' });
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
      await pool.query("DELETE FROM login_attempts WHERE scope = 'IP'");
      for (let i = 0; i < 20; i++) {
        assert.equal((await request('/api/auth/login', { method: 'POST', body: {} })).status, 400);
      }
      const last = await request('/api/auth/login', { method: 'POST', body: {} });
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
