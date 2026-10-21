# Node.js 백엔드 실행 환경을 만듭니다.
FROM node:24-alpine

WORKDIR /app

# 먼저 패키지 파일만 복사하여 의존성을 설치합니다.
COPY package*.json ./
RUN npm ci

# 나머지 소스 코드를 복사합니다.
COPY . .

EXPOSE 3000

# Node.js 내장 watch 모드로 개발 서버를 시작합니다.
CMD ["npm", "run", "dev"]
