const express = require('express');
const { getHome } = require('../controllers/homeController');

const router = express.Router();

// GET /
router.get('/', getHome);

module.exports = router;
