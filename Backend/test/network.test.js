const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createIpMatcher, normalizeIp } = require('../src/lib/ip');

// 실제 DB 없이 HTTP 경로, 인증/권한, 프록시 판별과 출석 저장 호출을 검증합니다.
process.env.ATTENDANCE_ALLOWED_IPS = '192.0.2.10,2001:db8::/64';
process.env.TRUSTED_PROXY_IPS = '';
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { hashToken } = require('../src/middleware/auth');

test('허용 IP/CIDR은 IPv4, IPv6, mapped IPv6를 정확히 비교한다', () => {
  const network = createIpMatcher('192.168.1.10,10.20.30.0/24,2001:db8:1::/64,::1');
  for (const address of ['192.168.1.10', '::ffff:192.168.1.10', '::ffff:c0a8:10a', '10.20.30.0', '10.20.30.255', '2001:db8:1::ffff', '::1']) {
    assert.equal(network.matches(address), true, address);
  }
  for (const address of ['192.168.1.100', '10.20.31.0', '2001:db8:2::1', '127.0.0.1', 'not-an-ip', undefined]) {
    assert.equal(network.matches(address), false, address);
  }
  assert.equal(normalizeIp('::ffff:c0a8:10a'), '192.168.1.10');
  assert.equal(createIpMatcher().configured, false);
  assert.equal(createIpMatcher().matches('127.0.0.1'), false);
  assert.equal(createIpMatcher('::ffff:192.0.2.10/128').matches('192.0.2.10'), true);
});

test('잘못된 설정은 실행 시 거부하고 IP를 미설정하면 출석을 차단한다', () => {
  for (const entry of ['wifi-name', '192.168.0.999', '10.0.0.1/33', '::/129', '10.0.0.1/-1', '10.0.0.1/', '10.0.0.1/24/1', '*', 'true', 'fe80::1%en0']) {
    assert.throws(() => createIpMatcher(entry, 'ATTENDANCE_ALLOWED_IPS'), /ATTENDANCE_ALLOWED_IPS/);
  }
  const script = `
    const { networkStatus, requireAttendanceNetwork } = require('./src/middleware/attendanceNetwork');
    const req = { ip: '127.0.0.1' };
    const res = { status(code) { this.code = code; return this; }, json(body) { console.log(JSON.stringify({code: this.code || 200, ...body})); } };
    networkStatus(req, res);
    requireAttendanceNetwork(req, res, () => { throw new Error('미설정 IP 허용'); });
  `;
  const run = (env) => spawnSync(process.execPath, ['-e', script], {
    cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  const empty = run({ ATTENDANCE_ALLOWED_IPS: '' });
  assert.equal(empty.status, 0, empty.stderr);
  const results = empty.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(results.map(({ code, allowed, configured }) => ({ code, allowed, configured })), [
    { code: 200, allowed: false, configured: false }, { code: 403, allowed: false, configured: false },
  ]);
  for (const env of [{ ATTENDANCE_ALLOWED_IPS: 'invalid' }, { TRUSTED_PROXY_IPS: 'true' }]) {
    const invalid = run(env);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /올바른 IP 또는 CIDR/);
  }
});

test('Vercel에서는 마지막 전달 IP를 사용하고 다른 환경에서는 비신뢰 헤더를 무시한다', () => {
  const script = `
    const app = require('./src/app');
    const req = Object.create(app.request);
    Object.defineProperties(req, {
      socket: { value: { remoteAddress: '10.0.0.2' } },
      headers: { value: {
        'x-forwarded-for': '198.51.100.99, 192.0.2.10',
        'x-forwarded-proto': 'https',
      } },
    });
    console.log(JSON.stringify({ ip: req.ip, protocol: req.protocol }));
  `;
  for (const [platform, expected] of [
    ['1', { ip: '192.0.2.10', protocol: 'https' }],
    ['0', { ip: '10.0.0.2', protocol: 'http' }],
  ]) {
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: require('node:path').resolve(__dirname, '..'),
      env: { ...process.env, VERCEL: platform, TRUSTED_PROXY_IPS: '' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), expected);
  }
});

