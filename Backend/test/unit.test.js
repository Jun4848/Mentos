const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/lib/password');
const { dateOnly, timestamp, oneOf, positiveId } = require('../src/lib/validation');

test('비밀번호는 서로 다른 salt로 해시되고 기존 salt:hash 형식과 호환된다', async () => {
  const password = 'unit-test-password!';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  for (const hash of ['', 'plain-text-password', 'salt:broken', 'salt:'.concat('z'.repeat(128))]) {
    assert.equal(await verifyPassword(password, hash), false);
  }
});

test('존재하지 않는 날짜와 시간대 없는 날짜를 거부한다', () => {
  assert.equal(dateOnly('2028-02-29'), '2028-02-29');
  for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '0000-01-01', [], null]) {
    assert.throws(() => dateOnly(value), { status: 400 });
  }
  assert.equal(timestamp('2026-10-20T18:00:00+09:00').toISOString(), '2026-10-20T09:00:00.000Z');
  for (const value of ['2026-10-20T18:00:00', '2026-02-30T18:00:00Z', '2026-10-20T24:00:00Z', '2026-10-20T18:61:00Z']) {
    assert.throws(() => timestamp(value), { status: 400 });
  }
});

test('SQL 조각, 잘못된 enum과 신청 번호를 거부한다', () => {
  assert.equal(positiveId('123'), 123);
  for (const value of ['1 OR 1=1', '-1', '0', '4294967296', 'NaN']) {
    assert.throws(() => positiveId(value), { status: 400 });
  }
  assert.throws(() => oneOf('ADMIN', ['OUTING', 'HOME_VISIT'], '유형'), { status: 400 });
});
