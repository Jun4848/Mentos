const { pool } = require('../config/db');
const { HttpError } = require('../lib/http');
const { text, oneOf, dateOnly, todayInSeoul } = require('../lib/validation');

const PERIODS = ['MORNING', 'LUNCH', 'EVENING'];
const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];
const SELECT = `SELECT r.id, r.student_id AS studentId, a.name, a.room_number AS roomNumber,
  r.attendance_date AS date, r.period, r.status, r.checked_at AS checkedAt,
  r.recorded_by AS recordedBy FROM attendance_records r JOIN user_accounts a ON a.id = r.student_id`;

async function list(req, res) {
  const date = dateOnly(req.query.date ?? todayInSeoul());
  const conditions = ['r.attendance_date = ?'];
  const values = [date];
  if (req.account.role === 'STUDENT') {
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
  // 학생은 당일 본인 출석만 제출, 클라이언트가 보낸 날짜/상태/아이디는 거부.
  if (['studentId', 'status', 'date'].some((key) => req.body[key] !== undefined)) {
    throw new HttpError(400, '학생 출석 요청에는 period만 입력해주세요.');
  }
  try {
    const [result] = await pool.execute(`INSERT INTO attendance_records
      (student_id, attendance_date, period, status, checked_at, recorded_by)
      VALUES (?, ?, ?, 'PRESENT', UTC_TIMESTAMP(), ?)`, [req.account.id, date, period, req.account.id]);
    res.status(201).json({ id: result.insertId, studentId: req.account.id, date, period, status: 'PRESENT' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, '이미 출결이 기록된 시간대입니다.');
    throw error;
  }
}

async function record(req, res) {
  const studentId = text(req.body?.studentId, '학생 아이디', 50);
  const date = dateOnly(req.body?.date);
  const period = oneOf(req.body?.period, PERIODS, '시간대');
  const status = oneOf(req.body?.status, STATUSES, '출결 상태');
  const [students] = await pool.execute("SELECT id FROM user_accounts WHERE id = ? AND role = 'STUDENT'", [studentId]);
  if (!students.length) throw new HttpError(404, '학생 계정을 찾을 수 없습니다.');
  await pool.execute(`INSERT INTO attendance_records
    (student_id, attendance_date, period, status, checked_at, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE status = ?, checked_at = ?, recorded_by = ?`,
  [students[0].id, date, period, status, ['PRESENT', 'LATE'].includes(status) ? new Date() : null, req.account.id,
    status, ['PRESENT', 'LATE'].includes(status) ? new Date() : null, req.account.id]);
  res.json({ studentId: students[0].id, date, period, status });
}

module.exports = { list, checkIn, record };


