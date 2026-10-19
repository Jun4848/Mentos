const express = require('express');
const { getHome } = require('../controllers/homeController');
const { login } = require('../controllers/authController');

const router = express.Router();

router.get('/', getHome);
router.post('/api/auth/login', login);

module.exports = router;
