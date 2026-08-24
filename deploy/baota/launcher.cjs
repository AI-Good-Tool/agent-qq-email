'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const { existsSync, readFileSync } = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');

function resolveInstalledScript(name, candidates) {
  const script = candidates.find(existsSync);
  if (script) return script;

  console.error(`[${name}] 缺少运行依赖，请在项目根目录执行：npm install --omit=dev`);
  console.error(`[${name}] 已检查：\n${candidates.map(candidate => `  - ${candidate}`).join('\n')}`);
  process.exit(1);
}

function loadEnvironment(file) {
  if (!existsSync(file)) return;
  for (const input of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = input.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvironment(path.join(projectRoot, '.env.baota'));

const sharedEnvironment = { ...process.env, NODE_ENV:'production' };
const apiPort = String(process.env.API_PORT || '7101');
const webPort = String(process.env.WEB_PORT || '1265');
const eggScripts = resolveInstalledScript('api', [
  path.join(projectRoot, 'server/node_modules/egg-scripts/bin/egg-scripts.js'),
  path.join(projectRoot, 'node_modules/egg-scripts/bin/egg-scripts.js'),
]);
const vinextCli = resolveInstalledScript('web', [
  path.join(projectRoot, 'node_modules/vinext/dist/cli.js'),
]);
const processes = new Set();
let stopping = false;
let finalExitCode = 0;
let forceTimer;

function stopAll(signal = 'SIGTERM', exitCode = 0) {
  if (!stopping) {
    stopping = true;
    finalExitCode = exitCode;
    for (const child of processes) child.kill(signal);
    forceTimer = setTimeout(() => {
      for (const child of processes) child.kill('SIGKILL');
      process.exit(finalExitCode);
    }, 5000);
    forceTimer.unref();
  }
  if (!processes.size) process.exit(finalExitCode);
}

function launch(name, cwd, script, args, environment) {
  const child = spawn(process.execPath, [ script, ...args ], {
    cwd,
    env:{ ...sharedEnvironment, ...environment },
    stdio:'inherit',
  });
  processes.add(child);
  child.on('error', error => {
    console.error(`[${name}] 启动失败：${error.message}`);
    stopAll('SIGTERM', 1);
  });
  child.on('exit', (code, signal) => {
    processes.delete(child);
    if (!stopping) {
      console.error(`[${name}] 已退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）`);
      stopAll('SIGTERM', code || 1);
      return;
    }
    if (!processes.size) {
      if (forceTimer) clearTimeout(forceTimer);
      process.exit(finalExitCode);
    }
  });
  return child;
}

launch(
  'api',
  path.join(projectRoot, 'server'),
  eggScripts,
  [ 'start', `--port=${apiPort}`, '--workers=1', '--title=yunyouhe-agent-mail' ],
  {
    EGG_SERVER_ENV:'prod',
    AGENTLY_WORKSPACE:process.env.AGENTLY_WORKSPACE || 'codex',
    AGENTLY_CLI_PATH:process.env.AGENTLY_CLI_PATH || 'agently-cli',
  },
);

launch(
  'web',
  projectRoot,
  vinextCli,
  [ 'start', '--port', webPort, '--hostname', '127.0.0.1' ],
  {
    AGENT_MAIL_BACKEND_URL:`http://127.0.0.1:${apiPort}`,
  },
);

process.on('SIGINT', () => stopAll('SIGINT', 0));
process.on('SIGTERM', () => stopAll('SIGTERM', 0));
