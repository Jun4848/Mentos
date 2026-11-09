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
  "accessToken": "64자리 임의 토큰",
  "expiresAt": "2026-10-21T00:00:00.000Z"
}
```

`Set-Cookie`의 `mentos_session` 또는 `Authorization: Bearer <accessToken>`을 이후 요청에 전달합니다. Bearer 헤더가 있으면 쿠키보다 우선합니다. `/me`는 토큰·만료 시간을 제외한 계정 정보를 반환합니다. 비밀번호/해시는 응답에 포함하지 않습니다. 만료·로그아웃 후에는 401입니다.

로그인과 `/me` 응답의 `status`는 계정에 저장된 상태 문자열(예: `잔류`, `귀가`)이며, 미설정 시 빈 문자열입니다.

## 출결

| 메서드 | 경로 | 권한 | 요청 / 동작 |
| --- | --- | --- | --- |
| GET | `/api/attendance/network` | 로그인 | 접속 IP와 출석 허용 여부 확인 |
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
