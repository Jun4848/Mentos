UPDATE attendance_records r JOIN user_accounts a ON a.id = r.student_id
SET r.student_name = a.name, r.room_number = a.room_number WHERE r.student_name = '';
