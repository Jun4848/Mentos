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

test('HTTP: 네트워크 확인과 출석 저장에 동일한 IP 제한을 적용한다', async (t) => {
  const studentToken = 'a'.repeat(64);
  const adminToken = 'b'.repeat(64);
  const inserts = [];
  t.mock.method(pool, 'execute', async (sql, values) => {
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
  async function request(path, { token = studentToken, ip, method = 'GET', body } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(ip ? { 'X-Forwarded-For': ip } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  try {
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
  } finally {
    app.set('trust proxy', originalTrust);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
