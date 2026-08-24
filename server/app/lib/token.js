'use strict';

const { createHmac, randomUUID, timingSafeEqual } = require('crypto');

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function createToken(username, secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub:username, iat:now, exp:now+ttlSeconds, jti:randomUUID() })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

function verifyToken(token, secret) {
  const [ payload, suppliedSignature, extra ] = String(token || '').split('.');
  if (!payload || !suppliedSignature || extra || !safeEqual(suppliedSignature, signature(payload, secret))) {
    throw new Error('INVALID_TOKEN');
  }
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!data.sub || !data.exp || data.exp <= Math.floor(Date.now()/1000)) throw new Error('EXPIRED_TOKEN');
  return data;
}

module.exports = { createToken, safeEqual, verifyToken };
