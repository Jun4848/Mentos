const { pool, dialect, currentTimestamp, returningId } = require('../config/db');
const { HttpError } = require('../lib/http');
const { text, oneOf, dateOnly, todayInSeoul } = require('../lib/validation');
const { getCheckResetTimes, getAttendanceContext } = require('../lib/dormitory');

const PERIODS = ['MORNING', 'LUNCH', 'EVENING'];
const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];
const SELECT = `SELECT r.id, r.student_id AS "studentId", COALESCE(NULLIF(r.student_name, ''), a.name) AS name,
  COALESCE(NULLIF(r.room_number, ''), a.room_number) AS "roomNumber",
  r.attendance_date AS date, r.period, r.status, r.checked_at AS "checkedAt",
  r.recorded_by AS "recordedBy" FROM attendance_records r JOIN user_accounts a ON a.id = r.student_id`;

async function list(req, res) {
  const date = dateOnly(req.query.date ?? todayInSeoul());
  const conditions = ['r.attendance_date = ?'];
  const values = [date];
  if (req.account.role === 'STUDENT') {
    // DB의 실제 ID를 사용하므로 대소문자 차이를 이용한 우회도 불가능합니다.
    if (req.query.studentId !== undefined && req.query.studentId !== req.account.id) throw new HttpError(403, '본인 출결만 조회할 수 있습니다.');
    conditions.push('r.student_id = ?');
    values.push(req.account.id);
  } else if (req.query.studentId !== undefined) {
    conditions.push('r.student_id = ?');
    values.push(text(req.query.studentId, '학생 아이디', 50));
  }
  if (req.query.period !== undefined) {
    conditions.push('r.period = ?');
    values.push(oneOf(req.query.period, PERIODS, '시간대'));
  }
  const [records] = await pool.execute(`${SELECT} WHERE ${conditions.join(' AND ')} ORDER BY a.room_number, r.student_id, r.period`, values);
  res.json({ records });
}

async function checkIn(req, res) {
  const period = oneOf(req.body?.period, PERIODS, '시간대');
  const date = todayInSeoul();
  // 학생은 당일 본인 출석만 제출하며, 클라이언트가 보낸 날짜/상태/아이디는 거부합니다.
  if (['studentId', 'status', 'date'].some((key) => req.body[key] !== undefined)) {
    throw new HttpError(400, '학생 출석 요청에는 period만 입력해주세요.');
  }
  try {
    const [result] = await pool.execute(`INSERT INTO attendance_records
      (student_id, attendance_date, period, status, checked_at, recorded_by, student_name, room_number)
      VALUES (?, ?, ?, 'PRESENT', ${currentTimestamp}, ?, ?, ?)${returningId}`, [req.account.id, date, period, req.account.id, req.account.name, req.account.roomNumber]);
    res.status(201).json({ id: result.insertId, studentId: req.account.id, date, period, status: 'PRESENT' });
  } catch (error) {
    if (['ER_DUP_ENTRY', '23505'].includes(error.code)) throw new HttpError(409, '이미 출결이 기록된 시간대입니다.');
    throw error;
  }
}

async function checkAccount(req, res) {
  if (Object.keys(req.body || {}).length) {
    throw new HttpError(400, '체크 요청에는 사용자나 체크 상태를 지정할 수 없습니다.');
  }
  if (req.account.status === '귀가') throw new HttpError(403, '귀가입니다');
  if (req.account.status !== '잔류') throw new HttpError(403, '잔류 상태에서만 체크할 수 있습니다.');
  if (req.account.isChecked) throw new HttpError(409, '이미 체크를 완료했습니다.');

  const now = new Date();
  const context = getAttendanceContext(now);
  // 개발용 시간 전환에서도 점심/저녁 구분을 유지하고, 운영의 시간 검사는 미들웨어에서 수행합니다.
  const evening = context.periods.find(period => period.code === 'EVENING');
  const period = context.currentPeriod || (context.time.slice(0, 5) >= evening.start ? 'EVENING' : 'LUNCH');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(`UPDATE user_accounts SET is_checked = TRUE, checked_until = ?
      WHERE id = ? AND role = 'STUDENT' AND status = '잔류' AND is_checked = FALSE`, [getCheckResetTimes(now).next, req.account.id]);
    if (result.affectedRows !== 1) throw new HttpError(409, '체크 상태가 변경되었습니다. 현재 상태를 다시 확인해주세요.');
    // 체크 상태와 이력은 함께 커밋해 중복 클릭이나 저장 실패로 서로 어긋나지 않게 합니다.
    await connection.execute(`INSERT INTO attendance_records
      (student_id, attendance_date, period, status, checked_at, recorded_by, student_name, room_number)
      SELECT id, ?, ?, 'PRESENT', ?, id, name, room_number FROM user_accounts WHERE id = ?`,
    [context.date, period, now, req.account.id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (['ER_DUP_ENTRY', '23505'].includes(error.code)) throw new HttpError(409, '이미 출결이 기록된 시간대입니다.');
    throw error;
  } finally { connection.release(); }
  res.json({ isChecked: true, status: '잔류' });
}

async function record(req, res) {
  const studentId = text(req.body?.studentId, '학생 아이디', 50);
  const date = dateOnly(req.body?.date);
  const period = oneOf(req.body?.period, PERIODS, '시간대');
  const status = oneOf(req.body?.status, STATUSES, '출결 상태');
  const [students] = await pool.execute("SELECT id, name, room_number AS \"roomNumber\" FROM user_accounts WHERE id = ? AND role = 'STUDENT'", [studentId]);
  if (!students.length) throw new HttpError(404, '학생 계정을 찾을 수 없습니다.');
  const conflict = dialect === 'postgres'
    ? 'ON CONFLICT (student_id, attendance_date, period) DO UPDATE SET status = ?, checked_at = ?, recorded_by = ?'
    : 'ON DUPLICATE KEY UPDATE status = ?, checked_at = ?, recorded_by = ?';
  await pool.execute(`INSERT INTO attendance_records
    (student_id, attendance_date, period, status, checked_at, recorded_by, student_name, room_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ${conflict}`,
  [students[0].id, date, period, status, ['PRESENT', 'LATE'].includes(status) ? new Date() : null, req.account.id, students[0].name, students[0].roomNumber,
    status, ['PRESENT', 'LATE'].includes(status) ? new Date() : null, req.account.id]);
  res.json({ studentId: students[0].id, date, period, status });
}

module.exports = { list, checkIn, checkAccount, record };
