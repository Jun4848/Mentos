CREATE TABLE IF NOT EXISTS user_accounts (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  room_number VARCHAR(10) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('STUDENT', 'ADMIN') NOT NULL DEFAULT 'STUDENT',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS login_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  account_id VARCHAR(50) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_account (account_id),
  INDEX idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_account FOREIGN KEY (account_id) REFERENCES user_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS attendance_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  attendance_date DATE NOT NULL,
  period ENUM('MORNING', 'LUNCH', 'EVENING') NOT NULL,
  status ENUM('PRESENT', 'LATE', 'ABSENT', 'EXCUSED') NOT NULL DEFAULT 'PRESENT',
  checked_at DATETIME NULL,
  recorded_by VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_attendance_student_date_period UNIQUE (student_id, attendance_date, period),
  INDEX idx_attendance_date_period (attendance_date, period),
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES user_accounts(id)
    ON UPDATE CASCADE,
  CONSTRAINT fk_attendance_recorder FOREIGN KEY (recorded_by) REFERENCES user_accounts(id)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS leave_applications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  type ENUM('OUTING', 'HOME_VISIT') NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  reason VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  reviewed_by VARCHAR(50) NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leaves_student_period (student_id, starts_at, ends_at),
  INDEX idx_leaves_status_start (status, starts_at),
  CONSTRAINT chk_leave_period CHECK (ends_at > starts_at),
  CONSTRAINT fk_leaves_student FOREIGN KEY (student_id) REFERENCES user_accounts(id)
    ON UPDATE CASCADE,
  CONSTRAINT fk_leaves_reviewer FOREIGN KEY (reviewed_by) REFERENCES user_accounts(id)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
