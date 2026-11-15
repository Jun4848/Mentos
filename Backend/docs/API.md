# API

기본 주소: `http://localhost:3000`. JSON 본문은 `Content-Type: application/json`으로 보냅니다. 오류 형식은 `{"message":"설명"}`입니다.

## 인증

| 메서드 | 경로 | 인증 | 동작 |
| --- | --- | --- | --- |
| GET | `/health` | 없음 | 서버/DB 연결 확인 |
| POST | `/api/auth/login` | 없음 | 아이디·비밀번호 검증, 세션 발급 |
| GET | `/api/auth/me` | 필요 | 현재 계정 정보 |
| POST | `/api/auth/logout` | 필요 | 현재 세션 폐기, 204 |

로그인 요청:

```json
{"id":"student01","password":"계정의 비밀번호"}
```

성공 응답(200):

```json
{
  "id": "student01",
  "name": "홍길동",
  "roomNumber": "301",
  "role": "STUDENT",
  "status": "잔류",
  "isChecked": false,
  "accessToken": "64자리 임의 토큰",
  "expiresAt": "2026-10-21T00:00:00.000Z"
}
```

`Set-Cookie`의 `mentos_session` 또는 `Authorization: Bearer <accessToken>`을 이후 요청에 전달합니다. Bearer 헤더가 있으면 쿠키보다 우선합니다. `/me`는 토큰·만료 시간을 제외한 계정 정보를 반환합니다. 비밀번호/해시는 응답에 포함하지 않습니다. 만료·로그아웃 후에는 401입니다.

로그인과 `/me` 응답의 `status`는 계정에 저장된 상태 문자열(예: `잔류`, `귀가`)이며, 미설정 시 빈 문자열입니다.

`isChecked`는 JSON boolean이며 기본값은 `false`입니다. 체크를 완료하면 DB에 `true`와 만료 시각 `checked_until`을 저장합니다. 점심 체크는 저녁 시작 10분 전인 17:50까지, 저녁 체크는 22:30까지 유지하고 해당 시각부터 `false`로 자동 초기화합니다. 새로고침·재로그인·서버 재시작 후에도 만료 시각 전까지 유지됩니다. 접속 시간 제한은 그대로 14:00·19:30에 끝나며 초기화 전까지 관리자가 체크 상태를 확인할 수 있습니다.

### 학생 이용 시간

학생 로그인·메인페이지는 기본적으로 한국 시간 기준 점심 **12:30 이상 14:00 미만**, 저녁 **18:00 이상 19:30 미만**에 이용합니다. 시간 외 입장 토글을 켠 브라우저에서는 최대 한 시간 동안 입장이 가능합니다. 운영의 실제 출석 제출은 기존 시간표를 유지합니다. 관리자는 시간 제한 없이 로그인하고 관리자 페이지를 이용합니다.

- `GET /api/attendance/schedule`: 로그인 없이 서버 기준 날짜·시각·시간대와 `allowed`, 안내 `message`를 조회합니다. 응답은 캐시하지 않습니다.
- 시간 외 학생 로그인은 비밀번호 검증 후 `403`, `code: "ATTENDANCE_TIME_CLOSED"`와 이용 시간 안내를 반환하며 세션·쿠키를 발급하지 않습니다. 잘못된 비밀번호는 기존처럼 401입니다.
- 기존 로그인 세션이 있어도 메인페이지에 직접 접근하면 서버 시간을 확인하고 로그인 화면으로 이동합니다. 열어 둔 화면도 종료 시간이 되면 닫힙니다. 로그인 화면에 이용 시간을 상시 표시하지 않으며, 시간 외 로그인 버튼을 눌러 거부되었을 때 이용 시간 안내 모달을 표시합니다. 확인 중이거나 서버에 연결할 수 없으면 메인페이지를 표시하지 않습니다.
- `POST /api/attendance/check`, `POST /api/attendance`는 기존 세션·허용 IP가 있어도 시간 밖이면 같은 403 코드로 거부합니다. 관리자 조회·수정, `/api/auth/me`, 로그아웃에는 시간 제한을 적용하지 않습니다.

