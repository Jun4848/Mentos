const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/lib/password');
const { dateOnly, timestamp, oneOf, positiveId } = require('../src/lib/validation');
const { buildDormitoryRoster, getAttendanceContext, getStudentAccess, getCheckResetTimes } = require('../src/lib/dormitory');

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

test('관리자 호실은 2·3·4층에 15개씩 생성하고 실제 학생만 배치한다', () => {
  const result = buildDormitoryRoster([
    { id: 'checked', name: '출석학생', roomNumber: '201', status: '잔류', isChecked: 1 },
    { id: 'home', name: '귀가학생', roomNumber: '403호', status: '귀가', isChecked: 1 },
    { id: 'pending', name: '미체크학생', roomNumber: '406', status: '잔류', isChecked: 0 },
    { id: 'unassigned', name: '호실미등록', roomNumber: '999', status: '잔류', isChecked: false },
  ], new Date('2026-11-11T03:45:00Z'));
  assert.deepEqual(result.floors.map(floor => [floor.floor, floor.rooms.length, floor.capacity]), [[2, 15, 60], [3, 15, 60], [4, 15, 60]]);
  assert.deepEqual(result.floors[0].rooms.map(room => room.number), Array.from({ length: 15 }, (_, index) => String(201 + index)));
  assert.equal(result.floors[1].rooms[0].number, '301');
  assert.equal(result.floors[2].rooms[14].number, '415');
  assert.equal(result.capacity, 180);
  assert.equal(result.roomCount, 45);
  assert.ok(result.floors.flatMap(floor => floor.rooms).every(room => room.capacity === 4));
  assert.equal(result.floors[2].rooms[2].students[0].attendanceStatus, 'HOME');
  assert.equal(result.floors[0].rooms[0].students[0].attendanceStatus, 'CHECKED');
  assert.equal(result.floors[2].rooms[5].students[0].attendanceStatus, 'UNCHECKED');
  assert.equal(result.floors[2].rooms[0].students.length, 0);
  assert.equal(result.unassignedStudents[0].id, 'unassigned');
  assert.deepEqual(result.summary, { total: 4, checked: 1, pending: 2, home: 1, outing: 0, overnight: 0, assigned: 3, occupiedRooms: 3, unassigned: 1 });
});

test('외출·외박은 체크 여부와 관계없이 상태별로 표시하고 집계한다', () => {
  const accounts = ['외출', '외박'].flatMap(status => [false, true].map(isChecked => ({
    id: `${status}-${isChecked}`, name: '테스트학생', roomNumber: isChecked ? '999' : '406', status, isChecked,
  })));
  const result = buildDormitoryRoster(accounts);
  const room = result.floors[2].rooms[5];
  assert.deepEqual(room.students.map(student => student.attendanceStatus), ['OUTING', 'OVERNIGHT']);
  assert.deepEqual(result.unassignedStudents.map(student => student.attendanceStatus), ['OUTING', 'OVERNIGHT']);
  assert.deepEqual(result.summary, {
    total: 4, checked: 0, pending: 0, home: 0, outing: 2, overnight: 2, assigned: 2, occupiedRooms: 1, unassigned: 2,
  });
});

test('정원 초과나 잘못된 호실의 학생도 누락하거나 임의 이동하지 않는다', () => {
  const students = Array.from({ length: 5 }, (_, index) => ({ id: `student-${index}`, name: '학생', roomNumber: '201', status: '잔류', isChecked: false }));
  const result = buildDormitoryRoster([...students, { id: 'outside', name: '다른호실', roomNumber: '216', status: '귀가', isChecked: false }]);
  assert.equal(result.floors[0].rooms[0].students.length, 5);
  assert.equal(result.floors[0].rooms[0].overCapacity, true);
  assert.equal(result.unassignedStudents[0].id, 'outside');
  assert.equal(result.summary.total, 6);
});

test('한국 날짜와 점심 12:30~14:00, 저녁 18:00~19:30 경계를 판별한다', () => {
  for (const [iso, expected] of [
    ['2026-11-11T03:29:59Z', null], ['2026-11-11T03:30:00Z', 'LUNCH'],
    ['2026-11-11T04:59:59Z', 'LUNCH'], ['2026-11-11T05:00:00Z', null],
    ['2026-11-11T08:59:59Z', null], ['2026-11-11T09:00:00Z', 'EVENING'],
    ['2026-11-11T10:29:59Z', 'EVENING'], ['2026-11-11T10:30:00Z', null],
  ]) {
    assert.equal(getAttendanceContext(new Date(iso)).currentPeriod, expected, iso);
    const access = getStudentAccess(new Date(iso));
    assert.equal(access.allowed, expected !== null, iso);
    if (!access.allowed) assert.match(access.message, /12:30~14:00.*18:00~19:30/);
  }
  const midnight = getAttendanceContext(new Date('2026-11-10T15:00:00Z'));
  assert.equal(midnight.date, '2026-11-11');
  assert.equal(midnight.time, '00:00:00');
});

test('체크 만료는 저녁 시작 10분 전 17:50과 밤 22:30이다', () => {
  for (const [time, next, previous] of [
    ['03:30:00', '08:50:00', '2026-11-10T13:30:00Z'],
    ['08:49:59', '08:50:00', '2026-11-10T13:30:00Z'],
    ['08:50:00', '13:30:00', '2026-11-11T08:50:00Z'],
    ['09:00:00', '13:30:00', '2026-11-11T08:50:00Z'],
    ['13:29:59', '13:30:00', '2026-11-11T08:50:00Z'],
  ]) {
    const result = getCheckResetTimes(new Date(`2026-11-11T${time}Z`));
    assert.equal(result.next.toISOString(), `2026-11-11T${next}.000Z`);
    assert.equal(result.previous.getTime(), Date.parse(previous));
  }
  const afterEvening = getCheckResetTimes(new Date('2026-11-11T13:30:00Z'));
  assert.equal(afterEvening.next.toISOString(), '2026-11-12T08:50:00.000Z');
  assert.equal(afterEvening.previous.toISOString(), '2026-11-11T13:30:00.000Z');
  assert.equal(getCheckResetTimes(new Date('2026-12-31T15:00:00Z')).next.toISOString(), '2027-01-01T08:50:00.000Z');
});

test('접속자가 없어도 만료 타이머가 점심·저녁에 실행되고 종료 시 정리된다', async (t) => {
  const { pool } = require('../src/config/db');
  const { startCheckExpiryTimer } = require('../src/lib/accountChecks');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date('2026-11-11T08:49:59Z') });
  const resets = [];
  t.mock.method(pool, 'execute', async (sql, values) => {
    assert.match(sql, /SET is_checked = FALSE, checked_until = NULL/);
    resets.push(values[0].toISOString());
    return [{ affectedRows: 1 }];
  });
  const stop = startCheckExpiryTimer();
  try {
    t.mock.timers.tick(1000);
    assert.equal(resets.length, 0);
    t.mock.timers.tick(1);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(resets, ['2026-11-11T08:50:00.001Z']);
    t.mock.timers.tick(16800000);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(resets, ['2026-11-11T08:50:00.001Z', '2026-11-11T13:30:00.001Z']);
    stop();
    t.mock.timers.tick(86400000);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(resets.length, 2);
  } finally { stop(); }
});
