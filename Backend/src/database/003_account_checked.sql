ALTER TABLE user_accounts
  ADD COLUMN is_checked BOOLEAN NOT NULL DEFAULT FALSE AFTER status,
  ADD CONSTRAINT chk_user_accounts_is_checked CHECK (is_checked IN (FALSE, TRUE));
