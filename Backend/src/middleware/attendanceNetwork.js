const { attendanceNetwork } = require('../config/network');
const { normalizeIp } = require('../lib/ip');

function getNetworkStatus(req) {
  const clientIp = normalizeIp(req.ip);
  const allowed = attendanceNetwork.matches(req.ip);
  const configured = attendanceNetwork.configured;
  const message = !configured ? '출석 허용 IP가 설정되지 않았습니다. 관리자에게 문의해주세요.'
    : allowed ? '출석 가능한 네트워크입니다.' : '허용된 네트워크에 연결해주세요.';
  return { clientIp, allowed, configured, message };
}

function networkStatus(req, res) {
  res.json(getNetworkStatus(req));
}

function requireAttendanceNetwork(req, res, next) {
  const status = getNetworkStatus(req);
  if (!status.allowed) return res.status(403).json(status);
  next();
}

module.exports = { networkStatus, requireAttendanceNetwork };
