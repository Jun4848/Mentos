const express = require('express');
const { getHome } = require('../controllers/homeController');
const { register, login } = require('../controllers/authController');

const router = express.Router();

router.get('/', getHome);
router.post('/api/auth/register', register);
router.post('/api/auth/login', login);

module.exports = router;
