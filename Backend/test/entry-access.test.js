const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { hashPassword } = require('../src/lib/password');

test('운영 시간 외 입장은 인증·출석 시간표를 보존하고 브라우저별로 만료된다', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-15T02:00:00Z') });
  const environment = Object.fromEntries(['NODE_ENV', 'ENABLE_ATTENDANCE_TIME_TOGGLE', 'COOKIE_SECURE'].map(key => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: 'production', ENABLE_ATTENDANCE_TIME_TOGGLE: 'true', COOKIE_SECURE: 'true' });
  const password = 'entry-access-test-password';
  const account = { id: 'entry-student', name: '검증 계정', roomNumber: '201', role: 'STUDENT', status: '잔류', password_hash: await hashPassword(password) };
  const sessions = new Set();
  t.mock.method(pool, 'execute', async (sql, values = []) => {
    if (sql.startsWith('UPDATE user_accounts SET is_checked = FALSE')) return [{ affectedRows: 0 }];
    if (sql.includes('FROM user_accounts WHERE id')) return [values[0] === account.id ? [account] : []];
    if (sql.includes('INSERT INTO login_sessions')) { sessions.add(values[0]); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM login_sessions s JOIN user_accounts')) return [sessions.has(values[0]) ? [account] : []];
    if (sql.startsWith('DELETE FROM login_sessions')) { if (values.length) sessions.delete(values[0]); return [{ affectedRows: 1 }]; }
    throw new Error(`예상하지 못한 DB 호출: ${sql}`);
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(base + path, { method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
  }
  try {
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { id: account.id, password } })).status, 403);
    assert.equal((await request('/api/attendance/preview', { method: 'PATCH', body: { enabled: 'true' } })).status, 400);
    const opened = await request('/api/attendance/preview', { method: 'PATCH', body: { enabled: true } });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.allowed, true);
    const previewHeader = opened.headers.get('set-cookie');
    for (const attribute of [/Secure/, /HttpOnly/, /SameSite=Lax/, /Max-Age=3600/]) assert.match(previewHeader, attribute);
    const preview = previewHeader.split(';')[0];
    assert.equal((await request('/api/attendance/schedule')).body.allowed, false);
    assert.equal((await request('/api/attendance/schedule', { cookie: preview })).body.previewEnabled, true);
    assert.equal((await request('/api/auth/login', { method: 'POST', cookie: preview, body: { id: account.id, password: 'wrong' } })).status, 401);
    const login = await request('/api/auth/login', { method: 'POST', cookie: preview, body: { id: account.id, password } });
    assert.equal(login.status, 200);
    const session = login.headers.get('set-cookie').split(';')[0];
    const cookies = `${preview}; ${session}`;
    const reads = await Promise.all(Array.from({ length: 10 }, () => request('/api/auth/me', { cookie: cookies })));
    assert.ok(reads.every(result => result.status === 200));
    const attendance = await request('/api/attendance', { method: 'POST', cookie: cookies, body: { period: 'LUNCH' } });
    assert.equal(attendance.status, 403);
    assert.equal(attendance.body.code, 'ATTENDANCE_TIME_CLOSED');
    const closed = await request('/api/attendance/preview', { method: 'PATCH', cookie: preview, body: { enabled: false } });
    assert.equal(closed.body.allowed, false);
    assert.match(closed.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await request('/api/auth/logout', { method: 'POST', cookie: session })).status, 204);
    assert.equal((await request('/api/auth/me', { cookie: session })).status, 401);
    t.mock.timers.setTime(Date.parse('2026-11-15T03:00:00Z'));
    assert.equal((await request('/api/attendance/schedule', { cookie: preview })).body.allowed, false);
    process.env.ENABLE_ATTENDANCE_TIME_TOGGLE = 'false';
    assert.equal((await request('/api/attendance/preview', { method: 'PATCH', body: { enabled: true } })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
