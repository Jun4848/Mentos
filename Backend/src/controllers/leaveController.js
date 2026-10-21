const { pool } = require('../config/db');
const { HttpError } = require('../lib/http');
const { text, oneOf, timestamp, positiveId } = require('../lib/validation');

async function list(req, res) {
  const conditions = [];
  const values = [];
  if (req.account.role === 'STUDENT') {
    if (req.query.studentId !== undefined && req.query.studentId !== req.account.id) throw new HttpError(403, '본인 신청만 조회할 수 있습니다.');
    conditions.push('l.student_id = ?');
    values.push(req.account.id);
  } else if (req.query.studentId !== undefined) {
    conditions.push('l.student_id = ?');
    values.push(text(req.query.studentId, '학생 아이디', 50));
  }
  if (req.query.type !== undefined) {
    conditions.push('l.type = ?');
    values.push(oneOf(req.query.type, ['OUTING', 'HOME_VISIT'], '신청 유형'));
  }
  if (req.query.status !== undefined) {
    conditions.push('l.status = ?');
    values.push(oneOf(req.query.status, ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], '신청 상태'));
  }
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new HttpError(400, 'offset 값을 확인해주세요.');
  const [applications] = await pool.query(`SELECT l.id, l.student_id AS studentId, a.name,
    a.room_number AS roomNumber, l.type, l.starts_at AS startsAt, l.ends_at AS endsAt,
    l.reason, l.status, l.reviewed_by AS reviewedBy, l.reviewed_at AS reviewedAt
    FROM leave_applications l JOIN user_accounts a ON a.id = l.student_id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY l.starts_at DESC, l.id DESC LIMIT 100 OFFSET ?`, [...values, offset]);
  res.json({ applications, offset, limit: 100 });
}

async function create(req, res) {
  const type = oneOf(req.body?.type, ['OUTING', 'HOME_VISIT'], '신청 유형');
  const startsAt = timestamp(req.body?.startsAt);
  const endsAt = timestamp(req.body?.endsAt);
  const reason = text(req.body?.reason, '사유', 500, { optional: true });
  if (endsAt <= startsAt) throw new HttpError(400, '종료 시간은 시작 시간 이후여야 합니다.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // 같은 학생의 동시 신청을 직렬화해 기간 중복 검사를 보호합니다.
    await connection.execute('SELECT id FROM user_accounts WHERE id = ? FOR UPDATE', [req.account.id]);
    const [overlaps] = await connection.execute(`SELECT id FROM leave_applications
      WHERE student_id = ? AND status IN ('PENDING', 'APPROVED') AND starts_at < ? AND ends_at > ? FOR UPDATE`,
    [req.account.id, endsAt, startsAt]);
    if (overlaps.length) throw new HttpError(409, '같은 기간에 대기 또는 승인된 신청이 있습니다.');
    const [result] = await connection.execute(`INSERT INTO leave_applications
      (student_id, type, starts_at, ends_at, reason) VALUES (?, ?, ?, ?, ?)`,
    [req.account.id, type, startsAt, endsAt, reason]);
    await connection.commit();
    res.status(201).json({ id: result.insertId, studentId: req.account.id, type, startsAt, endsAt, reason, status: 'PENDING' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function changeStatus(req, res) {
  const id = positiveId(req.params.id);
  const status = oneOf(req.body?.status, ['APPROVED', 'REJECTED', 'CANCELLED'], '신청 상태');
  if (req.account.role === 'STUDENT' && status !== 'CANCELLED') throw new HttpError(403, '학생은 본인 신청 취소만 가능합니다.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[application]] = await connection.execute('SELECT student_id, status FROM leave_applications WHERE id = ? FOR UPDATE', [id]);
    if (!application) throw new HttpError(404, '신청을 찾을 수 없습니다.');
    if (req.account.role === 'STUDENT' && application.student_id !== req.account.id) throw new HttpError(403, '본인 신청만 변경할 수 있습니다.');
    if (!['PENDING', 'APPROVED'].includes(application.status) || (status !== 'CANCELLED' && application.status !== 'PENDING')) {
      throw new HttpError(409, '이미 처리된 신청입니다.');
    }
    if (status === 'CANCELLED') {
      await connection.execute("UPDATE leave_applications SET status = 'CANCELLED' WHERE id = ?", [id]);
    } else {
      await connection.execute('UPDATE leave_applications SET status = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?', [status, req.account.id, id]);
    }
    await connection.commit();
    res.json({ id, status });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { list, create, changeStatus };
