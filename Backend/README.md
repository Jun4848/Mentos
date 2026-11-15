# D.A.M.S Backend

Express + MySQL 8.0 또는 Supabase PostgreSQL로 기숙사 계정 로그인, 출결, 외출·귀가 신청을 관리합니다.

## 팀원 빠른 시작: 공용 Supabase DB

저장소를 받은 뒤 새 환경에서 실행합니다. 기존 `.env`가 있다면 복사 명령으로 덮어쓰지 말고 필요한 값만 수정합니다.

```bash
cd Backend
cp .env.example .env
npm ci
```

백엔드 담당자에게 **공용 Supabase의 `DATABASE_URL`**을 별도로 받아 `.env`에 넣습니다. `.env`와 DB 접속 비밀번호는 Git에 포함하지 않습니다. 같은 DB에 연결하면 기존 테스트 계정과 데이터를 그대로 사용하므로 계정을 다시 생성할 필요가 없습니다. 다른 Supabase 프로젝트나 각자의 MySQL을 사용하면 데이터가 공유되지 않습니다. 팀 공용 DB에서 수정한 계정·출결·신청은 다른 팀원에게도 반영됩니다.

같은 PC에서 백엔드 API로 출석을 시연하려면 다음처럼 설정합니다. 다른 기기나 프록시를 거치는 경우에는 아래 IP 설정 설명에 따라 서버에 보이는 실제 주소를 입력합니다.

```ini
DATABASE_URL=postgresql://postgres.PROJECT_REF:URL_ENCODED_DB_PASSWORD@SESSION_POOLER_HOST:5432/postgres
DATABASE_SSL=true
DATABASE_SSL_CA_FILE=certs/supabase-ca.crt
ATTENDANCE_ALLOWED_IPS=127.0.0.1,::1
TRUSTED_PROXY_IPS=
```

```bash
npm start
```

다른 터미널에서 `curl http://localhost:3000/health`를 실행해 `{"status":"ok","database":"connected"}`를 확인합니다. DB 구조는 서버 시작 시 확인하며, 기존 계정·출결을 초기화하지 않습니다. 프론트 담당자는 [API 문서](docs/API.md)에 맞춰 호출하면 됩니다. 출결 시간 제한·자동 결석/공결 처리는 아직 제공하지 않습니다.

## Supabase 사용

`Backend/.env`에 `DATABASE_URL`이 있으면 PostgreSQL을 사용하고, 비어 있으면 기존 MySQL 설정을 사용합니다. `DATABASE_URL`은 Supabase 프로젝트의 **Connect → Session pooler** 연결 문자열입니다. DB 비밀번호를 URL 인코딩해 넣습니다. API 키나 Supabase 로그인 비밀번호가 아닙니다.

```ini
DATABASE_URL=postgresql://postgres.PROJECT_REF:URL_ENCODED_DB_PASSWORD@SESSION_POOLER_HOST:5432/postgres
DATABASE_SSL=true
DATABASE_SSL_CA_FILE=certs/supabase-ca.crt
```

직접 실행:

```bash
npm ci
npm run db:migrate
npm start
```

Docker로 Supabase 연결 백엔드만 실행:

```bash
docker compose -f docker-compose.supabase.yml up -d --build
```

이 명령은 로컬 MySQL을 필요로 하지 않습니다. 서버 시작 시 마이그레이션을 다시 확인하고, `/health`로 실제 DB 연결을 확인합니다. 프론트는 기존 API 경로를 그대로 사용합니다.

Supabase Table Editor에서 스키마를 **mentos**로 선택하면 `user_accounts`, `attendance_records`, `leave_applications`, `login_sessions`, `schema_migrations` 테이블을 볼 수 있습니다. 기존 프로젝트/`public`/`auth` 스키마를 변경하지 않습니다. RLS를 켠 별도 스키마를 사용하며, 계정·세션은 현재 Express API를 통해서만 사용합니다. Supabase Auth로 인증 방식을 바꾸지는 않았습니다.

기존 MySQL 데이터는 연결 주소를 바꾸는 것만으로 복사되지 않습니다. 이전 전까지 기존 DB/볼륨/백업은 보존합니다. 새 DB의 계정 생성은 기존 `npm run account:create -- --id student01 --name "홍길동" --room 301` 명령을 그대로 사용합니다. PostgreSQL 계정의 아이디는 대소문자를 구분합니다.

