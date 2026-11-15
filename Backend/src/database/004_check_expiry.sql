ALTER TABLE user_accounts
  ADD COLUMN checked_until DATETIME NULL DEFAULT NULL AFTER is_checked,
  ADD INDEX idx_account_check_expiry (role, is_checked, checked_until);
