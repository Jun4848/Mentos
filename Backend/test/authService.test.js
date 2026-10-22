const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthService } = require('../src/services/authService');
const { hashToken } = require('../src/lib/session');
const legacyAccount = require('./fixtures/legacyAccount');

const { password, password_hash, ...profile } = legacyAccount;
const account = { ...profile, password_hash };

function setup(t, storedAccount = account) {
  const users = { findById: t.mock.fn(async () => storedAccount) };
  const sessions = {
    deleteExpired: t.mock.fn(async () => {}),
    create: t.mock.fn(async () => {}),
    findAccountByTokenHash: t.mock.fn(async () => profile),
    deleteByTokenHash: t.mock.fn(async () => {}),
  };
  return { service: new AuthService(users, sessions), users, sessions };
}

function sessionHours(t, value) {
  const previous = process.env.SESSION_HOURS;
  process.env.SESSION_HOURS = value;
  t.after(() => {
    if (previous === undefined) delete process.env.SESSION_HOURS;
    else process.env.SESSION_HOURS = previous;
  });
}

test('기존 scrypt 해시로 로그인하고 세션 원문 대신 해시를 저장한다', async (t) => {
  sessionHours(t, '24');
  const { service, users, sessions } = setup(t);
  const before = Date.now();
  const result = await service.login(` ${account.id} `, password);
  assert.deepEqual(users.findById.mock.calls[0].arguments, [account.id]);
  assert.deepEqual(
    { id: result.id, name: result.name, roomNumber: result.roomNumber, role: result.role }, profile,
  );
  assert.match(result.accessToken, /^[a-f0-9]{64}$/);
  assert.equal(result.maxAge, 24 * 60 * 60 * 1000);
  assert.ok(Date.parse(result.expiresAt) >= before + result.maxAge);
  assert.ok(Date.parse(result.expiresAt) <= Date.now() + result.maxAge);
  assert.equal(result.password_hash, undefined);
  assert.equal(result.password, undefined);
  const [storedHash, id, expiry] = sessions.create.mock.calls[0].arguments;
  assert.equal(storedHash, hashToken(result.accessToken));
  assert.notEqual(storedHash, result.accessToken);
  assert.equal(id, account.id);
  assert.equal(expiry.toISOString(), result.expiresAt);
});

test('입력 오류는 DB에 접근하기 전에 기존 400 오류로 처리한다', async (t) => {
  const { service, users, sessions } = setup(t);
  const invalid = [
    [undefined, password], ['', password], ['   ', password], [42, password],
    ['x'.repeat(51), password], [account.id, undefined], [account.id, ''],
    [account.id, 1234], [account.id, 'x'.repeat(129)],
  ];
  for (const [id, suppliedPassword] of invalid) {
    await assert.rejects(service.login(id, suppliedPassword), { status: 400 });
  }
  assert.equal(users.findById.mock.callCount(), 0);
  assert.equal(sessions.create.mock.callCount(), 0);
});

test('없는 계정, 잘못된 비밀번호, 손상된 해시는 동일한 401이며 세션을 만들지 않는다', async (t) => {
  for (const [storedAccount, suppliedPassword] of [
    [null, password], [account, 'wrong-password'], [{ ...account, password_hash: 'broken' }, password],
  ]) {
    const { service, sessions } = setup(t, storedAccount);
    await assert.rejects(service.login(account.id, suppliedPassword), {
      status: 401, message: '아이디 또는 비밀번호가 올바르지 않습니다.',
    });
    assert.equal(sessions.create.mock.callCount(), 0);
  }
});

test('세션 설정 오류에서는 세션을 만들지 않는다', async (t) => {
  sessionHours(t, 'invalid');
  const { service, sessions } = setup(t);
  await assert.rejects(service.login(account.id, password), { message: 'SESSION_HOURS는 1~720이어야 합니다.' });
  assert.equal(sessions.create.mock.callCount(), 0);
});

test('인증은 기존 세션을 확인하고 누락·만료를 구분하여 401로 처리한다', async (t) => {
  const { service, sessions } = setup(t);
  const token = 'a'.repeat(64);
  await assert.rejects(service.authenticate(null), { status: 401, message: '로그인이 필요합니다.' });
  assert.equal(sessions.findAccountByTokenHash.mock.callCount(), 0);
  assert.deepEqual(await service.authenticate(token), profile);
  assert.deepEqual(sessions.findAccountByTokenHash.mock.calls[0].arguments, [hashToken(token)]);
  sessions.findAccountByTokenHash = async () => undefined;
  await assert.rejects(service.authenticate(token), {
    status: 401, message: '세션이 만료되었습니다. 다시 로그인해주세요.',
  });
});

test('로그아웃은 해당 토큰의 세션만 폐기하고 DB 오류를 숨기지 않는다', async (t) => {
  const { service, sessions } = setup(t);
  const token = 'b'.repeat(64);
  await service.logout(token);
  assert.deepEqual(sessions.deleteByTokenHash.mock.calls[0].arguments, [hashToken(token)]);
  const failure = new Error('DB unavailable');
  sessions.deleteByTokenHash = async () => { throw failure; };
  await assert.rejects(service.logout(token), (error) => error === failure);
});
