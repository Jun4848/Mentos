require('dotenv').config();
const { parseArgs } = require('node:util');
const readline = require('node:readline');
const { Writable } = require('node:stream');
const { pool } = require('../src/config/db');
const { migrate } = require('../src/database/migrate');
const { hashPassword } = require('../src/lib/password');
const { text, oneOf } = require('../src/lib/validation');

async function readPassword() {
  if (process.stdin.isTTY) {
    process.stdout.write('비밀번호 (8~128자, 입력 숨김): ');
    const output = new Writable({ write(chunk, encoding, done) { done(); } });
    const prompt = readline.createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
    return new Promise((resolve, reject) => {
      let answered = false;
      prompt.question('', (answer) => {
        answered = true;
        prompt.close();
        process.stdout.write('\n');
        resolve(answer);
      });
      prompt.once('SIGINT', () => prompt.close());
      prompt.once('close', () => {
        if (!answered) {
          process.stdout.write('\n');
          reject(new Error('계정 생성을 취소했습니다.'));
        }
      });
    });
  }
  process.stdin.setEncoding('utf8');
  const parts = [];
  for await (const part of process.stdin) {
    parts.push(part);
    if (parts.join('').length > 256) throw new Error('비밀번호는 8~128자여야 합니다.');
  }
  return parts.join('').replace(/\r?\n$/, '');
}

async function main() {
  const { values } = parseArgs({ options: {
    id: { type: 'string' }, name: { type: 'string' }, room: { type: 'string' }, role: { type: 'string', default: 'STUDENT' },
  } });
  const id = text(values.id, '아이디 (--id)', 50);
  const name = text(values.name, '이름 (--name)', 100);
  const role = oneOf(values.role, ['STUDENT', 'ADMIN'], '역할 (--role)');
  const room = text(values.room, '호수 (--room)', 10, { optional: role === 'ADMIN' });
  // 명령 인자/프로세스 목록에 비밀번호가 노출되지 않게 stdin으로 받습니다.
  const password = await readPassword();
  if (password.length < 8 || password.length > 128 || /[\r\n]/.test(password)) throw new Error('stdin으로 8~128자 비밀번호 한 줄을 전달해주세요.');
  await migrate();
  await pool.execute('INSERT INTO user_accounts (id, name, room_number, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [id, name, room, await hashPassword(password), role]);
  console.log(`계정을 생성했습니다: ${id} (${role})`);
}

main().catch((error) => {
  console.error(error.code === 'ER_DUP_ENTRY' ? '이미 존재하는 아이디입니다. 기존 계정은 변경하지 않았습니다.' : error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
