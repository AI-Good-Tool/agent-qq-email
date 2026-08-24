'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const { existsSync } = require('fs');
const path = require('path');

const projectRoot = __dirname;
const eggScripts = [
  path.join(projectRoot, 'server/node_modules/egg-scripts/bin/egg-scripts.js'),
  path.join(projectRoot, 'node_modules/egg-scripts/bin/egg-scripts.js'),
].find(existsSync);

if (!eggScripts) {
  throw new Error('缺少 egg-scripts，请先在项目根目录执行 npm install --omit=dev');
}
const optionalEnvironment = [
  'DASHBOARD_USERNAME',
  'DASHBOARD_PASSWORD',
  'DASHBOARD_TOKEN_SECRET',
  'AGENTLY_SQLITE_PATH',
].reduce((result, key) => {
  if (process.env[key]) result[key] = process.env[key];
  return result;
}, {});

module.exports = {
  apps: [
    {
      name:'yunyouhe-api',
      cwd:path.join(projectRoot, 'server'),
      script:eggScripts,
      args:'start --port=7101 --workers=1 --title=yunyouhe-agent-mail',
      interpreter:'node',
      autorestart:true,
      max_restarts:10,
      min_uptime:'10s',
      env:{
        NODE_ENV:'production',
        EGG_SERVER_ENV:'prod',
        AGENTLY_WORKSPACE:process.env.AGENTLY_WORKSPACE || 'codex',
        AGENTLY_CLI_PATH:process.env.AGENTLY_CLI_PATH || 'agently-cli',
        ...optionalEnvironment,
      },
    },
    {
      name:'yunyouhe-web',
      cwd:projectRoot,
      script:'./node_modules/vinext/dist/cli.js',
      args:'start --port 1265 --hostname 127.0.0.1',
      interpreter:'node',
      autorestart:true,
      max_restarts:10,
      min_uptime:'10s',
      env:{
        NODE_ENV:'production',
        AGENT_MAIL_BACKEND_URL:'http://127.0.0.1:7101',
        SITE_ORIGIN:process.env.SITE_ORIGIN || 'https://mail.example.com',
      },
    },
  ],
};
