const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const { bindParameters } = require('../src/config/postgres');

test('PostgreSQL 바인딩은 SQL 리터럴 안의 물음표를 바꾸지 않는다', () => {
  assert.equal(bindParameters(`SELECT '?' AS "?", name FROM t WHERE id = ? AND name = ?`),
    `SELECT '?' AS "?", name FROM t WHERE id = $1 AND name = $2`);
});

test('실제 PostgreSQL: 마이그레이션, 로그인, IP 출석, 신청과 세션', {
  skip: !process.env.POSTGRES_TEST_URL && 'POSTGRES_TEST_URL에 로컬 테스트 PostgreSQL 주소를 지정하세요.',
}, async (t) => {
  const source = new URL(process.env.POSTGRES_TEST_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname), '통합 테스트는 로컬 PostgreSQL에서만 실행합니다.');
  const database = `mentos_test_${randomBytes(8).toString('hex')}`;
  const connection = new Client({ connectionString: source.toString() });
  await connection.connect();
  const target = new URL(source);
  target.pathname = `/${database}`;
  let pool;
  let server;
  try {
    await connection.query(`CREATE DATABASE "${database}"`);
    process.env.DATABASE_URL = target.toString();
    process.env.DATABASE_SSL = 'false';
    process.env.ATTENDANCE_ALLOWED_IPS = '127.0.0.1,::1';
    process.env.TRUSTED_PROXY_IPS = '';
    ({ pool } = require('../src/config/db'));
    const { migrate } = require('../src/database/migrate');
    const { hashPassword } = require('../src/lib/password');
    const { hashToken } = require('../src/middleware/auth');
    const { todayInSeoul } = require('../src/lib/validation');
    const app = require('../src/app');
    await pool.query('CREATE TABLE public.unrelated_record (value TEXT)');
    await pool.query("INSERT INTO public.unrelated_record VALUES ('preserved')");

    await t.test('마이그레이션을 반복해도 데이터와 다른 스키마를 보존하고 RLS를 켠다', async () => {
      await Promise.all([migrate(), migrate()]);
      const [[count]] = await pool.query('SELECT COUNT(*)::int AS n FROM schema_migrations');
      assert.equal(count.n, 1);
      const [tables] = await pool.query("SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'mentos' AND c.relkind = 'r'");
      assert.equal(tables.length, 5);
      assert.ok(tables.every((row) => row.relrowsecurity));
      const [[sentinel]] = await pool.query('SELECT value FROM public.unrelated_record');
      assert.equal(sentinel.value, 'preserved');
    });

    const password = 'postgres-integration-password!';
    const hash = await hashPassword(password);
    for (const [id, role, status] of [['student', 'STUDENT', '잔류'], ['other', 'STUDENT', '귀가'], ['admin', 'ADMIN', '']]) {
      await pool.execute('INSERT INTO user_accounts (id, name, room_number, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [id, id, '301', hash, role, status]);
    }
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { method = 'GET', token, cookie, body } = {}) {
      const response = await fetch(`${base}${path}`, {
        method, headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
        }, body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
    }
    const login = (id, suppliedPassword = password) => request('/api/auth/login', { method: 'POST', body: { id, password: suppliedPassword } });
    let student;
    let other;
    let admin;
    await t.test('기존 scrypt 계정으로 로그인하고 세션·응답 필드 이름을 보존한다', async () => {
      assert.equal((await request('/health')).status, 200);
      assert.equal((await request('/api/auth/me')).status, 401);
      assert.equal((await login('student', 'wrong')).status, 401);
      assert.equal((await login("' OR 1=1 --")).status, 401);
      student = await login('student'); other = await login('other'); admin = await login('admin');
      assert.equal(student.status, 200);
      assert.equal(student.body.roomNumber, '301');
      assert.equal(student.body.status, '잔류');
      assert.equal(student.body.role, 'STUDENT');
      const cookie = student.headers.get('set-cookie').split(';')[0];
      assert.equal((await request('/api/auth/me', { cookie })).body.id, 'student');
      assert.ok(!JSON.stringify(student.body).includes(hash));
    });

    await t.test('네트워크 확인 후 출석을 실제로 저장하고 중복·타인 제출을 거부한다', async () => {
      const token = student.body.accessToken;
      assert.equal((await request('/api/attendance/network', { token })).body.allowed, true);
      const result = await request('/api/attendance', { method: 'POST', token, body: { period: 'LUNCH' } });
      assert.equal(result.status, 201);
      assert.ok(Number.isInteger(result.body.id));
      assert.equal((await request('/api/attendance', { method: 'POST', token, body: { period: 'LUNCH' } })).status, 409);
      assert.equal((await request('/api/attendance', { method: 'POST', token, body: { period: 'EVENING', studentId: 'other' } })).status, 400);
      const resultList = await request('/api/attendance', { token });
      assert.equal(resultList.body.records[0].studentId, 'student');
      assert.equal(resultList.body.records[0].date, todayInSeoul());
      assert.equal(resultList.body.records[0].roomNumber, '301');
      assert.match(resultList.body.records[0].checkedAt, /Z$/);
      assert.equal((await request('/api/attendance?studentId=other', { token })).status, 403);
    });

    await t.test('관리자 UPSERT와 역할 검사를 지원한다', async () => {
      const body = { studentId: 'student', date: todayInSeoul(), period: 'EVENING', status: 'EXCUSED' };
      assert.equal((await request('/api/attendance', { method: 'PUT', token: student.body.accessToken, body })).status, 403);
      assert.equal((await request('/api/attendance', { method: 'PUT', token: admin.body.accessToken, body })).status, 200);
      assert.equal((await request('/api/attendance', { method: 'PUT', token: admin.body.accessToken, body: { ...body, status: 'ABSENT' } })).status, 200);
      const [[saved]] = await pool.execute("SELECT status FROM attendance_records WHERE period = 'EVENING' AND student_id = ?", ['student']);
      assert.equal(saved.status, 'ABSENT');
    });

    let leaveId;
    await t.test('외출·귀가 신청의 ID, UTC 시간, 중복·동시 신청 처리를 보존한다', async () => {
      const body = { type: 'OUTING', startsAt: '2030-10-20T18:00:00+09:00', endsAt: '2030-10-20T20:00:00+09:00', reason: '발표' };
      const options = { method: 'POST', token: student.body.accessToken, body };
      const [first, second] = await Promise.all([request('/api/leaves', options), request('/api/leaves', options)]);
      assert.deepEqual([first.status, second.status].sort(), [201, 409]);
      leaveId = [first, second].find((result) => result.status === 201).body.id;
      assert.ok(Number.isInteger(leaveId));
      const list = (await request('/api/leaves?type=OUTING', { token: student.body.accessToken })).body.applications;
      assert.equal(list[0].startsAt, '2030-10-20T09:00:00.000Z');
      assert.equal(list[0].studentId, 'student');
      assert.equal(list[0].roomNumber, '301');
      assert.equal((await request('/api/leaves', { ...options, body: { ...body, type: 'HOME_VISIT', startsAt: '2030-11-20T18:00:00+09:00', endsAt: '2030-11-22T20:00:00+09:00' } })).status, 201);
    });

    await t.test('신청 승인·취소와 타인 권한 검사를 보존한다', async () => {
      const approve = { method: 'PATCH', token: student.body.accessToken, body: { status: 'APPROVED' } };
      assert.equal((await request(`/api/leaves/${leaveId}/status`, approve)).status, 403);
      assert.equal((await request(`/api/leaves/${leaveId}/status`, { ...approve, token: admin.body.accessToken })).status, 200);
      assert.equal((await request(`/api/leaves/${leaveId}/status`, { ...approve, token: other.body.accessToken, body: { status: 'CANCELLED' } })).status, 403);
      assert.equal((await request(`/api/leaves/${leaveId}/status`, { ...approve, body: { status: 'CANCELLED' } })).status, 200);
      assert.equal((await request(`/api/leaves/${leaveId}/status`, { ...approve, token: admin.body.accessToken })).status, 409);
    });

    await t.test('계정 CLI는 PostgreSQL에 해시를 저장하고 중복 계정을 보호한다', async () => {
      const args = ['scripts/create-account.js', '--id', 'cli', '--name', 'CLI', '--room', '302'];
      const run = () => spawnSync(process.execPath, args, { env: process.env, input: `${password}\n`, encoding: 'utf8' });
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!result.stdout.includes(password));
      assert.equal(run().status, 1);
      assert.equal((await login('cli')).status, 200);
    });

    await t.test('만료·로그아웃은 DB의 세션을 즉시 무효화한다', async () => {
      await pool.execute("UPDATE login_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE token_hash = ?", [hashToken(other.body.accessToken)]);
      assert.equal((await request('/api/auth/me', { token: other.body.accessToken })).status, 401);
      assert.equal((await request('/api/auth/logout', { method: 'POST', token: student.body.accessToken })).status, 204);
      assert.equal((await request('/api/auth/me', { token: student.body.accessToken })).status, 401);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
    await connection.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await connection.end();
  }
});
