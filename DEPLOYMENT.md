# Supabase와 Vercel 배포

저장소 루트의 `vercel.json`은 Vercel Services로 React·Vite 프론트와 Express 백엔드를 함께 배포합니다. Services는 현재 베타 기능입니다. 2026년 11월 15일 시간 외 입장 토글과 서버리스 DB 연결 관리 보강까지 Production에 반영하고 API·동시성 검증을 완료했습니다.

| 배포 항목 | 값 |
| --- | --- |
| 운영 주소 | https://gbsw-dams.vercel.app |
| DB 상태 API | https://gbsw-dams.vercel.app/health |
| Vercel 프로젝트 | `mentos` / `prj_knSgRSeudL78y4e223OxDQJEF8db` |
| Vercel 팀 | `squid4848-2834s-projects` |
| 검증한 Production 배포 | `dpl_CGy4XyT8FY9YM5PSywLbi8soWfv4` / `READY` |
| Supabase 프로젝트 | `Mentos-1` / `hqzugvzzdcjfprckdafz` / Singapore |
| DB 연결 | `mentos_app` 전용 계정, Session pooler 5432, TLS CA·호스트 인증서 검증 |
| Node.js | Vercel 프로젝트 설정 `24.x` |

이번 배포는 `b303a6f` 이후 기존 미커밋 기능 변경을 포함한 현재 작업 폴더의 소스를 API로 업로드했습니다. Git 연동에 의한 자동 배포는 구성하지 않았습니다. 배포 소스 66개 파일의 경로·base64 내용·인코딩으로 구성된 JSON 배열의 SHA-256은 `26cdab55a24467a0fc4ab0daee7415a87a097762e64b5913da16296efa1f15b3`입니다. Git 커밋 하나만 체크아웃한 결과와는 구분해야 합니다. 기존 `mentos-squid4848.vercel.app`은 현재 운영 주소로 307 리디렉션되므로 쿠키·인증 API 검증은 새 운영 주소에 직접 요청합니다.

| 요청 경로 | 연결 대상 |
| --- | --- |
| `/api/*` | `Backend`의 Express API |
| `/health` | 실제 DB 연결을 확인하는 백엔드 상태 API |
| 나머지 경로 | `Frontend`의 Vite 빌드 |

프론트 서비스의 SPA rewrite는 `/main`, `/admin` 직접 접속과 새로고침을 지원합니다. API는 같은 배포 도메인에서 호출하며 기존 HttpOnly 세션 쿠키를 사용합니다. Vercel에서는 플랫폼이 전달한 마지막 접속 IP를 사용합니다.

배포 설정은 다음 순서로 적용합니다.

1. Vercel에서 `Mentos` 프로젝트를 생성하거나 기존 프로젝트에 저장소를 연결합니다. Root Directory는 저장소 루트로 설정합니다.
2. Supabase의 Connect 화면에서 Session pooler 연결 문자열을 확인하고, 아래 환경변수를 Vercel Production에 등록합니다. 연결 문자열에 들어가는 DB 비밀번호는 URL 인코딩합니다. 현재 `DATABASE_URL`은 전용 계정의 연결 문자열로 등록한 Secret이며 값은 문서와 저장소에 남기지 않습니다.
3. Preview를 사용할 경우 해당 환경의 DB 연결을 별도로 등록합니다.
4. Vercel 프로젝트를 로컬 저장소에 연결하고 소스에서 배포합니다. 두 서비스는 `npm ci --include=dev`로 빌드 도구까지 설치합니다. 백엔드는 `npm run build`로 `@vercel/ncc` 0.45.0 번들과 SQL 자산을 생성하고, 고정 진입점 `Backend/server.cjs`에서 실행합니다. Services가 빌드 전에 진입점을 검사하므로 생성 전인 `dist/index.js`를 진입점으로 직접 지정하지 않습니다. 백엔드 시작 시 기존 마이그레이션 실행기가 `mentos` 스키마를 확인하며, 동시에 시작하는 서버는 PostgreSQL advisory lock으로 순서를 보장합니다.
5. 배포 URL에서 상태 API, 관리자 로그인, 세션 유지, 학생 출석과 네트워크 제한을 확인합니다.

