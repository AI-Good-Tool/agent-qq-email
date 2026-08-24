'use strict';
const path = require('path');
module.exports = appInfo => ({
  keys: `${appInfo.name}_local_api_key`,
  security: { csrf: { enable: false } },
  middleware: [ 'apiCors' ],
  cluster: { listen: { port: 7101, hostname: '127.0.0.1' } },
  agently: {
    cliPath: process.env.AGENTLY_CLI_PATH || 'agently-cli',
    workspace: process.env.AGENTLY_WORKSPACE || 'codex',
    timeout: 30000,
    databasePath: process.env.AGENTLY_SQLITE_PATH || path.join(appInfo.baseDir, 'data', 'agent-mail.sqlite'),
  },
});
