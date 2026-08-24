'use strict';

const { verifyToken } = require('../lib/token');

module.exports = (options, app) => async function apiAuth(ctx, next) {
  if (!ctx.path.startsWith('/api/') || ctx.path === '/api/login') return next();
  const match = ctx.get('authorization').match(/^Bearer\s+(.+)$/i);
  try {
    if (!match) throw new Error('MISSING_TOKEN');
    ctx.state.dashboardUser = verifyToken(match[1], app.config.dashboardAuth.tokenSecret);
  } catch {
    ctx.status = 401;
    ctx.body = { code:'UNAUTHORIZED', message:'登录状态已失效，请重新登录。' };
    return;
  }
  await next();
};
