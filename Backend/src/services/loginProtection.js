const { createHash } = require('node:crypto');
const LoginAttemptRepository = require('../repositories/loginAttemptRepository');
const { HttpError } = require('../lib/http');

const WINDOW_SECONDS = 15 * 60;
const IP_LIMIT = 20;
const ACCOUNT_LIMIT = 5;

class LoginProtection {
  constructor(repository = new LoginAttemptRepository()) {
    this.repository = repository;
  }

  async reserve(scope, value, limit) {
    const keyHash = createHash('sha256').update(value).digest('hex');
    const result = await this.repository.reserve(scope, keyHash, limit, WINDOW_SECONDS);
    if (!result.allowed) {
      const error = new HttpError(429, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
      error.retryAfter = result.retryAfter;
      throw error;
    }
    return { scope, keyHash, reservationId: result.reservationId };
  }

  async checkIp(ip) {
    await this.repository.deleteExpired();
    await this.reserve('IP', ip || 'unknown', IP_LIMIT);
  }

  async reserveAccount(id) {
    return this.reserve('ACCOUNT', id, ACCOUNT_LIMIT);
  }

  async clearAccount(reservation) {
    await this.repository.clear(reservation);
  }
}

const loginProtection = new LoginProtection();

module.exports = { LoginProtection, loginProtection };
