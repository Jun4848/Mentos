const { pool } = require('../config/db');

class UserRepository {
  constructor(database = pool) {
    this.database = database;
  }

  async findById(id) {
    const [accounts] = await this.database.execute(
      'SELECT id, name, room_number AS roomNumber, password_hash, role FROM user_accounts WHERE id = ?',
      [id],
    );
    return accounts[0];
  }
}

module.exports = UserRepository;