로그인 페이지 오른쪽 아래에는 작은 **시간 외 입장** 토글이 있습니다. 켜면 해당 브라우저에서만 최대 한 시간 동안 학생 로그인·메인페이지 입장을 허용합니다. 끄거나 만료되면 원래 시간표로 돌아갑니다. 아이디·비밀번호와 학생 권한을 검사하며, 운영의 실제 출석에는 기존 시간표·와이파이·잔류·미체크 검사를 적용합니다. 로컬 개발에서는 기존 시간 전환에 따른 체크 API 동작도 유지합니다.

- `PATCH /api/attendance/preview`, `{"enabled":true|false}`: 시간 외 입장 쿠키를 설정·해제합니다. 쿠키는 HttpOnly·SameSite=Lax이며 HTTPS에서는 Secure를 적용하고 다른 브라우저에는 적용하지 않습니다.
- `/api/attendance/schedule`은 `previewAvailable`, `previewEnabled`, `previewExpiresAt`도 반환합니다. 만료되면 자동으로 원래 시간표가 적용됩니다.
- 서버 `ENABLE_ATTENDANCE_TIME_TOGGLE=true`일 때 운영·개발 화면 모두에서 표시합니다. `false`이면 설정 API를 거부하고 기존 입장 쿠키도 무시합니다. 운영의 출석 API는 이 토글로 시간 제한을 우회할 수 없습니다.

## 관리자 호실 현황

`GET /api/admin/dormitory`는 관리자 로그인 쿠키 또는 Bearer 토큰이 필요합니다. 학생은 403, 미로그인은 401입니다. 비밀번호·세션 정보는 반환하지 않습니다.

`user_accounts`의 `STUDENT` 계정만 조회해 2층 201–215호, 3층 301–315호, 4층 401–415호에 배치합니다. 호실당 정원은 4명, 전체 45개 호실/180명입니다. 반환값은 `floors[].rooms[].students`, `summary`, `unassignedStudents`, `serverTime`, `date`, `currentPeriod`, `periods`를 포함합니다. DB에 추가한 학생은 다음 조회에서 자동으로 나타납니다.

- `attendanceStatus`: 귀가 상태면 체크 값과 무관하게 `HOME`, 그 외 `isChecked=true`는 `CHECKED`, `false`는 `UNCHECKED`입니다. 화면에는 각각 `귀가`, `출석완료`, `미체크`로 표시합니다.
- 날짜·현재 시각은 `Asia/Seoul` 기준입니다. 점심은 12:30 이상 14:00 미만, 저녁은 18:00 이상 19:30 미만이며, 시간 밖의 `currentPeriod`는 `null`입니다.
- 등록된 호실이 범위 밖이면 `unassignedStudents`에, 정원보다 많으면 해당 호실의 `overCapacity`에 표시합니다. 실제 학생을 삭제하거나 임의의 방으로 이동하지 않습니다.
- 관리자 화면은 5초마다 현재 DB 상태를 다시 조회하고, 다시 화면에 돌아오거나 연결이 복구되면 즉시 갱신합니다. 귀가(파랑)·출석완료(초록)·미체크(주황)를 구분하며 학생 이름만 표시합니다. 층 선택은 2·3·4층을 지원합니다. 점심 체크는 17:50, 저녁 체크는 22:30에 초기화하며 날짜·식사별 과거 이력은 생성하지 않습니다.
- 만료 시 서버 타이머가 DB를 갱신합니다. 서버가 꺼져 있었으면 재시작 직후 처리하며 인증·관리자 조회 전에도 만료를 검사합니다. 기존 체크에 만료 시각을 추가할 때는 기존 수정 시각을 기준으로 다음 초기화 시각을 지정하고, 학생 이름·호실·귀가 상태는 유지합니다.

## 출결

| 메서드 | 경로 | 권한 | 요청 / 동작 |
| --- | --- | --- | --- |
| GET | `/api/attendance/network` | 로그인 | 접속 IP와 출석 허용 여부 확인 |
| GET | `/api/attendance/schedule` | 없음 | 서버 기준 학생 이용 시간·허용 여부 확인 |
| POST | `/api/attendance/check` | 학생 + 허용 IP + 잔류 + 미체크 | 본인 계정의 `isChecked`를 `true`로 저장 |
| GET | `/api/attendance` | 로그인 | 학생은 본인, 관리자는 전체 기록 |
| POST | `/api/attendance` | 학생 + 허용 IP | `{"period":"LUNCH"}` 당일 본인 출석 |
| PUT | `/api/attendance` | 관리자 | 학생·날짜·시간대별 출결 생성/수정 |

