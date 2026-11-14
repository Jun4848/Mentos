# Supabase와 Vercel 배포

저장소 루트의 `vercel.json`은 Vercel Services로 React·Vite 프론트와 Express 백엔드를 함께 배포합니다. Services는 현재 베타 기능입니다.

| 요청 경로 | 연결 대상 |
| --- | --- |
| `/api/*` | `Backend`의 Express API |
| `/health` | 실제 DB 연결을 확인하는 백엔드 상태 API |
| 나머지 경로 | `Frontend`의 Vite 빌드 |

프론트 서비스의 SPA rewrite는 `/main`, `/admin` 직접 접속과 새로고침을 지원합니다. API는 같은 배포 도메인에서 호출하며 기존 HttpOnly 세션 쿠키를 사용합니다. Vercel에서는 플랫폼이 전달한 마지막 접속 IP를 사용합니다.

배포 설정은 다음 순서로 적용합니다.

1. Vercel에서 `Mentos` 프로젝트를 생성하거나 기존 프로젝트에 저장소를 연결합니다. Root Directory는 저장소 루트로 설정합니다.
2. Supabase의 Connect 화면에서 Session pooler 연결 문자열을 확인하고, 아래 환경변수를 Vercel Production에 등록합니다. 연결 문자열에 들어가는 DB 비밀번호는 URL 인코딩합니다.
3. Preview를 사용할 경우 해당 환경의 DB 연결을 별도로 등록합니다.
4. Vercel 프로젝트를 로컬 저장소에 연결하고 소스에서 배포합니다. 백엔드 시작 시 기존 마이그레이션 실행기가 `mentos` 스키마를 확인하며, 동시에 시작하는 서버는 PostgreSQL advisory lock으로 순서를 보장합니다.
5. 배포 URL에서 상태 API, 관리자 로그인, 세션 유지, 학생 출석과 네트워크 제한을 확인합니다.

| 환경변수 | 운영 설정 |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase Session pooler 연결 문자열 |
| `DATABASE_SSL` | `true` |
| `DATABASE_SSL_CA_FILE` | `certs/supabase-ca.crt` |
| `FRONTEND_ORIGINS` | 실제 프론트 배포 Origin. 여러 주소는 쉼표로 구분 |
| `COOKIE_SECURE` | `true` |
| `SESSION_HOURS` | `24` |
| `ATTENDANCE_ALLOWED_IPS` | 실제 출석 허용 네트워크의 공인 IP 또는 CIDR |
| `ENABLE_ATTENDANCE_TIME_TOGGLE` | `false` |
| `ENABLE_ATTENDANCE_NETWORK_TOGGLE` | `false` |

`ATTENDANCE_ALLOWED_IPS`가 비어 있으면 학생 출석은 차단됩니다. 학교 와이파이와 모바일 데이터에서 `/api/attendance/network`의 `clientIp`, `allowed`를 확인해 허용 설정을 검증합니다. Vercel 외 환경에서는 기존 `TRUSTED_PROXY_IPS` 설정을 사용합니다.

DB CA 인증서와 SQL 파일은 백엔드 함수 번들에 포함합니다. `.vercelignore`는 로컬 환경변수, 백업, 쿠키 파일과 설치·빌드 결과물을 업로드에서 제외합니다. DB 비밀번호와 연결 문자열은 서버 환경변수로 관리합니다.

학생 로그인과 출석은 한국 시간 12시 30분~14시, 18시~19시 30분에 가능합니다. 운영 모드에서는 개발용 시간·네트워크 토글을 사용할 수 없습니다. Vercel의 scale-to-zero 환경에서는 요청이 없는 동안 프로세스 타이머 실행을 보장할 수 없으며, 기존 조회·인증·서버 시작 경로가 만료된 체크 상태를 정리합니다. 접속 여부와 관계없는 정시 DB 갱신이 필요하면 Supabase Cron 같은 외부 스케줄 실행이 추가로 필요합니다.

2026년 11월 14일 로컬 검증 결과는 다음과 같습니다.

| 검증 항목 | 결과 |
| --- | --- |
| `Frontend`에서 `npm run build` | 성공 |
| `Backend`에서 `npm test` | 22개 통과 |
| 임시 PostgreSQL 17에서 `npm run test:postgres` | 12개 통과 |
| 로그인, 인증 정보 조회, 상태 API | 실제 로컬 PostgreSQL 연동으로 HTTP 200 확인 |
| 배포용 서버 진입점으로 시작한 운영 모드 API | 상태·로그인·인증 정보 조회 200, Secure·HttpOnly 쿠키 확인 |
| API 검증 후 동시 세션 조회 20건 | 20건 모두 HTTP 200 |
| 운영 모드 로그아웃 | HTTP 204, 이후 기존 세션 HTTP 401 |
| 동시 출석 체크 2건 | HTTP 200 1건, 409 1건 |
| 동시 외출 신청 2건 | HTTP 201 1건, 409 1건 |
| 마이그레이션 동시 실행 | 적용 버전 3개와 기존 데이터 보존 확인 |
| Vercel IP 처리 회귀 테스트 | 마지막 전달 IP 사용과 일반 환경의 위조 헤더 차단 확인 |
| Vercel 공식 설정 스키마 기반 속성 검증 | 통과 |

스키마 검증에는 공식 JSON의 오래된 Draft 4 선언을 제외하고 실제 속성 정의를 Draft 7 검증기로 확인했습니다. 공식 JSON에는 최신 형식의 `exclusiveMinimum` 등이 함께 포함되어 있습니다.

운영 배포와 원격 Supabase DB 연결은 아직 검증 전입니다. 두 플러그인의 설치 상태는 확인했으나 현재 세션에는 해당 서비스의 호출 도구가 나타나지 않았습니다. 공식 Vercel CLI도 로그인되지 않은 상태이며 `api.vercel.com` 연결이 시간 초과로 실패했습니다. 이 세션에서 Supabase 접속 정보와 원격 Vercel 프로젝트를 아직 조회하지 못했습니다.

작업 브랜치는 `chore/supabase-vercel-deploy`입니다. 현재 저장소에는 `dev` 브랜치가 없으며 GitHub 인증이 없어 Issue 생성과 번호 반영을 완료하지 못했습니다.

참고 문서는 [Vercel Services](https://vercel.com/docs/services), [Services 설정](https://vercel.com/docs/services/config-reference), [Supabase DB 연결](https://supabase.com/docs/guides/database/connecting-to-postgres)입니다.
