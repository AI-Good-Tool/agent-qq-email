'use strict';
const path = require('path');
const { loadOrCreateSecret } = require('../app/lib/secret');

module.exports = appInfo => {
  const dataDirectory = path.join(appInfo.baseDir, 'data');
  return ({
  keys: `${appInfo.name}_local_api_key`,
  security: { csrf: { enable: false } },
  middleware: [ 'apiCors', 'apiAuth' ],
  cluster: { listen: { port: 7101, hostname: '127.0.0.1' } },
  agently: {
    cliPath: process.env.AGENTLY_CLI_PATH || 'agently-cli',
    workspace: process.env.AGENTLY_WORKSPACE || 'codex',
    timeout: 30000,
    databasePath: process.env.AGENTLY_SQLITE_PATH || path.join(dataDirectory, 'agent-mail.sqlite'),
  },
  dashboardAuth: {
    username: process.env.DASHBOARD_USERNAME || 'admin',
    password: process.env.DASHBOARD_PASSWORD || 'abadmin123ab',
    tokenSecret: process.env.DASHBOARD_TOKEN_SECRET || loadOrCreateSecret(path.join(dataDirectory, 'dashboard-token.secret')),
    tokenTtlSeconds: 30 * 24 * 60 * 60,
  },
  });
};