| 환경변수 | 운영 설정 |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase Session pooler 연결 문자열 |
| `DATABASE_SSL` | `true` |
| `DATABASE_SSL_CA` | `Backend/certs/supabase-ca.crt`의 공개 PEM 인증서 내용. 운영에서 사용 |
| `DATABASE_SSL_CA_FILE` | PEM 환경변수가 없을 때 사용하는 파일 경로. 로컬에서는 `certs/supabase-ca.crt` |
| `FRONTEND_ORIGINS` | 실제 프론트 배포 Origin. 여러 주소는 쉼표로 구분 |
| `COOKIE_SECURE` | `true` |
| `SESSION_HOURS` | `24` |
| `ATTENDANCE_ALLOWED_IPS` | 실제 출석 허용 네트워크의 공인 IP 또는 CIDR |
| `ENABLE_ATTENDANCE_TIME_TOGGLE` | `true`: 브라우저별 최대 한 시간의 시간 외 입장 |
| `ENABLE_ATTENDANCE_NETWORK_TOGGLE` | `false` |

`ATTENDANCE_ALLOWED_IPS`가 비어 있으면 학생 출석은 차단됩니다. 학교 와이파이와 모바일 데이터에서 `/api/attendance/network`의 `clientIp`, `allowed`를 확인해 허용 설정을 검증합니다. Vercel 외 환경에서는 기존 `TRUSTED_PROXY_IPS` 설정을 사용합니다.

DB CA 인증서와 SQL 파일은 백엔드 함수 번들에 포함합니다. 운영에서는 함수 실행 경로와 무관하게 인증서를 검증하도록 `DATABASE_SSL_CA`를 우선 사용합니다. `rejectUnauthorized: true`를 유지하며 인증서 검증을 끄지 않습니다. `.vercelignore`는 로컬 환경변수, 백업, 쿠키 파일과 설치·빌드 결과물을 업로드에서 제외합니다. 이번 API 업로드도 실행에 필요한 파일만 명시적으로 포함했습니다. DB 비밀번호와 연결 문자열은 서버 환경변수로 관리합니다.

