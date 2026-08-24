'use strict';

class AppBootHook {
  constructor(app) {
    this.app = app;
    this.app.authSessions = new Map();
    this.app.loginAttempts = new Map();
  }

  async beforeClose() {
    for (const session of this.app.authSessions.values()) {
      if (session.child && !session.child.killed) session.child.kill();
      if (session.expiryTimer) clearTimeout(session.expiryTimer);
    }
    this.app.agentMailDatabase?.close();
  }
}

module.exports = AppBootHook;