### 네트워크 확인

로그인 후 `GET /api/attendance/network`를 호출합니다. 네트워크가 허용되지 않아도 조회 자체는 200이며, `allowed`로 판별합니다. 인증이 없거나 만료되면 401입니다.

```json
{
  "clientIp": "192.168.0.25",
  "allowed": true,
  "configured": true,
  "message": "출석 가능한 네트워크입니다."
}
```

- `clientIp`: 서버가 확인한 접속 IP. IPv4-mapped IPv6는 IPv4로 표시합니다. 유효하지 않은 IP는 `null`이며 차단합니다.
- `allowed`: `.env`의 `ATTENDANCE_ALLOWED_IPS`에 일치하는지 여부입니다. IP 또는 CIDR을 쉼표로 구분합니다.
- `configured`: 허용 IP가 하나 이상 등록되어 있는지 여부입니다. 미설정이면 `allowed: false`입니다.
- `message`: 연결 상태 또는 설정 안내입니다.

학생이 `POST /api/attendance`를 호출할 때도 서버가 매번 IP를 다시 검사합니다. 차단되면 **403과 위 구조의 응답**을 반환하고 DB에 출석을 저장하지 않습니다. 네트워크 조회를 먼저 호출할 필요는 없습니다. 본문에서 보낸 IP/허용 여부는 판별에 사용하지 않습니다. 관리자 `PUT`과 출결 조회는 IP 제한 대상이 아닙니다.

