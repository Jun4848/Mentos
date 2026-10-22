const { randomBytes } = require('node:crypto');
const UserRepository = require('../repositories/userRepository');
const SessionRepository = require('../repositories/sessionRepository');
const { verifyPassword } = require('../lib/password');
const { hashToken } = require('../lib/session');
const { HttpError } = require('../lib/http');
const { text } = require('../lib/validation');

class AuthService {
  constructor(userRepository = new UserRepository(), sessionRepository = new SessionRepository()) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
  }

  async login(id, password) {
    id = text(id, '아이디', 50);
    if (typeof password !== 'string' || !password || password.length > 128) {
      throw new HttpError(400, '아이디와 비밀번호를 확인해주세요.');
    }

    const account = await this.userRepository.findById(id);
    if (!await verifyPassword(password, account?.password_hash)) {
      throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    const accessToken = randomBytes(32).toString('hex');
    const hours = Number(process.env.SESSION_HOURS || 24);
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
      throw new Error('SESSION_HOURS는 1~720이어야 합니다.');
    }
    const maxAge = hours * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + maxAge);

    await this.sessionRepository.deleteExpired();
    await this.sessionRepository.create(hashToken(accessToken), account.id, expiresAt);

    return {
      id: account.id,
      name: account.name,
      roomNumber: account.roomNumber,
      role: account.role,
      accessToken,
      expiresAt: expiresAt.toISOString(),
      maxAge,
    };
  }

  async authenticate(token) {
    if (!token) throw new HttpError(401, '로그인이 필요합니다.');
    const account = await this.sessionRepository.findAccountByTokenHash(hashToken(token));
    if (!account) throw new HttpError(401, '세션이 만료되었습니다. 다시 로그인해주세요.');
    return account;
  }

  async logout(token) {
    await this.sessionRepository.deleteByTokenHash(hashToken(token));
  }
}

const authService = new AuthService();

module.exports = { AuthService, authService };
