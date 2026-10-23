require('dotenv').config();
const { parseArgs } = require('node:util');
const { pool } = require('../src/config/db');
const { migrate } = require('../src/database/migrate');
const { hashPassword } = require('../src/lib/password');

const accounts = [
  { id: '26_1208', name: '오건우', room: '403', role: 'STUDENT' },
  { id: '26_1211', name: '이준혁', room: '406', role: 'STUDENT' },
  { id: '26_1213', name: '정영준', room: '409', role: 'STUDENT' },
];

async function seedTestData(database = pool) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('운영 환경에서는 테스트 데이터를 생성할 수 없습니다.');
  }
  await migrate(database);
  const connection = await database.getConnection();
  const result = { accounts: 0, skippedAccounts: [] };
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
        if (existing.id !== account.id || existing.name !== account.name || existing.room_number !== account.room || existing.role !== account.role) {
          result.skippedAccounts.push(account.id);
        }
        continue;
      }
      await connection.execute('INSERT INTO user_accounts (id, name, room_number, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [account.id, account.name, account.room, await hashPassword('1234'), account.role]);
      result.accounts += 1;
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
    parseArgs({ options: {} });
    const result = await seedTestData();
    console.log(`새로 생성: 학생 계정 ${result.accounts}개`);
    console.log('새 계정의 비밀번호는 1234입니다. 기존 계정과 기록은 변경하지 않았습니다.');
    console.log('현재 로컬 DB와 동일하게 관리자, 출결, 외출/귀가 신청 예시는 생성하지 않습니다.');
    if (result.skippedAccounts.length) console.log(`정보가 다른 기존 계정은 건너뛰었습니다: ${result.skippedAccounts.join(', ')}`);
  }
  main().catch((error) => {
    console.error('테스트 데이터 생성 실패:', error.message);
    process.exitCode = 1;
  }).finally(() => pool.end());
}

module.exports = { seedTestData };
