const { pool } = require('../config/db');
const { buildDormitoryRoster } = require('../lib/dormitory');

async function dormitory(req, res) {
  const [students] = await pool.query(`SELECT id, name, room_number AS "roomNumber", status,
    is_checked AS "isChecked" FROM user_accounts WHERE role = 'STUDENT' ORDER BY room_number, name, id`);
  res.json(buildDormitoryRoster(students));
}

module.exports = { dormitory };