직접 접속은 소켓의 IP를 사용합니다. `TRUSTED_PROXY_IPS`에 지정된 프록시에서 접속한 경우에만 `X-Forwarded-For`를 신뢰합니다. IP는 와이파이 이름이 아니라 서버에 보이는 주소이며, 프록시/NAT가 주소를 바꾸면 실제 기기 주소와 다를 수 있습니다. 로컬·Vite·Docker 환경의 설정과 시연 순서는 [README](../README.md#발표용-와이파이ip-설정)를 참고하세요.

개발 서버의 학생 메인페이지에는 작은 **와이파이 전환** 스위치가 있습니다. 켜면 연결됨, 끄면 연결 안 됨으로 시연하며 네트워크 표시와 출석 API에 같은 상태를 적용합니다. **자동**을 누르면 실제 IP 판별로 돌아갑니다. 이 설정은 해당 브라우저에서 최대 한 시간 유지하며 실제 기기의 와이파이를 변경하지 않습니다.

- `PATCH /api/attendance/network/preview`, `{"allowed":true|false|null}`: 학생 로그인 후 연결·해제를 적용하거나 `null`로 원래 IP 판별을 복원합니다. 브라우저별 HttpOnly·SameSite=Lax 쿠키를 사용합니다.
- 네트워크 응답에 `previewAvailable`, `previewEnabled`, `previewExpiresAt`이 포함됩니다. `configured`는 실제 IP 허용 목록의 설정 여부입니다.
- 프론트 개발 모드와 서버 `ENABLE_ATTENDANCE_NETWORK_TOGGLE=true`에서만 표시합니다. 로컬 Docker Compose는 기본 활성화하며, `NODE_ENV=production` 또는 플래그 비활성화 시 기존 쿠키를 무시하고 변경 API를 거부합니다.
- 와이파이 시연 중에도 로그인·학생 권한·출석 이용 시간·잔류·미체크 조건을 검사합니다. 실제 인터넷/서버 연결이 끊기면 토글과 관계없이 출석할 수 없습니다.

### 사용자 체크 버튼

메인 화면의 버튼은 `allowed === true && status === '잔류' && isChecked === false`일 때 활성화됩니다. `귀가` 상태에서는 버튼을 비활성화하고 `귀가입니다` 문구를 표시합니다. 와이파이가 불일치하면 네트워크 안내도 함께 표시합니다. `POST /api/attendance/check`는 요청 본문 없이 호출하며, 서버도 로그인·학생 권한·네트워크·DB 상태를 다시 검사합니다. 사용자 아이디나 `isChecked` 값을 본문으로 지정할 수 없습니다.

성공하면 `200 {"isChecked":true,"status":"잔류"}`를 반환하고 화면에 비활성화된 `체크완료` 버튼을 표시합니다. 귀가 상태에서는 `403 {"message":"귀가입니다"}`를 반환합니다. 잔류 상태가 아니거나 네트워크가 허용되지 않아도 403, 이미 체크했거나 동시 요청 중 상태가 변경되면 409입니다. 계정의 체크 상태를 기록하는 API이며, 날짜·시간대별 `attendance_records`는 별도의 기존 API로 관리합니다.

### 출결 조회와 기록

조회 쿼리: `date=2026-10-20`(생략 시 한국의 오늘), `period=LUNCH`, `studentId=student01`(관리자용). 응답은 `{"records":[...]}`이며 이름·현재 호수·상태·기록자도 포함합니다.

관리자 기록 예:

```json
{"studentId":"student01","date":"2026-10-20","period":"EVENING","status":"EXCUSED"}
```

- 시간대: `MORNING` 아침, `LUNCH` 점심, `EVENING` 저녁
- 상태: `PRESENT` 출석, `LATE` 지각, `ABSENT` 결석, `EXCUSED` 공결
- 학생 요청에서 날짜·학생·상태를 임의 지정하면 400, 중복 출석은 409입니다.
- 미제출은 기록이 없는 상태입니다. 자동으로 결석/공결로 바꾸지 않습니다.

## 외출·귀가 신청

| 메서드 | 경로 | 권한 | 동작 |
| --- | --- | --- | --- |
| GET | `/api/leaves` | 로그인 | 학생은 본인, 관리자는 전체 신청 조회 |
| POST | `/api/leaves` | 학생 | 본인 신청 생성, 201 |
| PATCH | `/api/leaves/:id/status` | 로그인 | 학생은 본인 취소, 관리자는 승인·반려·취소 |

신청:

```json
{
  "type":"OUTING",
  "startsAt":"2026-10-23T18:00:00+09:00",
  "endsAt":"2026-10-23T20:00:00+09:00",
  "reason":"개인 용무"
}
```

`type`은 `OUTING`(외출), `HOME_VISIT`(귀가)입니다. 시간에는 `+09:00` 또는 `Z` 같은 시간대를 반드시 포함합니다. DB 및 응답 시간은 UTC입니다. 귀가도 같은 형식으로 시작·종료 시각을 보냅니다. `reason`은 선택, 최대 500자입니다.

동일 학생의 대기·승인 신청 기간이 겹치면 409입니다. 생성 상태는 `PENDING`이고 다음 상태 변경을 지원합니다.

- `PENDING` → `APPROVED` / `REJECTED`: 관리자만
- `PENDING` / `APPROVED` → `CANCELLED`: 학생 본인 또는 관리자
- `REJECTED` / `CANCELLED`는 재처리할 수 없습니다. 필요한 경우 새로 신청합니다.

승인 요청 예:

```json
{"status":"APPROVED"}
```

조회 쿼리: `type`, `status`, `studentId`(관리자용), `offset`(0 이상). 최신 시작 시각부터 100개씩 반환합니다.

```json
{"applications":[],"offset":0,"limit":100}
```

이 API의 귀가는 **집에 다녀오는 신청 유형**입니다. 실제 기숙사 출입/복귀 이벤트를 기록하는 기능은 포함하지 않습니다.

## 오류 상태

| 코드 | 의미 |
| --- | --- |
| 400 | 입력 형식·날짜·enum 오류 |
| 401 | 로그인 필요, 비밀번호 오류, 세션 만료 |
| 403 | 타인 정보 접근, 권한 부족, 허용되지 않은 브라우저 출처, 출석 허용 IP 불일치/미설정 |
| 404 | 존재하지 않는 API/학생/신청 |
| 409 | 중복 출결, 신청 기간 중복, 처리 완료된 신청 |
| 413 | JSON 본문 16KB 초과 |
| 429 | 로그인 IP 제한: 15분에 20회 초과 |
| 500 | 서버/DB 오류 |
