const { getRequestStudentAccess } = require('../lib/attendancePreview');
const { getStudentAccess } = require('../lib/dormitory');

function attendanceSchedule(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(getRequestStudentAccess(req));
}

function requireAttendanceTime(req, res, next) {
  // 운영의 시간 외 토글은 입장만 허용하며 실제 출석 시간표는 유지합니다.
  const access = process.env.NODE_ENV === 'production' ? getStudentAccess() : getRequestStudentAccess(req);
  if (!access.allowed) return res.status(403).json({ ...access, code: 'ATTENDANCE_TIME_CLOSED' });
  next();
}

module.exports = { attendanceSchedule, requireAttendanceTime };
