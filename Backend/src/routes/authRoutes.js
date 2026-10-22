const express = require('express');
const AuthController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { loginLimit } = require('../middleware/loginLimit');
const { asyncHandler } = require('../lib/http');

class AuthRoutes {
  constructor(controller = new AuthController()) {
    this.router = express.Router();
    this.router.post('/login', loginLimit, asyncHandler(controller.login.bind(controller)));
    this.router.get('/me', requireAuth, controller.me.bind(controller));
    this.router.post('/logout', requireAuth, asyncHandler(controller.logout.bind(controller)));
  }
}

module.exports = AuthRoutes;
