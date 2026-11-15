const { pool } = require('../config/db');

async function latestDate() {
  const [[latest]] = await pool.query('SELECT MAX(attendance_date) AS date FROM attendance_records');
  return latest.date || null;
}

async function listByDate(date) {
  const [records] = await pool.execute(`SELECT r.id, r.student_id AS "studentId",
    COALESCE(NULLIF(r.student_name, ''), a.name) AS name,
    COALESCE(NULLIF(r.room_number, ''), a.room_number) AS "roomNumber",
    r.attendance_date AS date, r.period, r.status, r.checked_at AS "checkedAt"
    FROM attendance_records r JOIN user_accounts a ON a.id = r.student_id
    WHERE r.attendance_date = ? ORDER BY r.room_number, r.student_id,
      CASE r.period WHEN 'MORNING' THEN 0 WHEN 'LUNCH' THEN 1 ELSE 2 END`, [date]);
  return records;
}

module.exports = { latestDate, listByDate };
