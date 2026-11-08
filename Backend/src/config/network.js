const { createIpMatcher } = require('../lib/ip');

const attendanceNetwork = createIpMatcher(process.env.ATTENDANCE_ALLOWED_IPS, 'ATTENDANCE_ALLOWED_IPS');
const trustedProxies = createIpMatcher(process.env.TRUSTED_PROXY_IPS, 'TRUSTED_PROXY_IPS');

module.exports = { attendanceNetwork, trustedProxies };
