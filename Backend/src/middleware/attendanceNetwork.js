const { attendanceNetwork } = require('../config/network');
const { normalizeIp } = require('../lib/ip');
const { HttpError } = require('../lib/http');

const COOKIE_NAME = 'mentos_network_preview';
const PREVIEW_DURATION_MS = 60 * 60 * 1000;

function previewAvailable() {
  return process.env.ENABLE_ATTENDANCE_NETWORK_TOGGLE === 'true' && process.env.NODE_ENV !== 'production';
}

function readPreviewCookie(req) {
  return (req.get?.('cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || '';
}

function getNetworkStatus(req, cookieValue = readPreviewCookie(req)) {
  const clientIp = normalizeIp(req.ip);
  const available = previewAvailable();
  const match = /^([01])\.(\d{13})$/.exec(cookieValue);
  const until = match ? Number(match[2]) : 0;
  const now = Date.now();
  const enabled = available && until > now && until <= now + PREVIEW_DURATION_MS;
  const allowed = enabled ? match[1] === '1' : attendanceNetwork.matches(req.ip);
  const configured = attendanceNetwork.configured;
  const message = enabled ? `개발용으로 와이파이 ${allowed ? '연결' : '연결 해제'} 상태를 적용했습니다.`
    : !configured ? '출석 허용 IP가 설정되지 않았습니다. 관리자에게 문의해주세요.'
    : allowed ? '출석 가능한 네트워크입니다.' : '허용된 네트워크에 연결해주세요.';
  return {
    clientIp, allowed, configured, message,
    previewAvailable: available, previewEnabled: enabled,
    previewExpiresAt: enabled ? new Date(until).toISOString() : null,
  };
}

function setNetworkPreview(req, res) {
  if (!previewAvailable()) throw new HttpError(403, '와이파이 토글은 개발 환경에서만 사용할 수 있습니다.');
  const allowed = req.body?.allowed;
  if ((typeof allowed !== 'boolean' && allowed !== null) || Object.keys(req.body).some(key => key !== 'allowed')) {
    throw new HttpError(400, 'allowed에 boolean 또는 null 값을 입력해주세요.');
  }
  const value = allowed === null ? '' : `${allowed ? '1' : '0'}.${Date.now() + PREVIEW_DURATION_MS}`;
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', path: '/',
    maxAge: allowed === null ? 0 : PREVIEW_DURATION_MS,
  });
  res.set('Cache-Control', 'no-store');
  res.json(getNetworkStatus(req, value));
}

function networkStatus(req, res) {
  res.set?.('Cache-Control', 'no-store');
  res.json(getNetworkStatus(req));
}

function requireAttendanceNetwork(req, res, next) {
  const status = getNetworkStatus(req);
  if (!status.allowed) return res.status(403).json(status);
  next();
}

module.exports = { networkStatus, requireAttendanceNetwork, setNetworkPreview };