원격 연결의 TLS 인증서를 검증합니다. `certs/supabase-ca.crt`는 Supabase 대시보드가 제공한 공개 CA 인증서입니다. 인증서가 교체되면 Supabase DB 설정에서 새 CA 인증서를 내려받아 `DATABASE_SSL_CA_FILE`에 경로를 지정하세요. 로컬 PostgreSQL 테스트에만 `DATABASE_SSL=false`를 허용합니다. Docker를 사용한다면 인증서도 이미지 안에서 접근 가능한 경로에 있어야 합니다.

실제 PostgreSQL 통합 테스트는 로컬 테스트 서버에서 실행합니다. 실행할 때마다 별도 임시 DB를 생성하고 그 DB만 삭제합니다.

```bash
POSTGRES_TEST_URL=postgresql://TEST_USER@127.0.0.1:5432/postgres npm run test:postgres
```

연결 방식 참고: [Supabase 공식 문서](https://supabase.com/docs/guides/database/connecting-to-postgres).

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

## 관리자 호실 현황

로그인 페이지 오른쪽 아래의 작은 `시간 외 입장` 토글을 켜면 해당 브라우저에서 최대 한 시간 동안 시간 외 학생 로그인과 메인페이지 입장이 가능합니다. 끄거나 만료되면 원래 시간표로 돌아갑니다. `ENABLE_ATTENDANCE_TIME_TOGGLE=true`일 때 운영·개발 환경에서 표시하며, 운영의 실제 출석 제출에는 기존 시간·와이파이·잔류·미체크 검사를 적용합니다. 로컬 개발의 기존 시간 전환 동작은 유지합니다.

관리자 계정으로 로그인하면 `/admin`에서 2·3·4층의 호실 현황을 확인합니다. 각 층은 15개 호실(201–215, 301–315, 401–415), 각 방은 정원 4명으로 구성되어 있습니다. 실제 DB에 등록된 학생만 배치하며 관리자 계정은 학생 수에 포함하지 않습니다.

출석완료(초록)·미체크(주황)·귀가(파랑)를 구분하고, 귀가 학생은 `isChecked`와 관계없이 `귀가`로 표시합니다. 학생 이름을 표시하며 아이디는 숨깁니다. DB의 학생 추가·호실 변경·체크 상태는 5초마다 자동 갱신됩니다. 2·3·4층 선택과 이름·학번·호실 검색을 지원하며, 검색어가 없으면 선택한 층의 15개 호실을 모두 표시합니다.

날짜와 시각은 한국 시간 기준입니다. 점심 12:30–14:00, 저녁 18:00–19:30에 현재 시간대를 표시하며 나머지는 `출석 시간 외`입니다. 학생은 해당 시간에만 로그인·메인페이지 접근·출석 제출이 가능합니다. 14:00와 19:30부터는 접근이 차단되며 로그인 화면에 이용 시간을 안내합니다. 관리자 로그인·관리자 페이지에는 시간 제한이 없습니다. 학생 체크 버튼은 이용 시간 안에서도 네트워크·잔류·미체크 조건을 만족해야 합니다.

점심 체크는 저녁 시작 10분 전인 17:50, 저녁 체크는 22:30까지 유지합니다. `checked_until`에 만료 시각을 저장하고 해당 시각에 학생의 `is_checked`를 `false`로 초기화해 다음 식사에 다시 체크할 수 있습니다. 서버가 꺼져 있었으면 재시작 시 처리하며 조회 전에도 만료 여부를 확인합니다. 귀가 상태나 학생 정보는 변경하지 않으며 별도의 과거 날짜별 이력은 추가하지 않습니다.

호실이 잘못 등록되거나 정원이 초과된 학생은 별도 안내로 표시해 누락을 방지합니다. 화면의 배치만 달라지며 DB 계정을 자동 이동·삭제하지 않습니다. 조회 API는 `GET /api/admin/dormitory`이며 관리자 권한이 필요합니다.

## 발표용 와이파이/IP 설정

로컬 개발 서버의 학생 메인페이지에서 와이파이 카드 아래 **와이파이 전환** 스위치로 연결·해제 상태를 시연할 수 있습니다. 화면과 출석 API에 함께 적용되며 **자동**을 누르면 실제 IP 판별로 돌아갑니다. 브라우저별로 최대 한 시간 유지하고 실제 기기의 와이파이 설정은 바꾸지 않습니다. 로컬 Docker Compose에서는 기본 활성화되고, 직접 실행할 때는 `ENABLE_ATTENDANCE_NETWORK_TOGGLE=true`로 켭니다. 운영(`NODE_ENV=production`)에서는 사용할 수 없습니다.

`Backend/.env`에 출석을 허용할 접속 IP를 직접 입력합니다. 여러 IP는 쉼표로 구분하고, CIDR로 대역 전체를 허용할 수도 있습니다.

```ini
# 예시: 이 IP에서 접속한 학생만 출석 가능
ATTENDANCE_ALLOWED_IPS=192.168.0.25
# 프록시 없이 백엔드에 직접 접속하면 빈 값으로 둡니다.
TRUSTED_PROXY_IPS=
```

- 와이파이 대역 전체를 허용할 때: `ATTENDANCE_ALLOWED_IPS=192.168.0.0/24`
- 여러 IP를 허용할 때: `ATTENDANCE_ALLOWED_IPS=192.168.0.25,192.168.0.26`
- 같은 PC에서 API만 시연할 때: `ATTENDANCE_ALLOWED_IPS=127.0.0.1,::1`
- IPv6 주소/대역도 지원합니다. 미설정이면 학생 출석은 403으로 거부합니다. 로그인·출결 조회·관리자의 출결 수정은 그대로 사용할 수 있습니다.

설정을 바꾸면 직접 실행 중인 Node 서버는 재시작하고, Docker 실행 중이면 `docker compose up -d --force-recreate backend`로 환경 변수를 다시 읽습니다. IP 형식이 잘못되면 서버 시작 시 설정 오류를 표시합니다.

### 서버에 보이는 IP 확인 및 시연

먼저 기존 계정으로 로그인하여 쿠키를 받은 뒤 다음 API를 호출합니다. 허용 IP를 아직 설정하지 않아도 자신의 접속 IP를 확인할 수 있습니다.

```bash
# 앞의 로그인 예제에서 생성한 cookies.txt 사용
curl -b cookies.txt http://localhost:3000/api/attendance/network
```

응답의 `clientIp`를 `.env`의 `ATTENDANCE_ALLOWED_IPS`에 넣고 서버를 재시작합니다. 동일한 주소/접속 경로로 로그인·네트워크 확인·출석을 호출하세요.

```json
{
  "clientIp": "192.168.0.25",
  "allowed": true,
  "configured": true,
  "message": "출석 가능한 네트워크입니다."
}
```

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/attendance \
  -H 'Content-Type: application/json' \
  -d '{"period":"LUNCH"}'
```

허용 시 201로 DB에 저장하고, 다른 IP에서는 403으로 저장을 차단합니다. 같은 날짜·시간대의 중복 출석은 기존과 같이 409입니다. 차단 시연은 허용 목록을 다른 IP로 바꾸고 서버를 재시작한 뒤 같은 요청을 보내면 됩니다.

이 기능은 **서버에 보이는 접속 IP**를 판별합니다. 와이파이 이름(SSID)을 읽지는 않습니다. 같은 PC의 `localhost`로 호출하면 와이파이를 바꿔도 루프백 IP로 보입니다. 다른 기기의 와이파이 전환을 시연하려면 그 기기에서 서버의 LAN IP로 직접 접속하세요. 인터넷을 거쳐 접속하면 공유기의 공인 IP가 보일 수 있습니다.

### 프록시/Vite/Docker 경유 시

프록시를 쓰면 실제 클라이언트 IP가 전달되어야 합니다. 기본값은 전달 헤더를 신뢰하지 않습니다. `TRUSTED_PROXY_IPS`에 **실제 프록시의 IP 또는 전용 대역만** 지정하면 해당 프록시에서 보낸 `X-Forwarded-For`를 사용합니다. 서버는 오른쪽부터 확인하여 첫 번째 비신뢰 IP를 클라이언트 IP로 판단합니다. 프록시는 외부에서 받은 전달 헤더를 덮어쓰거나 실제 접속 IP를 마지막에 추가해야 합니다. [Express 공식 설명](https://expressjs.com/en/guide/behind-proxies/)

프론트 메인 화면은 로그인 쿠키로 `GET /api/attendance/network`를 호출하고, `allowed`에 따라 와이파이 이미지를 변경합니다. 출석 버튼은 네트워크가 허용되고 계정의 `status`가 `잔류`, `isChecked`가 `false`일 때 활성화됩니다. `귀가` 상태에서는 버튼을 비활성화하고 `귀가입니다` 문구를 표시합니다. 클릭하면 `POST /api/attendance/check`로 DB에 `isChecked: true`를 저장한 뒤 `체크완료`를 표시하고, 새로고침·재로그인 후에도 완료 상태를 유지합니다. 네트워크는 5초마다, 재연결 시, 화면으로 돌아올 때, 브라우저가 네트워크 전환을 감지할 때 다시 확인합니다. 연결이 끊기거나 조회에 실패하면 와이파이 연결 표시를 끄고 버튼을 비활성화하며, 계정 상태 안내보다 네트워크 연결 안내를 먼저 표시합니다. 체크 요청이 실패한 경우에도 네트워크를 즉시 재확인합니다.

Vite 프록시는 `xfwd: true`로 클라이언트 IP를 전달하며, 외부에서 들어온 `X-Forwarded-For`는 Vite가 소켓에서 확인한 실제 접속 IP로 덮어씁니다. 같은 PC에서 백엔드를 직접 실행할 때는 `Backend/.env`에 `TRUSTED_PROXY_IPS=127.0.0.1,::1`을 설정하고, `ATTENDANCE_ALLOWED_IPS`에는 실제 허용할 기기의 IP 또는 와이파이 IP 대역을 입력합니다. 브라우저에서 `localhost:5173`으로 접속하면 클라이언트 IP가 루프백으로 전달되므로, 와이파이 변경을 확인하려면 `http://서버의-LAN-IP:5173`으로 접속하세요. 해당 프론트 주소도 `FRONTEND_ORIGINS`에 등록해야 합니다. 배포 프록시도 실제 클라이언트 IP를 전달하고 백엔드가 그 프록시만 신뢰하도록 설정해야 합니다.

Docker Desktop의 포트 전달도 원래 IP를 게이트웨이 주소로 바꿀 수 있습니다. `/api/attendance/network`로 확인하고, 모든 기기가 같은 게이트웨이 IP로 보이면 기기별 판별에는 원래 IP를 전달하는 프록시 또는 백엔드 직접 실행이 필요합니다. 게이트웨이 IP를 허용 목록에 넣으면 같은 경로로 들어오는 모든 기기가 허용됩니다.

호스트 PC의 Vite에서 Docker 백엔드로 연결하는 경우에는 `TRUSTED_PROXY_IPS`에 백엔드가 실제로 확인한 Docker 게이트웨이 IP도 등록합니다. 이때 `BACKEND_BIND_IP=127.0.0.1`로 API 포트를 로컬에만 열고, 브라우저는 Vite의 LAN 주소로 접속합니다. 다른 기기가 백엔드에 직접 접속해 전달 헤더를 위조하는 것을 막기 위한 설정입니다. `.env`의 접속 출처·허용 IP·프록시·포트 설정을 바꾼 뒤에는 `docker compose up -d --no-deps --force-recreate backend`로 컨테이너에 다시 적용해야 합니다. `restart`만으로는 변경한 환경변수를 읽지 않습니다.

## 팀원의 다른 컴퓨터에서 사용

### 각자 같은 개발 환경 실행

팀원이 이 저장소를 clone하고 위의 `.env` 설정과 `docker compose up -d --build`를 실행하면 같은 구조의 DB와 API가 생성됩니다. 팀원 PC에 Node/MySQL을 별도로 설치할 필요가 없습니다. macOS/Windows/Linux에서 Docker Desktop 또는 Docker Engine + Compose를 사용할 수 있습니다.

**각 PC의 데이터는 별개입니다. Docker나 Git이 DB의 실제 데이터를 자동 동기화하지는 않습니다.** 계정은 각 환경에서 위 명령으로 생성합니다.

### 같은 데이터를 함께 사용하는 공용 개발 서버

한 컴퓨터에서 Docker를 실행하고, 팀원은 `http://서버의-LAN-IP:3000`으로 API를 호출합니다. 예: `http://192.168.0.10:3000/health`. 서버가 켜져 있고 같은 네트워크/VPN에 연결되어 있어야 하며 서버 방화벽에서 API 포트 접근을 허용해야 합니다.

이처럼 API 포트로 직접 접속을 허용하려면 `BACKEND_BIND_IP=0.0.0.0`을 설정하고 컨테이너를 다시 생성합니다. Docker 게이트웨이를 신뢰 프록시로 등록한 Vite 연동 환경에서는 API를 로컬에만 열고 프론트 주소를 공유하세요.

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
- `002_account_status`는 `user_accounts`에 `status VARCHAR(15) NOT NULL DEFAULT ''`를 추가합니다. 기존 계정과 상태를 지정하지 않은 새 계정의 기본값은 빈 문자열입니다.

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
| `DATABASE_URL` | Supabase/PostgreSQL 연결 문자열. 설정 시 MySQL 대신 사용 |
| `DATABASE_SSL` | PostgreSQL TLS 사용 / 기본 `true`. `false`는 로컬 테스트만 허용 |
| `DATABASE_SSL_CA_FILE` | PostgreSQL 서버 CA 인증서 경로 / 선택 |
| `FRONTEND_ORIGINS` | 허용할 프론트 주소 목록 |
| `SESSION_HOURS` | 로그인 유지 시간 / `24` (1~720) |
| `COOKIE_SECURE` | HTTPS 쿠키 사용 / 로컬 `false`, HTTPS `true` |
| `ATTENDANCE_ALLOWED_IPS` | 학생 출석 허용 IP/CIDR 목록, 쉼표 구분 / 비어 있으면 출석 차단 |
| `TRUSTED_PROXY_IPS` | 원본 IP 전달을 신뢰할 프록시 IP/CIDR 목록 / 기본은 전달 헤더 무시 |

서버와 MySQL 시각은 UTC를 사용하고, 학생 출석 날짜는 `Asia/Seoul` 기준으로 계산합니다.

## 테스트와 직접 실행

Docker 안에서 실행:

```bash
docker compose exec backend npm test
docker compose exec backend npm run test:integration
```

통합 테스트는 임의 이름의 `mentos_test_*` DB 두 개를 생성하여 새 DB 초기화, 기존 데이터 보존, 로그인, 만료/로그아웃, 권한, 중복 출결, 동시 신청을 검증한 뒤 **테스트 DB만** 삭제합니다. DB 생성 권한이 있는 개발용 사용자로 실행합니다.

`npm test`에는 DB 없이 실행하는 IP/CIDR 및 실제 HTTP 네트워크 제한 테스트도 포함합니다. 허용/차단, IP 미설정, 잘못된 설정, 위조 전달 헤더, 프록시 체인, IPv6와 출석 저장 호출을 확인합니다. DB 저장은 이 테스트에서 모의 처리하며, 실제 DB 동작은 별도 통합 테스트로 검증합니다.

Docker 없이 실행하려면 Node.js 22 이상(이미지는 24), MySQL 8.0.16 이상과 `.env` 설정이 필요합니다.

```bash
npm ci
npm run dev
```

`npm run dev`는 Node 내장 watch 모드, `npm start`는 일반 실행입니다. DB 연결이나 마이그레이션이 실패하면 서버를 열지 않고 종료합니다.

학생 로그인·메인페이지는 기본적으로 점심 12:30–14:00, 저녁 18:00–19:30에 이용하며, 시간 외 입장 토글을 켠 브라우저에서는 최대 한 시간 동안 입장을 허용합니다. 운영의 실제 출결 제출은 해당 시간으로 제한합니다. 미제출자의 자동 결석 처리, 승인된 귀가의 자동 공결 처리는 학교 운영 규칙이 정해지지 않아 자동화하지 않았습니다. 관리자가 출결 상태를 직접 기록할 수 있습니다. 로그인 요청 제한은 단일 서버 메모리 기준 IP당 15분에 20회입니다.
