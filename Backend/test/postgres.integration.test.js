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
  const testDate = require('../src/lib/validation').todayInSeoul();
  t.mock.timers.enable({ apis: ['Date'], now: new Date(`${testDate}T03:45:00Z`) });
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
      assert.equal(count.n, 4);
      const [tables] = await pool.query("SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'mentos' AND c.relkind = 'r'");
      assert.equal(tables.length, 5);
      assert.ok(tables.every((row) => row.relrowsecurity));
      const [[sentinel]] = await pool.query('SELECT value FROM public.unrelated_record');
      assert.equal(sentinel.value, 'preserved');
    });

    await t.test('이력이 없으면 한국 날짜와 빈 기록을 반환한다', async () => {
      const controller = require('../src/controllers/attendanceHistoryController');
      let result;
      await controller.list({ query: {} }, { set() {}, json(value) { result = value; } });
      assert.equal(result.date, testDate);
      assert.equal(result.latestDate, null);
      assert.deepEqual(result.records, []);
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
      assert.equal(student.body.isChecked, false);
      const cookie = student.headers.get('set-cookie').split(';')[0];
      assert.equal((await request('/api/auth/me', { cookie })).body.id, 'student');
      assert.ok(!JSON.stringify(student.body).includes(hash));
    });

    await t.test('운영 시간 외 입장 토글로 실제 학생 로그인은 허용하고 출석 시간은 보호한다', async () => {
      const originalFlag = process.env.ENABLE_ATTENDANCE_TIME_TOGGLE;
      const originalMode = process.env.NODE_ENV;
      try {
        process.env.ENABLE_ATTENDANCE_TIME_TOGGLE = 'true';
        process.env.NODE_ENV = 'production';
        t.mock.timers.setTime(Date.parse(`${testDate}T05:05:00Z`));
        assert.equal((await login('student')).body.code, 'ATTENDANCE_TIME_CLOSED');
        const opened = await request('/api/attendance/preview', { method: 'PATCH', body: { enabled: true } });
        assert.equal(opened.status, 200);
        const previewCookie = opened.headers.get('set-cookie').split(';')[0];
        const signIn = await request('/api/auth/login', { method: 'POST', cookie: previewCookie, body: { id: 'student', password } });
        assert.equal(signIn.status, 200);
        const sessionCookie = signIn.headers.get('set-cookie').split(';')[0];
        const cookies = `${previewCookie}; ${sessionCookie}`;
        assert.equal((await request('/api/auth/me', { cookie: cookies })).body.id, 'student');
        assert.equal((await request('/api/attendance/schedule', { cookie: previewCookie })).body.allowed, true);
        assert.equal((await request('/api/attendance/schedule')).body.allowed, false);
        const wrongPassword = await request('/api/auth/login', { method: 'POST', cookie: previewCookie, body: { id: 'student', password: 'wrong' } });
        assert.equal(wrongPassword.status, 401);
        for (const [path, body] of [['/api/attendance/check', undefined], ['/api/attendance', { period: 'LUNCH' }]]) {
          const denied = await request(path, { method: 'POST', cookie: cookies, body });
          assert.equal(denied.status, 403);
          assert.equal(denied.body.code, 'ATTENDANCE_TIME_CLOSED');
        }
        const closed = await request('/api/attendance/preview', { method: 'PATCH', cookie: previewCookie, body: { enabled: false } });
        assert.equal(closed.body.allowed, false);
        assert.match(closed.headers.get('set-cookie'), /Max-Age=0/);
        assert.equal((await request('/api/auth/logout', { method: 'POST', cookie: cookies })).status, 204);
        t.mock.timers.setTime(Date.parse(`${testDate}T06:05:00Z`));
        assert.equal((await request('/api/attendance/schedule', { cookie: previewCookie })).body.allowed, false);
      } finally {
        if (originalFlag === undefined) delete process.env.ENABLE_ATTENDANCE_TIME_TOGGLE; else process.env.ENABLE_ATTENDANCE_TIME_TOGGLE = originalFlag;
        if (originalMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalMode;
        t.mock.timers.setTime(Date.parse(`${testDate}T03:45:00Z`));
      }
    });

    await t.test('서버리스 진입점은 첫 요청에서 DB를 준비하고 동시 세션 조회를 처리한다', () => {
      const script = `
        const assert = require('node:assert/strict');
        const http = require('node:http');
        const { once } = require('node:events');
        const handler = require('./src/server');
        const { pool } = require('./src/config/db');
        assert.equal(typeof handler, 'function');
        (async () => {
          const server = http.createServer(handler);
          server.listen(0, '127.0.0.1');
          await once(server, 'listening');
          const base = 'http://127.0.0.1:' + server.address().port;
          try {
            assert.equal((await fetch(base + '/health')).status, 200);
            const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'admin', password: ${JSON.stringify(password)} }) });
            assert.equal(login.status, 200);
            const headers = { Authorization: 'Bearer ' + (await login.json()).accessToken };
            const reads = await Promise.all(Array.from({ length: 20 }, () => fetch(base + '/api/auth/me', { headers })));
            assert.ok(reads.every(response => response.status === 200));
            assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers })).status, 204);
          } finally { await new Promise(resolve => server.close(resolve)); await pool.end(); }
        })().catch(error => { console.error(error.message); process.exitCode = 1; });
      `;
      const run = spawnSync(process.execPath, ['-e', script], {
        cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8', timeout: 30000,
        env: { ...process.env, VERCEL: '1', NODE_ENV: 'production' },
      });
      assert.equal(run.status, 0, run.stderr || run.error?.message);
    });

    await t.test('관리자 호실 현황은 실제 학생과 추가된 DB 행을 반영한다', async () => {
      const path = '/api/admin/dormitory';
      assert.equal((await request(path)).status, 401);
      assert.equal((await request(path, { token: student.body.accessToken })).status, 403);
      const initial = await request(path, { token: admin.body.accessToken });
      assert.equal(initial.body.summary.total, 2);
      assert.ok(initial.body.floors.every(floor => floor.rooms.length === 15));
      try {
        await pool.execute('INSERT INTO user_accounts (id, name, room_number, password_hash, status, is_checked) VALUES (?, ?, ?, ?, ?, TRUE)', ['roster-new', '새학생', '201', hash, '귀가']);
        const next = await request(path, { token: admin.body.accessToken });
        assert.equal(next.body.summary.total, 3);
        assert.equal(next.body.floors[0].rooms[0].students[0].attendanceStatus, 'HOME');
      } finally { await pool.execute('DELETE FROM user_accounts WHERE id = ?', ['roster-new']); }
    });

    await t.test('잔류는 체크할 수 있고 귀가·중복 요청은 차단한다', async () => {
      const path = '/api/attendance/check';
      assert.equal((await request(path, { method: 'POST' })).status, 401);
      assert.equal((await request(path, { method: 'POST', token: admin.body.accessToken })).status, 403);
      const blocked = await request(path, { method: 'POST', token: other.body.accessToken });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.message, '귀가입니다');
      assert.equal((await request(path, { method: 'POST', token: student.body.accessToken, body: { isChecked: false } })).status, 400);
      const results = await Promise.all([1, 2].map(() => request(path, { method: 'POST', token: student.body.accessToken })));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const [[saved]] = await pool.execute('SELECT is_checked FROM user_accounts WHERE id = ?', ['student']);
      assert.equal(saved.is_checked, true);
      assert.equal((await request('/api/auth/me', { token: student.body.accessToken })).body.isChecked, true);
      assert.equal((await login('student')).body.isChecked, true);
      await migrate();
      const [[preserved]] = await pool.execute('SELECT is_checked FROM user_accounts WHERE id = ?', ['student']);
      assert.equal(preserved.is_checked, true);
    });

    await t.test('이력 중복 저장 실패 시 체크 상태도 롤백한다', async () => {
      await pool.query("UPDATE user_accounts SET is_checked = FALSE WHERE id = 'student'");
      const result = await request('/api/attendance/check', { method: 'POST', token: student.body.accessToken });
      assert.equal(result.status, 409);
      const [[saved]] = await pool.query("SELECT is_checked FROM user_accounts WHERE id = 'student'");
      assert.equal(saved.is_checked, false);
      const [[count]] = await pool.query("SELECT COUNT(*)::int AS n FROM attendance_records WHERE student_id = 'student'");
      assert.equal(count.n, 1);
      await pool.query("UPDATE user_accounts SET is_checked = TRUE WHERE id = 'student'");
    });

    await t.test('점심 체크는 17:50, 저녁 체크는 22:30 정각에 초기화하고 동시 조회도 일관된다', async () => {
      const token = student.body.accessToken;
      try {
        const [[lunch]] = await pool.query("SELECT checked_until FROM user_accounts WHERE id = 'student'");
        assert.equal(lunch.checked_until.toISOString(), `${testDate}T08:50:00.000Z`);
        for (const time of ['06:00:00', '08:49:59']) {
          t.mock.timers.setTime(Date.parse(`${testDate}T${time}Z`));
          assert.equal((await request('/api/auth/me', { token })).body.isChecked, true);
        }
        t.mock.timers.setTime(Date.parse(`${testDate}T08:50:00Z`));
        const expired = await Promise.all(Array.from({ length: 10 }, () => request('/api/auth/me', { token })));
        assert.ok(expired.every(result => result.status === 200 && result.body.isChecked === false));
        assert.equal((await request('/api/admin/dormitory', { token: admin.body.accessToken })).body.summary.checked, 0);
        t.mock.timers.setTime(Date.parse(`${testDate}T09:00:00Z`));
        const checks = await Promise.all(Array.from({ length: 5 }, () => request('/api/attendance/check', { method: 'POST', token })));
        assert.deepEqual(checks.map(result => result.status).sort(), [200, 409, 409, 409, 409]);
        const [[evening]] = await pool.query("SELECT checked_until FROM user_accounts WHERE id = 'student'");
        assert.equal(evening.checked_until.toISOString(), `${testDate}T13:30:00.000Z`);
        for (const time of ['11:30:00', '13:29:59']) {
          t.mock.timers.setTime(Date.parse(`${testDate}T${time}Z`));
          assert.equal((await request('/api/auth/me', { token })).body.isChecked, true);
        }
        t.mock.timers.setTime(Date.parse(`${testDate}T13:30:00Z`));
        assert.equal((await request('/api/auth/me', { token })).body.isChecked, false);
        const [[saved]] = await pool.query("SELECT is_checked, checked_until, status FROM user_accounts WHERE id = 'student'");
        assert.deepEqual(saved, { is_checked: false, checked_until: null, status: '잔류' });
        assert.equal((await request('/api/auth/me', { token: other.body.accessToken })).body.status, '귀가');
      } finally { t.mock.timers.setTime(Date.parse(`${testDate}T03:45:00Z`)); }
    });

    await t.test('예약 초기화 SQL은 요청 없이 만료 학생만 갱신하고 관리자·미래 체크는 보존한다', async () => {
      const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '../ops/attendance-reset-cron.sql'), 'utf8');
      const command = sql.match(/\$job\$(UPDATE[\s\S]*?)\$job\$/)[1];
      try {
        for (const time of ['08:50:00', '13:30:00']) {
          const boundary = new Date(`${testDate}T${time}Z`);
          await pool.execute("UPDATE user_accounts SET is_checked = TRUE, checked_until = ? WHERE id IN ('student', 'admin')", [boundary]);
          await pool.execute("UPDATE user_accounts SET is_checked = TRUE, checked_until = ? WHERE id = 'other'", [new Date(boundary.getTime() + 60000)]);
          const timedCommand = command.replaceAll('CURRENT_TIMESTAMP', '?::timestamptz');
          await pool.execute(timedCommand, [new Date(boundary.getTime() - 1), new Date(boundary.getTime() - 1)]);
          assert.equal((await pool.query("SELECT is_checked FROM user_accounts WHERE id = 'student'"))[0][0].is_checked, true);
          await pool.execute(timedCommand, [boundary, boundary]);
          const [saved] = await pool.query('SELECT id, is_checked FROM user_accounts ORDER BY id');
          assert.deepEqual(saved, [{ id: 'admin', is_checked: true }, { id: 'other', is_checked: true }, { id: 'student', is_checked: false }]);
        }
      } finally { await pool.query('UPDATE user_accounts SET is_checked = FALSE, checked_until = NULL'); }
    });

    await t.test('관리자 날짜별 기록은 최신 날짜·과거 선택·CSV·권한·이력 보존을 지원한다', async () => {
      const path = '/api/admin/attendance-history';
      const yesterday = new Date(Date.parse(`${testDate}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      assert.equal((await request(path)).status, 401);
      assert.equal((await request(path, { token: student.body.accessToken })).status, 403);
      try {
        await pool.execute('UPDATE attendance_records SET attendance_date = ? WHERE student_id = ?', [yesterday, 'student']);
        await pool.query("UPDATE user_accounts SET name = '변경된이름', room_number = '402' WHERE id = 'student'");
        const history = await request(path, { token: admin.body.accessToken });
        assert.equal(history.status, 200);
        assert.equal(history.body.date, yesterday);
        assert.equal(history.body.latestDate, yesterday);
        assert.equal(history.body.total, 2);
        assert.ok(history.body.records.every(row => row.name === 'student' && row.roomNumber === '301'));
        assert.deepEqual(history.body.records.map(row => row.period).sort(), ['EVENING', 'LUNCH']);
        assert.equal((await request(`${path}?date=${testDate}`, { token: admin.body.accessToken })).body.total, 0);
        assert.equal((await request(`${path}?date=2026-02-30`, { token: admin.body.accessToken })).status, 400);
        const exported = await fetch(base + `${path}/export?date=${yesterday}`, { headers: { Authorization: `Bearer ${admin.body.accessToken}` } });
        assert.equal(exported.status, 200);
        assert.match(exported.headers.get('content-type'), /text\/csv/);
        assert.match(exported.headers.get('content-disposition'), new RegExp(yesterday));
        const bytes = Buffer.from(await exported.arrayBuffer());
        assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
        assert.ok(bytes.toString('utf8').includes('student'));
        assert.equal((await request(path + '/export', { token: student.body.accessToken })).status, 403);
        const reads = await Promise.all(Array.from({ length: 20 }, () => request(`${path}?date=${yesterday}`, { token: admin.body.accessToken })));
        assert.ok(reads.every(result => result.status === 200 && result.body.total === 2));
      } finally {
        await pool.execute('UPDATE attendance_records SET attendance_date = ? WHERE student_id = ?', [testDate, 'student']);
        await pool.query("UPDATE user_accounts SET name = 'student', room_number = '301' WHERE id = 'student'");
      }
    });

    await t.test('네트워크 확인 후 출석을 실제로 저장하고 중복·타인 제출을 거부한다', async () => {
      const token = student.body.accessToken;
      assert.equal((await request('/api/attendance/network', { token })).body.allowed, true);
      const result = await request('/api/attendance', { method: 'POST', token, body: { period: 'MORNING' } });
      assert.equal(result.status, 201);
      assert.ok(Number.isInteger(result.body.id));
      assert.equal((await request('/api/attendance', { method: 'POST', token, body: { period: 'MORNING' } })).status, 409);
      assert.equal((await request('/api/attendance', { method: 'POST', token, body: { period: 'EVENING', studentId: 'other' } })).status, 400);
      const resultList = await request('/api/attendance?period=MORNING', { token });
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
