'use strict';

const { Controller } = require('egg');
const { createToken, safeEqual } = require('../lib/token');

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

class MailController extends Controller {
  async login() {
    this.ctx.set('Cache-Control', 'no-store');
    const { username, password } = this.ctx.request.body || {};
    const auth = this.config.dashboardAuth;
    const key = this.ctx.ip || 'unknown';
    const now = Date.now();
    if (this.app.loginAttempts.size > 1000) {
      for (const [ attemptKey, value ] of this.app.loginAttempts) {
        if ((!value.blockedUntil || value.blockedUntil <= now) && now - value.firstFailureAt > LOGIN_WINDOW_MS) {
          this.app.loginAttempts.delete(attemptKey);
        }
      }
    }
    let attempt = this.app.loginAttempts.get(key);
    if (attempt?.blockedUntil > now) {
      const retryAfter = Math.ceil((attempt.blockedUntil - now) / 1000);
      this.ctx.set('Retry-After', String(retryAfter));
      this.ctx.status = 429;
      this.ctx.body = { code:'LOGIN_RATE_LIMITED', message:`登录尝试过多，请在 ${Math.ceil(retryAfter / 60)} 分钟后重试。` };
      return;
    }
    if (attempt && now - attempt.firstFailureAt > LOGIN_WINDOW_MS) {
      this.app.loginAttempts.delete(key);
      attempt = null;
    }
    if (!safeEqual(username, auth.username) || !safeEqual(password, auth.password)) {
      const failures = (attempt?.failures || 0) + 1;
      this.app.loginAttempts.set(key, {
        failures,
        firstFailureAt:attempt?.firstFailureAt || now,
        blockedUntil:failures >= LOGIN_MAX_FAILURES ? now + LOGIN_BLOCK_MS : 0,
      });
      this.ctx.status = 401;
      this.ctx.body = { code:'INVALID_CREDENTIALS', message:'账号或密码错误。' };
      return;
    }
    this.app.loginAttempts.delete(key);
    this.ctx.body = {
      token:createToken(auth.username, auth.tokenSecret, auth.tokenTtlSeconds),
      user:{ username:auth.username },
      expiresIn:auth.tokenTtlSeconds,
    };
  }

  async session() {
    this.ctx.set('Cache-Control', 'no-store');
    this.ctx.body = { authenticated:true, user:{ username:this.ctx.state.dashboardUser.sub } };
  }

  async health() {
    this.ctx.body = { ok: true, service: 'yunyouhe-agent-mail' };
  }

  async dashboard() {
    try {
      this.ctx.body = await this.service.agently.dashboard(this.ctx.query.folder, this.ctx.query.account);
    } catch (error) {
      this.ctx.status = 503;
      this.ctx.body = { code: 'AGENTLY_CLI_UNAVAILABLE', message: error.message };
    }
  }

  async messageDetail() {
    try {
      this.ctx.body = await this.service.agently.readMessage(this.ctx.params.id, this.ctx.query.workspace);
    } catch (error) {
      this.ctx.status = /^无效/.test(error.message) ? 400 : 503;
      this.ctx.body = { code: 'MESSAGE_DETAIL_UNAVAILABLE', message: error.message };
    }
  }

  async setStar() {
    try {
      const { workspace, starred } = this.ctx.request.body || {};
      this.ctx.body = this.service.agently.setStar(this.ctx.params.id, workspace, Boolean(starred));
    } catch (error) {
      this.ctx.status = 400;
      this.ctx.body = { code: 'STAR_UPDATE_FAILED', message: error.message };
    }
  }

  async setAliasLabels() {
    try {
      const { workspace, labels } = this.ctx.request.body || {};
      this.ctx.body = this.service.agently.setAliasLabels(workspace, this.ctx.params.aliasId, labels);
    } catch (error) {
      this.ctx.status = 400;
      this.ctx.body = { code: 'ALIAS_LABEL_UPDATE_FAILED', message: error.message };
    }
  }

  async mailAction() {
    try {
      this.ctx.body = await this.service.agently.mailAction(this.ctx.request.body || {});
    } catch (error) {
      this.ctx.status = 400;
      this.ctx.body = { code: 'MAIL_ACTION_FAILED', message: error.message };
    }
  }

  async startAuth() {
    const session = await this.service.agently.startAuth(this.ctx.request.body?.connectionId || null);
    this.ctx.status = session.status === 'failed' ? 503 : 200;
    this.ctx.body = {
      sessionId: session.id,
      status: session.status,
      authUrl: session.authUrl,
      expiresAt: session.expiresAt,
      message: session.error,
    };
  }

  async authStatus() {
    const session = this.app.authSessions.get(this.ctx.query.sessionId);
    if (!session) {
      this.ctx.status = 404;
      this.ctx.body = { code: 'AUTH_SESSION_NOT_FOUND', message: '授权会话不存在。' };
      return;
    }
    this.ctx.body = {
      sessionId: session.id,
      status: session.status,
      authUrl: session.authUrl,
      expiresAt: session.expiresAt,
      message: session.error,
    };
  }
}

module.exports = MailController;
