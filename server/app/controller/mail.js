'use strict';

const { Controller } = require('egg');

class MailController extends Controller {
  async health() {
    this.ctx.body = { ok: true, service: 'yunyouhe-agent-mail' };
  }

  async dashboard() {
    try {
      this.ctx.body = await this.service.agently.dashboard(this.ctx.query.folder);
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
