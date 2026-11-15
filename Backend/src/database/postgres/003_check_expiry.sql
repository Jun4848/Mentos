ALTER TABLE mentos.user_accounts ADD COLUMN checked_until TIMESTAMPTZ NULL;
CREATE INDEX idx_account_check_expiry ON mentos.user_accounts (role, is_checked, checked_until);