test('HTTP: 네트워크 확인과 출석 저장에 동일한 IP 제한을 적용한다', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T03:45:00Z') });
  const studentToken = 'a'.repeat(64);
  const adminToken = 'b'.repeat(64);
  const inserts = [];
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.startsWith('UPDATE user_accounts SET is_checked = FALSE, checked_until = NULL')) return [{ affectedRows: 0 }];
    if (sql.includes('FROM login_sessions s JOIN user_accounts')) {
      const role = values[0] === hashToken(studentToken) ? 'STUDENT'
        : values[0] === hashToken(adminToken) ? 'ADMIN' : null;
      return [role ? [{ id: role === 'STUDENT' ? 'student' : 'admin', name: '테스트', roomNumber: '301', role, status: '잔류' }] : []];
    }
    if (sql.includes('INSERT INTO attendance_records')) {
      if (inserts.some((saved) => saved[0] === values[0] && saved[1] === values[1] && saved[2] === values[2])) {
        throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      }
      inserts.push(values);
      return [{ insertId: inserts.length }];
    }
    throw new Error(`예상하지 못한 DB 호출: ${sql}`);
  });
  const originalTrust = app.get('trust proxy');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { token = studentToken, ip, cookie, method = 'GET', body } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(ip ? { 'X-Forwarded-For': ip } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  try {
    await t.test('시간 외 입장은 브라우저별로 만료·해제하고 운영 출석 시간표는 유지한다', async () => {
      const originalFlag = process.env.ENABLE_ATTENDANCE_TIME_TOGGLE;
      const originalMode = process.env.NODE_ENV;
      try {
        process.env.ENABLE_ATTENDANCE_TIME_TOGGLE = 'true';
        process.env.NODE_ENV = 'development';
        t.mock.timers.setTime(Date.parse('2026-11-11T05:05:00Z'));
        assert.equal((await request('/api/attendance/schedule', { token: null })).body.allowed, false);
        assert.equal((await request('/api/attendance/preview', { token: null, method: 'PATCH', body: { enabled: 'true' } })).status, 400);
        const opened = await request('/api/attendance/preview', { token: null, method: 'PATCH', body: { enabled: true } });
        assert.equal(opened.status, 200);
        assert.equal(opened.body.allowed, true);
        assert.equal(opened.body.previewEnabled, true);
        assert.match(opened.headers.get('set-cookie'), /HttpOnly/);
        assert.match(opened.headers.get('set-cookie'), /Max-Age=3600/);
        const cookie = opened.headers.get('set-cookie').split(';')[0];
        assert.equal((await request('/api/attendance/schedule', { token: null, cookie })).body.previewEnabled, true);
        assert.equal((await request('/api/attendance/schedule', { token: null })).body.previewEnabled, false);
        // 시간만 허용하므로 인증과 와이파이는 기존대로 검사합니다.
        assert.equal((await request('/api/attendance/check', { token: null, cookie, method: 'POST' })).status, 401);
        const wifiDenied = await request('/api/attendance/check', { cookie, method: 'POST' });
        assert.equal(wifiDenied.status, 403);
        assert.equal(wifiDenied.body.allowed, false);
        assert.notEqual(wifiDenied.body.code, 'ATTENDANCE_TIME_CLOSED');
        const closed = await request('/api/attendance/preview', { token: null, cookie, method: 'PATCH', body: { enabled: false } });
        assert.equal(closed.body.previewEnabled, false);
        assert.equal(closed.body.allowed, false);
        assert.match(closed.headers.get('set-cookie'), /Max-Age=0/);
        t.mock.timers.setTime(Date.parse('2026-11-11T06:05:00Z'));
        assert.equal((await request('/api/attendance/schedule', { token: null, cookie })).body.allowed, false);
        process.env.NODE_ENV = 'production';
        const productionOpened = await request('/api/attendance/preview', { token: null, method: 'PATCH', body: { enabled: true } });
        assert.equal(productionOpened.status, 200);
        assert.equal(productionOpened.body.previewAvailable, true);
        const productionCookie = productionOpened.headers.get('set-cookie').split(';')[0];
        assert.equal((await request('/api/attendance/schedule', { token: null, cookie: productionCookie })).body.allowed, true);
        assert.equal((await request('/api/attendance/schedule', { token: null })).body.allowed, false);
        for (const [path, body] of [['/api/attendance/check', undefined], ['/api/attendance', { period: 'LUNCH' }]]) {
          const denied = await request(path, { cookie: productionCookie, method: 'POST', body });
          assert.equal(denied.status, 403);
          assert.equal(denied.body.code, 'ATTENDANCE_TIME_CLOSED');
        }
        assert.equal(inserts.length, 0);
        process.env.ENABLE_ATTENDANCE_TIME_TOGGLE = 'false';
        assert.equal((await request('/api/attendance/preview', { token: null, method: 'PATCH', body: { enabled: true } })).status, 403);
        assert.equal((await request('/api/attendance/schedule', { token: null, cookie: productionCookie })).body.allowed, false);
      } finally {
        if (originalFlag === undefined) delete process.env.ENABLE_ATTENDANCE_TIME_TOGGLE; else process.env.ENABLE_ATTENDANCE_TIME_TOGGLE = originalFlag;
        if (originalMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalMode;
        t.mock.timers.setTime(Date.parse('2026-11-11T03:45:00Z'));
      }
    });

    await t.test('공개 이용 시간 조회와 기존 세션의 시간 외 체크를 서버에서 차단한다', async () => {
      t.mock.timers.setTime(Date.parse('2026-11-11T05:00:00Z'));
      const schedule = await request('/api/attendance/schedule', { token: null });
      assert.equal(schedule.status, 200);
      assert.equal(schedule.body.allowed, false);
      assert.equal(schedule.headers.get('cache-control'), 'no-store');
      for (const [path, body] of [['/api/attendance/check', undefined], ['/api/attendance', { period: 'LUNCH' }]]) {
        const denied = await request(path, { method: 'POST', ip: '192.0.2.10', body });
        assert.equal(denied.status, 403);
        assert.equal(denied.body.code, 'ATTENDANCE_TIME_CLOSED');
        assert.match(denied.body.message, /12:30~14:00.*18:00~19:30/);
      }
      assert.equal(inserts.length, 0);
      assert.equal((await request('/api/auth/me')).status, 200);
      t.mock.timers.setTime(Date.parse('2026-11-11T03:45:00Z'));
      assert.equal((await request('/api/attendance/schedule', { token: null })).body.allowed, true);
    });

    await t.test('네트워크 조회에도 로그인이 필요하고 허용되지 않은 IP는 저장하지 않는다', async () => {
      assert.equal((await request('/api/attendance/network', { token: null })).status, 401);
      const result = await request('/api/attendance/network');
      assert.equal(result.status, 200);
      assert.equal(result.body.clientIp, '127.0.0.1');
      assert.equal(result.body.configured, true);
      assert.equal(result.body.allowed, false);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      const denied = await request('/api/attendance', { method: 'POST', body: { period: 'LUNCH' } });
      assert.equal(denied.status, 403);
      assert.equal(denied.body.allowed, false);
      const deniedCheck = await request('/api/attendance/check', { method: 'POST' });
      assert.equal(deniedCheck.status, 403);
      assert.equal(deniedCheck.body.allowed, false);
      assert.equal(inserts.length, 0);
    });

    await t.test('신뢰하지 않은 접속의 위조 헤더와 본문 IP로 우회할 수 없다', async () => {
      const status = await request('/api/attendance/network', { ip: '192.0.2.10' });
      assert.equal(status.body.clientIp, '127.0.0.1');
      assert.equal(status.body.allowed, false);
      const response = await request('/api/attendance', {
        method: 'POST', ip: '192.0.2.10', body: { period: 'LUNCH', clientIp: '192.0.2.10', allowed: true },
      });
      assert.equal(response.status, 403);
      assert.equal(inserts.length, 0);
    });

    await t.test('등록된 프록시에서 전달한 IP만 사용하고 중간의 비신뢰 IP에서 멈춘다', async () => {
      app.set('trust proxy', createIpMatcher('127.0.0.1,::1').matches);
      const allowed = await request('/api/attendance/network', { ip: '192.0.2.10' });
      assert.equal(allowed.body.clientIp, '192.0.2.10');
      assert.equal(allowed.body.allowed, true);
      const denied = await request('/api/attendance/network', { ip: '192.0.2.10, 198.51.100.20' });
      assert.equal(denied.body.clientIp, '198.51.100.20');
      assert.equal(denied.body.allowed, false);
      assert.equal((await request('/api/attendance/network', { ip: 'not-an-ip' })).body.allowed, false);
      assert.equal((await request('/api/attendance', {
        method: 'POST', ip: '198.51.100.20', body: { period: 'LUNCH' },
      })).status, 403);
      assert.equal(inserts.length, 0);
    });

    await t.test('허용 IP에서는 기존 입력/역할/중복 검사를 거쳐 본인 출석을 저장한다', async () => {
      const options = { method: 'POST', ip: '192.0.2.10', body: { period: 'LUNCH' } };
      assert.equal((await request('/api/attendance', { ...options, token: null })).status, 401);
      assert.equal((await request('/api/attendance', { ...options, token: adminToken })).status, 403);
      assert.equal((await request('/api/attendance', { ...options, body: { period: 'INVALID' } })).status, 400);
      assert.equal((await request('/api/attendance', { ...options, body: { period: 'LUNCH', studentId: 'other' } })).status, 400);
      const saved = await request('/api/attendance', options);
      assert.equal(saved.status, 201);
      assert.equal(saved.body.studentId, 'student');
      assert.equal(saved.body.status, 'PRESENT');
      assert.equal((await request('/api/attendance', options)).status, 409);
      assert.equal(inserts.length, 1);
      assert.equal(inserts[0][0], 'student');
    });

    await t.test('IPv6 대역과 IPv4-mapped 주소도 HTTP에서 허용한다', async () => {
      for (const ip of ['2001:db8::123', '::ffff:192.0.2.10']) {
        assert.equal((await request('/api/attendance/network', { ip })).body.allowed, true, ip);
      }
      assert.equal((await request('/api/attendance/network', { ip: '2001:db9::123' })).body.allowed, false);
    });

    await t.test('개발용 와이파이 토글은 조회와 체크에 함께 적용하고 브라우저·만료·운영 환경을 구분한다', async (subtest) => {
      const originalFlag = process.env.ENABLE_ATTENDANCE_NETWORK_TOGGLE;
      const originalMode = process.env.NODE_ENV;
      const originalExecute = pool.execute;
      let checks = 0;
      subtest.mock.method(pool, 'execute', async (sql, values) => {
        if (sql.startsWith('UPDATE user_accounts SET is_checked = TRUE')) {
          checks++;
          assert.equal(values[1], 'student');
          return [{ affectedRows: 1 }];
        }
        return originalExecute(sql, values);
      });
      subtest.mock.method(pool, 'getConnection', async () => ({
        beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
        execute: (sql, values) => pool.execute(sql, values),
      }));
      const path = '/api/attendance/network/preview';
      try {
        process.env.ENABLE_ATTENDANCE_NETWORK_TOGGLE = 'true';
        process.env.NODE_ENV = 'development';
        assert.equal((await request(path, { token: null, method: 'PATCH', body: { allowed: true } })).status, 401);
        assert.equal((await request(path, { token: adminToken, method: 'PATCH', body: { allowed: true } })).status, 403);
        for (const body of [{}, { allowed: 'true' }, { allowed: true, ip: '192.0.2.10' }]) {
          assert.equal((await request(path, { method: 'PATCH', body })).status, 400);
        }
        const connected = await request(path, { method: 'PATCH', body: { allowed: true } });
        assert.equal(connected.status, 200);
        assert.equal(connected.body.allowed, true);
        assert.equal(connected.body.previewEnabled, true);
        assert.match(connected.headers.get('set-cookie'), /HttpOnly/);
        assert.match(connected.headers.get('set-cookie'), /SameSite=Lax/);
        assert.match(connected.headers.get('set-cookie'), /Max-Age=3600/);
        const connectedCookie = connected.headers.get('set-cookie').split(';')[0];
        assert.equal((await request('/api/attendance/network', { cookie: connectedCookie })).body.allowed, true);
        assert.equal((await request('/api/attendance/network')).body.allowed, false);
        assert.equal((await request('/api/attendance/check', { cookie: connectedCookie, method: 'POST' })).status, 200);
        assert.equal(checks, 1);
        t.mock.timers.setTime(Date.parse('2026-11-11T05:05:00Z'));
        assert.equal((await request('/api/attendance/check', { cookie: connectedCookie, method: 'POST' })).body.code, 'ATTENDANCE_TIME_CLOSED');
        t.mock.timers.setTime(Date.parse('2026-11-11T03:45:00Z'));
        const disconnected = await request(path, { method: 'PATCH', body: { allowed: false } });
        const disconnectedCookie = disconnected.headers.get('set-cookie').split(';')[0];
        assert.equal(disconnected.body.allowed, false);
        assert.equal((await request('/api/attendance/network', { cookie: disconnectedCookie, ip: '192.0.2.10' })).body.allowed, false);
        assert.equal((await request('/api/attendance/check', { cookie: disconnectedCookie, ip: '192.0.2.10', method: 'POST' })).status, 403);
        assert.equal(checks, 1);
        const reset = await request(path, { cookie: disconnectedCookie, ip: '192.0.2.10', method: 'PATCH', body: { allowed: null } });
        assert.equal(reset.body.allowed, true);
        assert.equal(reset.body.previewEnabled, false);
        assert.match(reset.headers.get('set-cookie'), /Max-Age=0/);
        for (const cookie of ['mentos_network_preview=invalid', `mentos_network_preview=1.${Date.now() + 7200000}`]) {
          assert.equal((await request('/api/attendance/network', { cookie })).body.allowed, false);
        }
        t.mock.timers.setTime(Date.parse('2026-11-11T04:45:00Z'));
        assert.equal((await request('/api/attendance/network', { cookie: connectedCookie })).body.previewEnabled, false);
        t.mock.timers.setTime(Date.parse('2026-11-11T03:45:00Z'));
        process.env.NODE_ENV = 'production';
        assert.equal((await request(path, { method: 'PATCH', body: { allowed: true } })).status, 403);
        assert.equal((await request('/api/attendance/network', { cookie: connectedCookie })).body.allowed, false);
        assert.equal((await request('/api/attendance/network', { cookie: connectedCookie })).body.previewAvailable, false);
        process.env.NODE_ENV = 'development';
        process.env.ENABLE_ATTENDANCE_NETWORK_TOGGLE = 'false';
        assert.equal((await request(path, { method: 'PATCH', body: { allowed: true } })).status, 403);
        assert.equal((await request('/api/attendance/network', { cookie: connectedCookie })).body.allowed, false);
      } finally {
        if (originalFlag === undefined) delete process.env.ENABLE_ATTENDANCE_NETWORK_TOGGLE; else process.env.ENABLE_ATTENDANCE_NETWORK_TOGGLE = originalFlag;
        if (originalMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalMode;
        t.mock.timers.setTime(Date.parse('2026-11-11T03:45:00Z'));
      }
    });

    await t.test('호실 조회는 관리자만 가능하고 학생 추가를 새 조회에 즉시 반영한다', async (subtest) => {
      const students = [{ id: 'roster-student', name: '실제학생', roomNumber: '406', status: '잔류', isChecked: 0 }];
      let reads = 0;
      subtest.mock.method(pool, 'query', async sql => {
        assert.match(sql, /WHERE role = 'STUDENT'/);
        assert.ok(!sql.includes('password_hash'));
        reads++;
        return [students];
      });
      assert.equal((await request('/api/admin/dormitory', { token: null })).status, 401);
      assert.equal((await request('/api/admin/dormitory')).status, 403);
      assert.equal(reads, 0);
      const first = await request('/api/admin/dormitory', { token: adminToken });
      assert.equal(first.status, 200);
      assert.equal(first.body.summary.total, 1);
      assert.equal(first.body.floors[2].rooms[5].students[0].id, 'roster-student');
      students.push({ id: 'new-student', name: '추가학생', roomNumber: '201', status: '귀가', isChecked: 1 });
      const next = await request('/api/admin/dormitory', { token: adminToken });
      assert.equal(next.body.summary.total, 2);
      assert.equal(next.body.floors[0].rooms[0].students[0].attendanceStatus, 'HOME');
      assert.equal(reads, 2);
    });
  } finally {
    app.set('trust proxy', originalTrust);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
