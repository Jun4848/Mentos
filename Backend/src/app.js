const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

// 프론트엔드에서 API를 호출할 수 있도록 CORS를 허용합니다.
app.use(cors());

// JSON 형식의 요청을 읽기 위한 설정입니다.
app.use(express.json());

// 기본 라우터를 연결합니다.
app.use('/', routes);

module.exports = app;
