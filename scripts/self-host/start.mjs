#!/usr/bin/env node
// Container entrypoint: starts the Next.js server and, unless CRON_RUNNER=off,
// the scheduler that replaces Vercel Cron, in one container. If either stops,
// the container exits so Docker/Coolify restarts it cleanly.

import { spawn } from 'node:child_process';

const children = [];

function start(name, args, env) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  child.on('exit', (code, signal) => {
    console.error(JSON.stringify({ level: 'error', msg: `${name} stopped`, code, signal }));
    for (const other of children) if (other !== child) other.kill('SIGTERM');
    process.exit(code ?? 1);
  });
  children.push(child);
}

start('server', ['server.js']);
if ((process.env.CRON_RUNNER || '').toLowerCase() !== 'off') {
  start('cron', ['scripts/self-host/cron-runner.mjs'], {
    CRON_BASE_URL: process.env.CRON_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`,
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
}
