ALTER TABLE mentos.attendance_records
  ADD COLUMN student_name VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN room_number VARCHAR(10) NOT NULL DEFAULT '';

UPDATE mentos.attendance_records r SET student_name = a.name, room_number = a.room_number
FROM mentos.user_accounts a WHERE a.id = r.student_id;
