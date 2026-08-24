'use strict';

const { Controller } = require('egg');

class MailController extends Controller {
  async health() {
    this.ctx.body = { ok: true, service: 'yunyouhe-agent-mail' };
  }

  async dashboard() {
    try {
      this.ctx.body = await this.service.agently.dashboard();
    } catch (error) {
      this.ctx.status = 503;
      this.ctx.body = { code: 'AGENTLY_CLI_UNAVAILABLE', message: error.message };
    }
  }

  async startAuth() {
    const session = await this.service.agently.startAuth();
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
