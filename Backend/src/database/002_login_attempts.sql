CREATE TABLE IF NOT EXISTS login_attempts (
  scope ENUM('IP', 'ACCOUNT') NOT NULL,
  key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  reservation_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (scope, key_hash),
  INDEX idx_login_attempts_expires_at (expires_at)
) ENGINE=InnoDB;
