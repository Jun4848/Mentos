require('dotenv').config();
const { pool } = require('../src/config/db');
const { migrate } = require('../src/database/migrate');

migrate().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
