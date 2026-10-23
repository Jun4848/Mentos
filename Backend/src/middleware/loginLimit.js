const { loginProtection } = require('../services/loginProtection');

async function loginLimit(req, res, next) {
  res.set('Cache-Control', 'no-store');
  await loginProtection.checkIp(req.ip);
  next();
}

module.exports = { loginLimit };
