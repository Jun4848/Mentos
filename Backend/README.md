# D.A.M.S Backend

Express + MySQL 8.0으로 기숙사 계정 로그인, 출결, 외출·귀가 신청을 관리합니다.

기존 프론트 디자인을 유지하면서 로그인 버튼을 서버 API에 연결했습니다. 로그인하면 학생은 메인 화면, 관리자는 관리자 화면으로 이동합니다. 쿠키로 로그인 정보를 확인하여 메인 화면을 새로고침해도 로그인 상태를 유지합니다.

프론트는 `Frontend` 폴더에서 `npm run dev`로 실행합니다. `vite.config.js`가 `/api` 요청을 `http://127.0.0.1:3000`으로 전달합니다. 실제 배포에서도 웹 서버가 `/api`를 백엔드로 전달하도록 설정합니다.

## Docker로 실행

Docker Desktop을 실행한 뒤 저장소의 `Backend` 폴더에서 진행합니다.

```bash
cd Backend
cp .env.example .env
```

새로 실행하는 팀원은 `.env`의 `DB_PASSWORD=your_password`를 자신의 개발용 DB 비밀번호로 바꿉니다. 기존 `.env`와 DB 볼륨이 있다면 덮어쓰지 말고 기존 비밀번호를 사용합니다.

```bash
docker compose up -d --build
curl http://localhost:3000/health
```

`{"status":"ok","database":"connected"}`가 나오면 준비 완료입니다. MySQL이 준비된 뒤 백엔드가 시작하며, 최초 및 이후 서버 시작 시 DB 마이그레이션을 실행합니다.

```bash
docker compose logs -f backend
docker compose ps
docker compose down
```

DB 데이터는 `mysql-data` 볼륨에 보존됩니다. `docker compose down -v`는 DB 데이터까지 삭제하므로 기존 데이터를 유지할 때 사용하지 않습니다. 기존 볼륨의 비밀번호는 `.env` 값을 바꾸는 것만으로 변경되지 않습니다.

macOS에서 Docker 자격증명 실행 파일을 찾지 못하면 다음 명령으로 경로를 추가한 뒤 다시 빌드합니다.

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

## 계정 생성

공개 회원가입 API와 자동 생성되는 기본 계정은 없습니다. 아래 명령을 실행하고 비밀번호를 입력하면 scrypt 해시로 저장합니다. 비밀번호는 화면이나 명령 인자에 표시되지 않습니다. 기존 계정은 덮어쓰지 않습니다.

```bash
docker compose exec backend npm run account:create -- --id student01 --name "홍길동" --room 301
```

관리자 계정:

```bash
docker compose exec backend npm run account:create -- --id admin01 --name "사감 선생님" --role ADMIN
```

학생 계정은 호수가 필수입니다. 호수는 `A-301` 같은 값도 저장할 수 있도록 문자열입니다. 기존 계정의 비밀번호 해시, 이름, 호수는 유지하고 역할은 `STUDENT`로 설정합니다. 기존 계정을 자동으로 관리자로 승격하지 않습니다.

## 로그인 확인

방금 생성한 계정의 비밀번호를 `password`에 넣습니다.

```bash
curl -i -c cookies.txt http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"id":"student01","password":"계정 생성 때 입력한 비밀번호"}'

curl -b cookies.txt http://localhost:3000/api/auth/me

curl -b cookies.txt -X POST http://localhost:3000/api/attendance \
  -H 'Content-Type: application/json' \
  -d '{"period":"LUNCH"}'

curl -b cookies.txt -X POST http://localhost:3000/api/auth/logout
```

로그인은 `HttpOnly` 쿠키와 `accessToken`을 발급합니다. 쿠키 대신 `Authorization: Bearer <accessToken>` 헤더도 사용할 수 있습니다. 기본 만료 시간은 24시간이며, 서버를 재시작해도 DB에 저장된 세션은 유지됩니다. 로그아웃·만료된 세션은 재사용할 수 없습니다.

자세한 요청/응답과 권한은 [API 문서](docs/API.md), 테이블·관계와 변경 이유는 [ERD 문서](docs/ERD.md)를 참고하세요.

## 팀원의 다른 컴퓨터에서 사용

### 각자 같은 개발 환경 실행

팀원이 이 저장소를 clone하고 위의 `.env` 설정과 `docker compose up -d --build`를 실행하면 같은 구조의 DB와 API가 생성됩니다. 팀원 PC에 Node/MySQL을 별도로 설치할 필요가 없습니다. macOS/Windows/Linux에서 Docker Desktop 또는 Docker Engine + Compose를 사용할 수 있습니다.

**각 PC의 데이터는 별개입니다. Docker나 Git이 DB의 실제 데이터를 자동 동기화하지는 않습니다.** 계정은 각 환경에서 위 명령으로 생성합니다.

### 같은 데이터를 함께 사용하는 공용 개발 서버

한 컴퓨터에서 Docker를 실행하고, 팀원은 `http://서버의-LAN-IP:3000`으로 API를 호출합니다. 예: `http://192.168.0.10:3000/health`. 서버가 켜져 있고 같은 네트워크/VPN에 연결되어 있어야 하며 서버 방화벽에서 API 포트 접근을 허용해야 합니다.

