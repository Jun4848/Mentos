// 단일 개발 서버용 IP 제한입니다. 여러 서버로 확장하면 공유 저장소로 교체합니다.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const cleanup = setInterval(() => {
  for (const [key, value] of attempts) if (value.until <= Date.now()) attempts.delete(key);
}, WINDOW_MS);
cleanup.unref();

function loginLimit(req, res, next) {
  const now = Date.now();
  let entry = attempts.get(req.ip);
  if (!entry || entry.until <= now) {
    entry = { count: 0, until: now + WINDOW_MS };
    attempts.set(req.ip, entry);
  }
  entry.count += 1;
  if (entry.count > 20) {
    res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
    return res.status(429).json({ message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }
  next();
}

module.exports = { loginLimit };
