const { authService } = require('../services/authService');
const { setSessionCookie } = require('../lib/session');

class AuthController {
  constructor(service = authService) {
    this.authService = service;
  }

  async login(req, res) {
    const { maxAge, ...data } = await this.authService.login(req.body?.id, req.body?.password);
    setSessionCookie(res, data.accessToken, maxAge);
    res.set('Cache-Control', 'no-store');
    res.json(data);
  }

  me(req, res) {
    res.json(req.account);
  }

  async logout(req, res) {
    await this.authService.logout(req.sessionToken);
    setSessionCookie(res, '', 0);
    res.status(204).end();
  }
}

module.exports = AuthController;
