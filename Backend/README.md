# D.A.M.S Backend

기숙사 출결 관리 시스템의 백엔드 개발환경입니다.

현재는 본격적인 로그인, JWT, 출결 기능을 구현하지 않고, React 프론트엔드와 연결하기 위한 Express 서버와 MySQL 연결 환경만 준비되어 있습니다.

Docker Compose를 사용하여 Node.js 백엔드와 MySQL을 함께 실행할 수 있습니다.

## 1. 필요한 프로그램

- Docker Desktop
- Git

Docker 설치 여부를 확인합니다.

```bash
docker --version
docker compose version
```

Docker 없이 직접 실행하려면 Node.js 18 이상과 MySQL 8 이상이 필요합니다.

## 2. 사용 기술

- Node.js
- Express.js
- JavaScript
- MySQL
- Docker Compose

사용 패키지:

- `express`
- `mysql2`
- `dotenv`
- `cors`
- `nodemon`

TypeScript, ORM, Sequelize, Prisma, JWT는 사용하지 않습니다.

## 3. Git clone 후 실행

```bash
git clone <Git-저장소-주소>
cd Mentos/Backend
cp .env.example .env
```

`.env` 파일을 열고 자신의 MySQL 비밀번호를 입력합니다.

```ini
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=dormitory
```

`.env` 파일은 비밀번호가 들어갈 수 있으므로 Git에 올리지 않습니다. `.gitignore`에 등록되어 있습니다.

## 4. Docker로 실행하기

백엔드와 MySQL을 함께 빌드하고 실행합니다.

```bash
docker compose up --build
```

Docker 컨테이너 사이에서는 `localhost`가 아니라 MySQL 서비스 이름인 `mysql`을 사용합니다. `docker-compose.yml`에서 `DB_HOST=mysql`로 자동 설정합니다.

정상적으로 실행되면 다음과 비슷한 로그가 보입니다.

```text
MySQL connection successful
Server is running at http://localhost:3000
```

백그라운드 실행:

```bash
docker compose up -d --build
```

로그 확인:

```bash
docker compose logs -f backend
```

실행 중지:

```bash
docker compose down
```

## 5. MySQL 데이터베이스

Docker Compose가 `mysql:8.0` 컨테이너와 `dormitory` 데이터베이스를 자동으로 생성합니다. 이번 단계에서는 테이블을 만들지 않고 데이터베이스 연결만 확인합니다.

## 6. 기본 API 테스트

서버가 실행된 뒤 브라우저나 Postman에서 다음 주소를 GET 방식으로 요청합니다.

```text
http://localhost:3000/
```

응답:

```text
Dormitory Attendance API
```

터미널에서는 다음 명령으로 확인할 수 있습니다.

```bash
curl http://localhost:3000/
```

## 7. Docker 없이 직접 실행하기

MySQL이 실행 중이고 `.env`의 `DB_HOST=localhost` 설정이 맞는지 확인한 뒤 실행합니다.

```bash
npm install
npm run dev
```

일반 실행:

```bash
npm start
```

## 8. 프로젝트 폴더 구조

```text
Mentos/
├── Frontend/
└── Backend/
    ├── src/
    │   ├── routes/
    │   │   └── index.js
    │   ├── controllers/
    │   │   └── homeController.js
    │   ├── models/
    │   │   └── .gitkeep
    │   ├── config/
    │   │   └── db.js
    │   ├── app.js
    │   └── server.js
    ├── .env.example
    ├── .gitignore
    ├── .dockerignore
    ├── Dockerfile
    ├── docker-compose.yml
    ├── package.json
    ├── package-lock.json
    └── README.md
```

## 9. 파일 역할

- `Dockerfile`: Node.js 백엔드 이미지를 만듭니다.
- `docker-compose.yml`: 백엔드와 MySQL 컨테이너를 함께 실행합니다.
- `src/server.js`: 서버 시작과 MySQL 연결 상태를 확인합니다.
- `src/app.js`: Express, CORS, JSON 요청을 설정합니다.
- `src/routes/`: URL과 컨트롤러를 연결합니다.
- `src/controllers/`: API 응답을 처리합니다.
- `src/config/db.js`: `mysql2`로 MySQL 연결을 설정합니다.
- `src/models/`: 나중에 데이터 처리 코드를 추가할 폴더입니다.
