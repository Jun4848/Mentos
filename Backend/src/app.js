const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { HttpError } = require('./lib/http');
const { createSessionMiddleware } = require('./middleware/session');
const app = express();
app.disable('x-powered-by');

const allowedOrigins = new Set((process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean));
// 쿠키 인증에서 다른 사이트가 상태 변경 요청을 보내는 것을 막습니다.
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin) && origin !== `${req.protocol}://${req.get('host')}`) {
    return next(new HttpError(403, '허용되지 않은 요청 출처입니다.'));
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('sec-fetch-site') === 'cross-site' && !origin) {
    return next(new HttpError(403, '요청 출처를 확인할 수 없습니다.'));
  }
  next();
});
app.use(cors({ origin: (origin, callback) => callback(null, origin || false), credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use(createSessionMiddleware());
app.use('/', routes);
app.use((req, res) => res.status(404).json({ message: 'API를 찾을 수 없습니다.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: '올바른 JSON을 입력해주세요.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: '요청 본문이 너무 큽니다.' });
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
  console.error('API failed:', error.code || error.message);
  res.status(500).json({ message: '요청을 처리할 수 없습니다.' });
});

module.exports = app;
