const express = require('express');
const { getHome } = require('../controllers/homeController');
const auth = require('../controllers/authController');
const attendance = require('../controllers/attendanceController');
const leaves = require('../controllers/leaveController');
const { pool } = require('../config/db');
const { asyncHandler } = require('../lib/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const { loginLimit } = require('../middleware/loginLimit');
const router = express.Router();

router.get('/', getHome);
router.get('/health', asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'connected' });
}));
router.post('/api/auth/login', loginLimit, asyncHandler(auth.login));
router.use('/api', requireAuth);
router.get('/api/auth/me', auth.me);
router.post('/api/auth/logout', asyncHandler(auth.logout));
router.get('/api/attendance', asyncHandler(attendance.list));
router.post('/api/attendance', requireRole('STUDENT'), asyncHandler(attendance.checkIn));
router.put('/api/attendance', requireRole('ADMIN'), asyncHandler(attendance.record));
router.get('/api/leaves', asyncHandler(leaves.list));
router.post('/api/leaves', requireRole('STUDENT'), asyncHandler(leaves.create));
router.patch('/api/leaves/:id/status', asyncHandler(leaves.changeStatus));

module.exports = router;
