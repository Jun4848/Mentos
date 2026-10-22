const { createHash } = require('node:crypto');

const COOKIE_NAME = 'mentos_session';
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function readToken(req) {
  const authorization = req.get('authorization');
  if (authorization) return /^Bearer ([a-f0-9]{64})$/i.exec(authorization)?.[1] || null;
  const cookies = (req.get('cookie') || '').split(';').map((part) => part.trim());
  const value = cookies.find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

function setSessionCookie(res, token, maxAge) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', path: '/', maxAge,
  });
}

module.exports = { hashToken, readToken, setSessionCookie };
