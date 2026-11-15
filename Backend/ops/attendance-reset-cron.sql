BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- cron.timezone=GMT: 한국 17:50 = UTC 08:50, 한국 22:30 = UTC 13:30.
-- 앱 소유자 권한으로 실행하며 계정 정보·귀가 상태·과거 출석 기록은 보존합니다.
GRANT mentos_app TO postgres WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA cron TO mentos_app;
SET LOCAL ROLE mentos_app;
SELECT cron.schedule('mentos-reset-lunch', '50 8 * * *', $job$UPDATE mentos.user_accounts SET is_checked = FALSE, checked_until = NULL WHERE role = 'STUDENT' AND is_checked = TRUE AND (checked_until <= CURRENT_TIMESTAMP OR (checked_until IS NULL AND updated_at <= date_trunc('minute', CURRENT_TIMESTAMP)));$job$);
SELECT cron.schedule('mentos-reset-evening', '30 13 * * *', $job$UPDATE mentos.user_accounts SET is_checked = FALSE, checked_until = NULL WHERE role = 'STUDENT' AND is_checked = TRUE AND (checked_until <= CURRENT_TIMESTAMP OR (checked_until IS NULL AND updated_at <= date_trunc('minute', CURRENT_TIMESTAMP)));$job$);
RESET ROLE;
REVOKE USAGE ON SCHEMA cron FROM mentos_app;
REVOKE mentos_app FROM postgres GRANTED BY postgres;

COMMIT;