브라우저에서 API를 연결할 때는 서버 `.env`의 `FRONTEND_ORIGINS`에 사용할 프론트 주소를 쉼표로 추가하고 백엔드를 재생성합니다.

```ini
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://192.168.0.20:5173
```

```bash
docker compose up -d --force-recreate backend
```

현재 프론트는 Vite 프록시와 `credentials: 'include'`로 로그인 쿠키를 사용합니다. 팀 공용 API를 사용하려면 각 팀원 PC의 `Frontend/vite.config.js`에서 `server.proxy["/api"].target`을 공용 서버 주소(예: `http://192.168.0.10:3000`)로 바꾸고 프론트 개발 서버를 재시작합니다. HTTPS 배포 시 `COOKIE_SECURE=true`로 설정합니다.

MySQL 3306 포트는 서버의 `127.0.0.1`에만 연결됩니다. 팀원이 DB 도구로 직접 확인해야 한다면 SSH 접속이 가능한 서버에서 터널을 사용합니다.

```bash
ssh -N -L 13306:127.0.0.1:3306 서버계정@서버IP
```

그 뒤 DB 도구에서 `127.0.0.1:13306`에 접속합니다. 애플리케이션을 통한 공유는 공용 API 주소를 사용하는 방식입니다.

Docker 공식 문서: [Compose 네트워크](https://docs.docker.com/compose/how-tos/networking/), [데이터 볼륨](https://docs.docker.com/reference/compose-file/volumes/).

## 기존 DB 이전

- `users` → `user_accounts`: 테이블을 rename하여 기존 계정과 해시를 그대로 유지합니다.
- `attendance_records`, `leave_applications`, `login_sessions`: 새로 생성합니다.
- 원본 `home_stay`, `leave_requests`는 각각 `legacy_home_stay`, `legacy_leave_requests`로 보관합니다. 원본 행과 외래 키를 유지합니다.
- 과거 `choice` 값이 잔류/귀가 선택인지 불분명하므로 원본 신청을 새 신청으로 임의 변환하지 않습니다. 보관된 과거 신청은 새 API 목록에 합쳐지지 않습니다. 데이터가 있는 다른 팀원 DB에서는 의미를 확인한 뒤 별도 이전할 수 있습니다.
- 이번 로컬 DB 적용 전 계정은 3개, 기존 신청은 각 0개였습니다. 적용 전 백업은 `backups/before-auth-migration-20261020.sql`에 있으며 Git/Docker 빌드 대상에서 제외했습니다.
- `schema_migrations`에 적용 버전을 기록하고 DB 잠금으로 동시 실행을 막습니다. 계정 테이블 두 종류가 동시에 있으면 자동 덮어쓰기 대신 오류를 냅니다.

수동 실행:

```bash
docker compose exec backend npm run db:migrate
```

## 환경 변수

| 변수 | 용도 / 기본값 |
| --- | --- |
| `PORT` | 호스트 API 포트 / `3000` |
| `DB_HOST` | 직접 Node 실행 시 MySQL 호스트. Docker 안에서는 `mysql`로 자동 설정 |
| `DB_PORT` | 호스트 MySQL 포트 / `3306`. Docker 내부는 항상 `3306` |
| `DB_USER` | 개발 DB 사용자 / 예제는 `root` |
| `DB_PASSWORD` | DB 비밀번호, `.env`에만 보관 |
| `DB_NAME` | DB 이름 / `dormitory` |
| `FRONTEND_ORIGINS` | 허용할 프론트 주소 목록 |
| `SESSION_HOURS` | 로그인 유지 시간 / `24` (1~720) |
| `COOKIE_SECURE` | HTTPS 쿠키 사용 / 로컬 `false`, HTTPS `true` |

서버와 MySQL 시각은 UTC를 사용하고, 학생 출석 날짜는 `Asia/Seoul` 기준으로 계산합니다.

## 테스트와 직접 실행

Docker 안에서 실행:

```bash
docker compose exec backend npm test
docker compose exec backend npm run test:integration
```

통합 테스트는 임의 이름의 `mentos_test_*` DB 두 개를 생성하여 새 DB 초기화, 기존 데이터 보존, 로그인, 만료/로그아웃, 권한, 중복 출결, 동시 신청을 검증한 뒤 **테스트 DB만** 삭제합니다. DB 생성 권한이 있는 개발용 사용자로 실행합니다.

Docker 없이 실행하려면 Node.js 22 이상(이미지는 24), MySQL 8.0.16 이상과 `.env` 설정이 필요합니다.

```bash
npm ci
npm run dev
```

`npm run dev`는 Node 내장 watch 모드, `npm start`는 일반 실행입니다. DB 연결이나 마이그레이션이 실패하면 서버를 열지 않고 종료합니다.

출결 제출 시간 제한, 미제출자의 자동 결석 처리, 승인된 귀가의 자동 공결 처리는 학교 운영 규칙이 정해지지 않아 자동화하지 않았습니다. 관리자가 출결 상태를 직접 기록할 수 있습니다. 로그인 요청 제한은 단일 서버 메모리 기준 IP당 15분에 20회입니다.
