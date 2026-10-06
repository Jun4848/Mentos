# Node.js 백엔드 실행 환경을 만듭니다.
FROM node:20-alpine

WORKDIR /app

# 먼저 패키지 파일만 복사하여 의존성을 설치합니다.
COPY package*.json ./
RUN npm install

# 나머지 소스 코드를 복사합니다.
COPY . .

EXPOSE 3000

# 컨테이너를 실행할 때 개발 서버를 시작합니다.
CMD ["npm", "run", "dev"]
