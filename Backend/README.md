# D.A.M.S Backend

기숙사 출결 관리 시스템의 백엔드 개발환경입니다.

Express 서버와 MySQL 연결 환경에 기존 계정으로 로그인하는 기능을 연결했습니다. 비밀번호는 salt를 포함한 scrypt 해시로 저장합니다. JWT, 로그인 세션 유지, 출결 기능은 아직 구현하지 않았습니다.

Docker Compose를 사용하여 Node.js 백엔드와 MySQL을 함께 실행할 수 있습니다.

## 1. 필요한 프로그램

- Docker Desktop
- Git

Docker 설치 여부를 확인합니다.

```bash
docker --version
docker compose version
```

Docker 이미지는 Node.js 24를 사용합니다. Docker 없이 직접 실행하려면 Node.js 24와 MySQL 8 이상을 권장합니다.

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

Docker Compose가 `mysql:8.0` 컨테이너와 `dormitory` 데이터베이스를 자동으로 생성합니다. 백엔드 시작 시 `users` 테이블이 없으면 생성합니다. 출결 테이블은 생성하지 않습니다.

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
    │   │   ├── homeController.js
    │   │   └── authController.js
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

## 10. 실행 참고사항

- MySQL 준비 상태를 확인한 뒤 백엔드를 시작합니다. DB 연결이 끝내 실패하면 서버를 열지 않고 종료합니다.
- `POST /api/auth/login`은 DB에 저장된 기존 계정의 아이디와 비밀번호를 확인해 회원 정보를 반환합니다. 회원가입 API는 제공하지 않습니다. 비밀번호와 해시는 응답하지 않습니다.
- 서버 시작 시 `users` 테이블을 준비하며, 기존 MySQL 볼륨의 데이터를 삭제하지 않습니다.
- MySQL 포트는 로컬 컴퓨터에서만 접근하도록 `127.0.0.1`에 연결합니다. 3306 포트가 사용 중이면 `.env`의 `DB_PORT`를 변경하세요. Docker 내부 DB 포트는 계속 3306입니다.
- `docker compose down` 후에도 DB 데이터는 볼륨에 남습니다. 기존 볼륨이 있으면 최초 생성 시의 DB 비밀번호를 사용해야 합니다. `.env`만 바꾸어도 기존 MySQL 비밀번호가 변경되지는 않습니다.
- 프론트엔드에서는 `fetch('http://localhost:3000/')`로 기본 응답을 확인할 수 있습니다.

macOS에서 `docker-credential-desktop: executable file not found` 오류가 나오면 Docker Desktop 실행 경로를 추가한 뒤 다시 실행합니다.

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d --build
```


## 11. 화면에서 로그인

프론트엔드 개발 서버(`Mentos/Frontend`에서 `npm run dev`)의 로그인 화면에서 기존 계정의 아이디와 비밀번호를 입력하면 메인 화면으로 이동합니다. 잘못된 비밀번호는 401, 잘못된 입력은 400으로 처리합니다. 회원가입 화면은 제공하지 않습니다. 계정이 없으면 DB에 계정을 사전 등록해야 합니다.

프론트엔드의 API 기본 주소는 `http://localhost:3000`입니다. 다른 주소를 사용하려면 프론트엔드 환경변수 `VITE_API_URL`을 설정한 뒤 개발 서버를 다시 시작하세요.

현재 로그인은 비밀번호 검증과 화면 이동까지 제공하는 개발 단계입니다. JWT·세션과 서버 측 권한 검사는 없으며, 기존 메인/어드민 이동용 버튼도 남아 있습니다. 실제 출결 데이터와 관리자 API를 구현할 때는 인증과 권한 검사를 함께 적용해야 합니다.
