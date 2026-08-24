'use strict';

const { randomBytes } = require('crypto');
const { chmodSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { dirname } = require('path');

function readSecret(file) {
  const value = readFileSync(file, 'utf8').trim();
  if (value.length < 32) throw new Error(`Token secret file is invalid: ${file}`);
  return value;
}

function loadOrCreateSecret(file) {
  try {
    return readSecret(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  mkdirSync(dirname(file), { recursive:true });
  const value = randomBytes(48).toString('base64url');
  try {
    writeFileSync(file, `${value}\n`, { flag:'wx', mode:0o600 });
    chmodSync(file, 0o600);
    return value;
  } catch (error) {
    if (error.code === 'EEXIST') return readSecret(file);
    throw error;
  }
}

module.exports = { loadOrCreateSecret };
