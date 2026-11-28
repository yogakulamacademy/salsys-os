import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import next from 'next';

import { knowledgeImportCronJob } from './cron-lib.mjs';

const password = process.env.SALSYS_STAGING_ACCESS_PASSWORD;
if (!password || password.length < 32) throw new Error('Staging access password is required');

const workerJob = knowledgeImportCronJob(process.env);
const expected = Buffer.from(`Basic ${Buffer.from(`staging:${password}`).toString('base64')}`);
const port = Number(process.env.PORT || 10000);
const hostname = '0.0.0.0';
const loopback = '127.0.0.1';
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

function handleApp(request, response) {
  handle(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
}

const preview = createServer((request, response) => {
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const supplied = Buffer.from(request.headers.authorization || '');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    response.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="SalsysOS staging"',
      'Cache-Control': 'no-store',
    });
    response.end('Staging authentication required');
    return;
  }
  delete request.headers.authorization;
  handleApp(request, response);
});

// The private listener forwards only the scheduled POST. The application route
// still verifies the worker bearer and rejects payloads or query parameters.
const worker = workerJob && createServer((request, response) => {
  if (request.method !== workerJob.method || request.url !== workerJob.path) {
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    response.end();
    return;
  }
  handleApp(request, response);
});

let scheduler;
let stopping = false;
function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  scheduler?.kill();
  preview.close();
  preview.closeAllConnections();
  worker?.close();
  worker?.closeAllConnections();
  process.exitCode = exitCode;
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

try {
  await app.prepare();
  if (worker) {
    worker.listen(0, loopback);
    await once(worker, 'listening');
  }
  preview.listen(port, hostname);
  await once(preview, 'listening');
  if (worker) {
    scheduler = spawn(process.execPath, [fileURLToPath(new URL('./cron-runner.mjs', import.meta.url))], {
      env: {
        CRON_BASE_URL: `http://${loopback}:${worker.address().port}`,
        CRON_DRY_RUN: process.env.CRON_DRY_RUN,
        CRON_TIMEOUT_MS: process.env.CRON_TIMEOUT_MS,
        KNOWLEDGE_IMPORT_CRON_ONLY: '1',
        KNOWLEDGE_IMPORT_ENABLED: '1',
        KNOWLEDGE_IMPORT_WORKER_SECRET: workerJob.secret,
      },
      stdio: 'inherit',
    });
    scheduler.once('error', () => stop(1));
    scheduler.once('exit', () => stop(1));
  }
  console.log('SalsysOS staging is listening');
} catch (error) {
  console.error('SalsysOS staging could not start', error.message);
  stop(1);
}
