require('dotenv').config();
const { parseArgs } = require('node:util');
const { pool } = require('../src/config/db');
const { migrate } = require('../src/database/migrate');
const { hashPassword } = require('../src/lib/password');
const { dateOnly, todayInSeoul } = require('../src/lib/validation');

const accounts = [
  { id: 'test_student01', name: '테스트학생1', room: '301', role: 'STUDENT' },
  { id: 'test_student02', name: '테스트학생2', room: '302', role: 'STUDENT' },
  { id: 'test_student03', name: '테스트학생3', room: '303', role: 'STUDENT' },
  { id: 'test_admin01', name: '테스트관리자', room: '', role: 'ADMIN' },
];

function koreanTime(date, time, days = 0) {
  return new Date(new Date(`${date}T${time}:00+09:00`).getTime() + days * 24 * 60 * 60 * 1000);
}

async function seedTestData(database = pool, date = todayInSeoul()) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('운영 환경에서는 테스트 데이터를 생성할 수 없습니다.');
  }
  date = dateOnly(date);
  await migrate(database);
  const connection = await database.getConnection();
  const result = { date, accounts: 0, attendance: 0, leaves: 0, skippedAccounts: [] };
  const usableAccounts = new Set();
  let locked = false;

  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK(CONCAT('mentos:seed:', LEFT(DATABASE(), 50)), 30) AS acquired");
    if (Number(lock.acquired) !== 1) throw new Error('테스트 데이터 생성 잠금을 얻지 못했습니다.');
    locked = true;
    await connection.beginTransaction();

    for (const account of accounts) {
      const [[existing]] = await connection.execute(
        'SELECT id, name, room_number, role FROM user_accounts WHERE id = ? FOR UPDATE', [account.id],
      );
      if (existing) {
        if (existing.id === account.id && existing.name === account.name && existing.room_number === account.room && existing.role === account.role) {
          usableAccounts.add(account.id);
        } else {
          result.skippedAccounts.push(account.id);
        }
        continue;
      }
      await connection.execute('INSERT INTO user_accounts (id, name, room_number, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [account.id, account.name, account.room, await hashPassword('1234'), account.role]);
      usableAccounts.add(account.id);
      result.accounts += 1;
    }

    const attendance = [
      { studentId: 'test_student01', period: 'MORNING', status: 'PRESENT', checkedAt: koreanTime(date, '08:00') },
      { studentId: 'test_student02', period: 'MORNING', status: 'LATE', checkedAt: koreanTime(date, '08:15') },
      { studentId: 'test_student03', period: 'MORNING', status: 'ABSENT', checkedAt: null },
      { studentId: 'test_student03', period: 'LUNCH', status: 'EXCUSED', checkedAt: null },
    ];
    for (const record of attendance) {
      if (!usableAccounts.has(record.studentId) || !usableAccounts.has('test_admin01')) continue;
      const [[existing]] = await connection.execute(
        'SELECT id FROM attendance_records WHERE student_id = ? AND attendance_date = ? AND period = ?',
        [record.studentId, date, record.period],
      );
      if (existing) continue;
      await connection.execute(`INSERT INTO attendance_records
        (student_id, attendance_date, period, status, checked_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [record.studentId, date, record.period, record.status, record.checkedAt, 'test_admin01']);
      result.attendance += 1;
    }

    const leaves = [
      { studentId: 'test_student01', type: 'OUTING', startsAt: koreanTime(date, '18:00', 1), endsAt: koreanTime(date, '20:00', 1), reason: '테스트 외출 신청', status: 'PENDING' },
      { studentId: 'test_student02', type: 'HOME_VISIT', startsAt: koreanTime(date, '18:00', 2), endsAt: koreanTime(date, '20:00', 4), reason: '테스트 귀가 신청', status: 'APPROVED' },
    ];
    for (const leave of leaves) {
      if (!usableAccounts.has(leave.studentId) || !usableAccounts.has('test_admin01')) continue;
      const [[existing]] = await connection.execute(`SELECT id FROM leave_applications
        WHERE student_id = ? AND ((type = ? AND starts_at = ? AND ends_at = ?)
          OR (status IN ('PENDING', 'APPROVED') AND starts_at < ? AND ends_at > ?))`,
      [leave.studentId, leave.type, leave.startsAt, leave.endsAt, leave.endsAt, leave.startsAt]);
      if (existing) continue;
      const approved = leave.status === 'APPROVED';
      await connection.execute(`INSERT INTO leave_applications
        (student_id, type, starts_at, ends_at, reason, status, reviewed_by, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [leave.studentId, leave.type, leave.startsAt, leave.endsAt, leave.reason, leave.status,
        approved ? 'test_admin01' : null, approved ? koreanTime(date, '09:00') : null]);
      result.leaves += 1;
    }

    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    try {
      if (locked) await connection.query("SELECT RELEASE_LOCK(CONCAT('mentos:seed:', LEFT(DATABASE(), 50)))");
    } finally {
      connection.release();
    }
  }
}

if (require.main === module) {
  async function main() {
    const { values } = parseArgs({ options: { date: { type: 'string' } } });
    const result = await seedTestData(pool, values.date);
    console.log(`기준 날짜: ${result.date}`);
    console.log(`새로 생성: 계정 ${result.accounts}개, 출결 ${result.attendance}개, 외출/귀가 신청 ${result.leaves}개`);
    console.log('이미 있는 계정과 기록은 변경하지 않았습니다. 새 테스트 계정의 비밀번호는 1234입니다.');
    if (result.skippedAccounts.length) console.log(`정보가 다른 기존 계정은 건너뛰었습니다: ${result.skippedAccounts.join(', ')}`);
  }
  main().catch((error) => {
    console.error('테스트 데이터 생성 실패:', error.message);
    process.exitCode = 1;
  }).finally(() => pool.end());
}

module.exports = { seedTestData };
