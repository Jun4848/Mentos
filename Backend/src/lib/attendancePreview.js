const { getStudentAccess } = require('./dormitory');
const { HttpError } = require('./http');

const COOKIE_NAME = 'mentos_attendance_preview';
const PREVIEW_DURATION_MS = 60 * 60 * 1000;

function previewAvailable() {
  return process.env.ENABLE_ATTENDANCE_TIME_TOGGLE === 'true';
}

function readPreviewCookie(req) {
  return (req.get('cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || '';
}

function getRequestStudentAccess(req, now = new Date(), cookieValue = readPreviewCookie(req)) {
  const access = getStudentAccess(now);
  const available = previewAvailable();
  const until = /^\d{13}$/.test(cookieValue) ? Number(cookieValue) : 0;
  const enabled = available && until > now.getTime() && until <= now.getTime() + PREVIEW_DURATION_MS;
  return {
    ...access, previewAvailable: available, previewEnabled: enabled,
    previewExpiresAt: enabled ? new Date(until).toISOString() : null,
    allowed: access.allowed || enabled,
    message: enabled ? '이 브라우저에서 시간 외 입장이 허용되었습니다.' : access.message,
  };
}

function setAttendancePreview(req, res) {
  if (!previewAvailable()) throw new HttpError(403, '시간 외 입장 기능을 사용할 수 없습니다.');
  if (typeof req.body?.enabled !== 'boolean' || Object.keys(req.body).some(key => key !== 'enabled')) {
    throw new HttpError(400, 'enabled에 boolean 값을 입력해주세요.');
  }
  const now = new Date();
  const value = req.body.enabled ? String(now.getTime() + PREVIEW_DURATION_MS) : '';
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', path: '/',
    maxAge: req.body.enabled ? PREVIEW_DURATION_MS : 0,
  });
  res.set('Cache-Control', 'no-store');
  res.json(getRequestStudentAccess(req, now, value));
}

module.exports = { getRequestStudentAccess, setAttendancePreview };