일시 중지됐던 Supabase 프로젝트를 복구한 뒤 사용자 승인으로 `mentos_app` 로그인 역할에 `postgres` DB의 `CONNECT`, `CREATE`만 부여했습니다. 이 역할은 `mentos` 스키마와 앱 테이블을 소유하며 superuser·다른 역할 생성·DB 생성·전역 RLS 우회 권한은 없습니다. 기존 `public.student` 테이블은 보존했습니다. 앱의 5개 테이블은 RLS가 켜져 있고 `anon`, `authenticated`에는 SELECT 권한이 없습니다. Supabase 보안 Advisor의 정책 없음 알림 6개는 INFO 등급입니다. 앱 스키마는 Express에서만 접근하도록 의도한 구성이며, 기존 `public.student`의 정책은 이번 작업에서 변경하지 않았습니다. [Advisor 설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

학생 로그인과 메인페이지는 기본적으로 한국 시간 12시 30분~14시, 18시~19시 30분에 이용합니다. 로그인 화면 우측 하단의 작은 시간 외 입장 토글을 켜면 해당 브라우저에서 최대 한 시간 동안 로그인·메인 입장을 허용합니다. 운영의 실제 출석 시간표와 네트워크 제한은 유지하며 개발용 네트워크 토글은 사용할 수 없습니다. Vercel의 scale-to-zero 환경에서는 요청이 없는 동안 프로세스 타이머 실행을 보장할 수 없으며, 기존 조회·인증·서버 시작 경로가 만료된 체크 상태를 정리합니다. 접속 여부와 관계없는 정시 DB 갱신이 필요하면 Supabase Cron 같은 외부 스케줄 실행이 추가로 필요합니다.

Vercel에서는 DB 초기화 완료를 기다리는 요청 처리 함수를 즉시 export합니다. 첫 요청들이 하나의 초기화 Promise를 공유하며 실패 시 HTTP 503과 캐시 금지를 반환하고 다음 요청에서 재시도합니다. 로컬 서버는 기존 시작·종료 방식과 만료 타이머를 유지합니다. PostgreSQL 풀은 Vercel 함수당 최대 1개, idle timeout 1초로 제한하고 `@vercel/functions`의 `attachDatabasePool`로 중지 전 유휴 연결을 반환합니다. 로컬 풀 설정은 그대로 유지합니다. [Vercel DB 풀 수명 관리](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool)

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
| Vite 8.3.3 잠금 파일 기준 새 폴더 설치·운영 빌드 | 성공 |
| `Backend`에서 `npm run build` | ncc CJS 번들·SQL 자산 생성 성공 |
| `Backend/server.cjs` 운영 모드 검증 | 상태·로그인·인증 정보 조회 200, 동시 세션 20건 성공, 로그아웃 204·기존 세션 401 |
| PEM 환경변수와 존재하지 않는 인증서 파일 경로를 함께 지정한 실제 Supabase 접속 | 파일 경로에 의존하지 않고 CA 검증·`SELECT 1` 성공 |

2026년 11월 14일 최초 운영 배포에서 순차 API 검증 후 동시성 테스트를 실행한 결과는 다음과 같습니다.

| 원격 검증 항목 | 결과 |
| --- | --- |
| `/`, JavaScript 자산, `/main`, `/admin` 직접 요청 | HTTP 200. 화면 렌더링·클릭 검증과는 구분 |
| `/health` | HTTP 200, `database: connected` |
| 임시 관리자 계정 로그인, `/api/auth/me` | 모두 HTTP 200 |
| 로그인 쿠키 | Secure·HttpOnly·SameSite=Lax 확인 |
| 관리자 호실, 출결 목록, 외출 목록 | 모두 HTTP 200 |
| 공개 이용 시간 조회 | HTTP 200, 시간 외 `allowed: false` |
| 시간 외 학생 로그인 | HTTP 403, `ATTENDANCE_TIME_CLOSED` 확인 |
| 네트워크 조회 | HTTP 200, 학교 IP 미설정으로 `allowed: false` |
| 운영 환경의 개발용 시간 토글, 미허용 Origin 요청 | 모두 HTTP 403 |
| 동시 세션 조회 20건 | 20건 모두 HTTP 200 |
| 동일 학생·날짜·시간대 관리자 출결 UPSERT 2건 | 2건 모두 HTTP 200, DB 행 1개 유지 |
| 로그아웃, 이후 기존 세션 재사용 | HTTP 204, HTTP 401 |
| 임시 검증 계정·출결·세션 정리 | 삭제 완료, 잔여 테스트 계정·출결·세션 0개 확인 |
| 최종 배포의 error·fatal 실행 로그 | 검증 시 조회 결과 없음 |
| 프론트·백엔드 운영 의존성 `npm audit --omit=dev` | 모두 알려진 취약점 0개 |

프론트 전체 개발 도구 의존성에는 ESLint/minimatch 관련 moderate 3개와 Zod 관련 high 1개가 남아 있습니다. Vite 8.3.2의 취약점은 8.3.3 패치로 해결했습니다. 운영 프론트는 정적 빌드로 제공하며 개발 서버나 ESLint를 요청 처리에 사용하지 않습니다.

배포 중 확인한 오류와 수정은 다음과 같습니다.

- `NODE_ENV=production`에서 개발 의존성이 제외돼 `@vitejs/plugin-react`를 찾지 못했습니다. 서비스 설치 명령에 `--include=dev`를 명시했습니다.
- Vercel의 CommonJS 상대 모듈 변환 이후 DB·앱 모듈이 빈 값으로 로드됐습니다. `ncc`로 묶은 산출물과 고정 `server.cjs` 진입점으로 배포해 해결했습니다. 진단용 로그는 최종 배포와 작업 파일에 포함하지 않았습니다.
- 함수 실행 위치에서 인증서 상대 경로를 찾지 못했습니다. 공개 CA PEM 환경변수를 지원하고 실제 TLS 연결을 검증했습니다. 기본 CA만 사용하는 연결은 `SELF_SIGNED_CERT_IN_CHAIN`으로 거부돼 기존 Supabase CA를 유지했습니다.
- 최초 로컬 HTTP 테스트의 `listen EPERM`은 실행 환경의 포트 제한이었고, 포트가 허용된 환경에서 22개 모두 통과했습니다. 종료된 이전 임시 PostgreSQL을 참조한 연결 오류는 새 임시 컨테이너에서 12개 통과로 재검증했습니다.

스키마 검증에는 공식 JSON의 오래된 Draft 4 선언을 제외하고 실제 속성 정의를 Draft 7 검증기로 확인했습니다. 공식 JSON에는 최신 형식의 `exclusiveMinimum` 등이 함께 포함되어 있습니다.

실제 운영 계정과 학교 네트워크 설정은 별도로 구성해야 합니다. 이번 원격 로그인은 임시 검증 계정으로 시험한 뒤 삭제했으며, 기존 로컬 MySQL 계정·기록을 Supabase로 자동 복사하지 않았습니다. 실제 학생 출석은 학교 공인 IP/CIDR을 `ATTENDANCE_ALLOWED_IPS`에 등록하고 Production을 다시 배포한 뒤 학교 와이파이에서 검증해야 합니다. 현재는 미설정 시 차단하는 기존 규칙을 유지합니다.

앱에는 Google OAuth 로그인 구현이 없으므로 기존 아이디·비밀번호 로그인을 HTTP로 검증했습니다. 이번 세션의 브라우저 제어 호스트가 연결되지 않아 실제 브라우저 화면 조작·Google 로그인은 수행하지 못했습니다. Vercel 도구의 팀 접근 권한은 사용자가 링크에서 승인한 뒤 정상 사용했습니다. DB 전용 계정 생성은 자동 승인 검토가 최초 거부했으며, 사용자가 정확한 권한 범위를 승인한 뒤 진행했습니다. 현재 배포를 막는 승인 거부는 없습니다.

2026년 11월 15일 기존 학생 계정 1개의 운영 로그인 실패를 추가 점검했습니다. 운영 DB에 해당 계정이 없어 HTTP 401을 반환한 것이 원인이었습니다. 기존 MySQL 백업에서 사용자가 지정한 비밀번호의 일치를 확인하고, 해당 학생의 이름·호실·STUDENT 권한·상태·비밀번호 해시를 보존해 한 계정만 복구했습니다. 다른 계정이나 기존 데이터는 덮어쓰지 않았으며 비밀번호와 해시는 문서·커밋에 포함하지 않았습니다.

복구 중 관리 연결의 INSERT 권한 부족을 확인했습니다. 사용자 승인 후 하나의 트랜잭션에서 `postgres`가 `mentos_app` 역할을 임시 사용하도록 허용하고 학생 계정을 추가한 뒤, 이번에 부여한 역할 권한을 제거해 커밋했습니다. 기존 `supabase_admin` 부여 멤버십의 ADMIN=true·INHERIT=false·SET=false가 보존되고 임시 SET 권한이 남지 않은 것을 확인했습니다.

| 추가 원격 검증 | 결과 |
| --- | --- |
| 복구한 학생의 기존 비밀번호 | HTTP 403, `ATTENDANCE_TIME_CLOSED`. 비밀번호 검증 후 기존 시간 제한 적용 확인 |
| 잘못된 비밀번호 | HTTP 401 |
| API 확인 후 같은 학생의 동시 로그인 5건 | 5건 모두 시간 제한 HTTP 403, 세션 발급 0건 |
| DB 복구 결과 | 학생 계정 1개, 이름·호실·비밀번호 해시 보존 확인, 로그인 세션 0개 |
| `/health` | HTTP 200 |

검증 시점은 한국 시간 자정 이후로 학생 이용 시간 밖이었습니다. 실제 운영 계정의 로그인 HTTP 200은 허용 시간에 추가 확인해야 합니다. 이번 조치는 운영 계정 데이터 복구이며 애플리케이션 소스와 학생 이용 시간 정책의 변경은 없습니다.

2026년 11월 15일 추가한 시간 외 입장 토글의 기준은 브라우저별 최대 한 시간입니다. 사용자가 시간 외 입장을 요청했으므로 로그인·메인 접근에만 적용하고 실제 출석 시간은 보호하도록 정했습니다. 스위치 영역은 폭 190px, 조작 버튼의 최소 높이는 44px이며 키보드 포커스와 `role=switch`, `aria-checked`, 상태·오류 안내를 제공합니다.

| 토글·서버리스 추가 검증 | 결과 |
| --- | --- |
| 백엔드 기본·HTTP 회귀 테스트 | 23개 통과 |
| 실제 PostgreSQL 통합 테스트 | 14개 통과. 별도 시간을 설정해 시간 외 토글 ON 로그인 200, OFF·만료 차단, 실제 출석 403 검증 |
| 서버리스 진입점 첫 요청·동시 조회 | 실제 PostgreSQL을 사용하는 별도 프로세스에서 첫 요청 상태 확인·관리자 로그인 200·동시 세션 20건 200 |
| 프론트 빌드·수정 컴포넌트 ESLint·백엔드 ncc 빌드 | 통과 |
| 운영 토글 ON/OFF·브라우저 분리·쿠키 | HTTP 200, Secure·HttpOnly·SameSite=Lax·1시간, OFF 쿠키 삭제·잘못된 만료값 무시 |
| 운영 학생 로그인·인증 정보·메인 문서 | 모두 HTTP 200, 잘못된 비밀번호 401 |
| 운영 동시 세션 조회 | 20건 모두 HTTP 200 |
| 운영 동시 브라우저별 토글 상태 조회 | 10건 성공, ON 5건·OFF 5건 분리 |
| 운영 입력값·출처 검증 | 잘못된 enabled 400, 미허용 Origin 403 |
| 운영 실제 출석 제출·네트워크 | 허용 IP 미설정으로 403, 기존 네트워크 제한 유지 |
| 운영 로그아웃·기존 세션 재사용 | 204 → 401 |

원격 검증 시점은 한국 시간 13:32로 정규 점심 이용 시간 안이었습니다. 시간 외 ON/OFF와 실제 출석 차단은 로컬 PostgreSQL의 서버 시간을 제어해 검증했으며, 원격에서 시간 외 로그인을 관찰한 결과로 기록하지 않습니다. 브라우저 제어 호스트 연결 제한으로 실제 화면 클릭·시각 확인은 수행하지 못했고, 배포 자산의 토글 포함·190px 스타일과 HTTP 동작을 확인했습니다.

기존 미커밋 기능 작업과 겹친 파일은 시간 외 입장·서버리스 보강에 필요한 부분만 분리해 커밋했습니다. 분리한 커밋 내용만 별도 폴더에 추출한 상태에서도 백엔드 기본 테스트 13개·PostgreSQL 통합 테스트 12개와 프론트·백엔드 빌드·수정 React 컴포넌트 검사가 통과했습니다. 위 23개·14개 결과는 기존 기능 작업도 포함한 현재 작업 폴더의 검증 결과입니다.

검증 중 기존 주소에서 다른 도메인으로 이동할 때 테스트 도구가 Cookie·Authorization을 전달하지 않아 401이 발생했고 현재 운영 주소로 직접 요청해 해결했습니다. 동시 요청에서는 새 함수가 DB 연결을 기다리다 `No exports found`로 500을 반환했습니다. 당시 유휴 연결 15개를 확인했으며, 동작 중인 쿼리나 트랜잭션을 제외한 오래된 앱 유휴 연결만 정리했습니다. 풀 수명 관리와 즉시 export되는 서버리스 진입점을 적용한 최종 배포에서 전체 API·동시성 검증을 통과했습니다. 진단용 헤더 로그는 최종 배포에 포함하지 않았습니다.

2026년 11월 15일 사용자 요청으로 관리자 `admin01`과 학생 `261208`을 추가했습니다. 역할은 기존 제약에 맞춰 각각 `ADMIN`·`STUDENT`로 저장했습니다. 학생의 이름·403호·비밀번호 해시는 기존 백업에서 확인해 보존하고 요청한 `귀가` 상태를 적용했습니다. 관리자는 새 비밀번호를 발급했으며 비밀번호와 해시는 문서·저장소에 포함하지 않았습니다. 기존 학생 계정은 변경하지 않았습니다.

두 계정 등록은 하나의 트랜잭션에서 처리했습니다. 관리 연결의 앱 소유자 역할 사용을 일시 허용한 뒤 두 행만 추가하고 이번 임시 멤버십을 제거했습니다. 작업 후 기존 역할 멤버십이 보존되고 `SET`·`INSERT` 권한 및 임시 멤버십이 남지 않은 것을 확인했습니다.

| 추가 계정 운영 검증 | 결과 |
| --- | --- |
| 관리자·학생 로그인 및 인증 정보 조회 | 두 계정 모두 HTTP 200, 역할 일치 |
| 관리자 호실 명단 조회 | HTTP 200, 학생의 403호·귀가·`HOME` 표시 확인 |
| 학생의 관리자 명단 조회·관리자 비밀번호 오류 | 각각 HTTP 403·401 |
| API 검증 후 동시 세션 조회 | 관리자 10건·학생 10건 모두 HTTP 200 |
| 동시 관리자 명단 조회 | 5건 모두 HTTP 200 |
| 테스트 세션 로그아웃·재사용 | 두 세션 모두 HTTP 204 → 401 |

계정 데이터만 추가했으므로 애플리케이션 코드·스키마 변경과 재배포는 필요하지 않았습니다. 학생 테스트에는 기존 시간 외 입장 토글을 사용했습니다. Google OAuth는 앱에 구현되어 있지 않아 기존 아이디·비밀번호 방식으로 검증했습니다.

관리자 로그인 401 제보 후 발급한 자격 정보로 운영 로그인을 다시 확인했습니다. 로그인·인증 정보·관리자 명단은 모두 HTTP 200, 검증 세션 로그아웃은 204였습니다. 브라우저 탭 제어 연결은 사용할 수 없었으나 Chrome 앱의 접근성 화면 조회로 현재 운영 `/admin` 페이지에 접속한 상태와 학생 2명·귀가 1명·미체크 1명 표시를 직접 확인했습니다. 최초 401을 발생시킨 입력값은 확인되지 않아 원인으로 단정하지 않았으며 계정·비밀번호·애플리케이션 변경은 수행하지 않았습니다.

작업 브랜치는 `chore/supabase-vercel-deploy`입니다. 현재 저장소에는 `dev` 브랜치가 없으며 GitHub 인증이 없어 Issue 생성과 번호 반영을 완료하지 못했습니다.

참고 문서는 [Vercel Services](https://vercel.com/docs/services), [Services 설정](https://vercel.com/docs/services/config-reference), [Supabase DB 연결](https://supabase.com/docs/guides/database/connecting-to-postgres)입니다.
