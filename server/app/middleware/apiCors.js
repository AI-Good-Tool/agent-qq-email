'use strict';

module.exports = () => async function apiCors(ctx, next) {
  const origin = ctx.get('origin');
  const isAllowed = /^https:\/\/yunyouhe-mailbox\..+\.chatgpt\.site$/.test(origin)
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  if (origin && isAllowed) {
    ctx.set('Access-Control-Allow-Origin', origin);
    ctx.set('Vary', 'Origin');
  }
  ctx.set('Access-Control-Allow-Headers', 'content-type');
  ctx.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (ctx.method === 'OPTIONS') {
    ctx.status = 204;
    return;
  }
  await next();
};
