import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cronMatches, knowledgeImportCronJob, parseCron } from '../../scripts/self-host/cron-lib.mjs';

const at = (iso) => new Date(iso);

test('every schedule in vercel.json parses', () => {
  const crons = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')).crons;
  assert.ok(crons.length >= 20);
  for (const c of crons) assert.doesNotThrow(() => parseCron(c.schedule), c.path);
});

test('steps, offsets and fixed times match like Vercel Cron (UTC)', () => {
  const every5 = parseCron('*/5 * * * *');
  assert.ok(cronMatches(every5, at('2026-11-20T06:35:00Z')));
  assert.ok(!cronMatches(every5, at('2026-11-20T06:36:00Z')));
  const offset = parseCron('5-55/10 * * * *');
  assert.ok(cronMatches(offset, at('2026-11-20T06:25:00Z')));
  assert.ok(!cronMatches(offset, at('2026-11-20T06:20:00Z')));
  const sixHourly = parseCron('25 */6 * * *');
  assert.ok(cronMatches(sixHourly, at('2026-11-20T12:25:00Z')));
  assert.ok(!cronMatches(sixHourly, at('2026-11-20T13:25:00Z')));
  const daily = parseCron('40 18 * * *');
  assert.ok(cronMatches(daily, at('2026-11-20T18:40:00Z')));
  const monday = parseCron('40 2 * * 1');
  assert.ok(cronMatches(monday, at('2026-11-23T02:40:00Z')));
  assert.ok(!cronMatches(monday, at('2026-11-24T02:40:00Z')));
});

test('bad schedules are refused', () => {
  assert.throws(() => parseCron('* * * *'));
  assert.throws(() => parseCron('61 * * * *'));
  assert.throws(() => parseCron('*/0 * * * *'));
});

test('the import scheduler uses one dedicated POST each minute only when enabled', () => {
  const enabled = { KNOWLEDGE_IMPORT_ENABLED: '1' };
  const secret = 'worker-test-secret-that-is-over-32-bytes';
  assert.equal(knowledgeImportCronJob({ KNOWLEDGE_IMPORT_WORKER_SECRET: secret }), null);
  assert.throws(() => knowledgeImportCronJob(enabled), /dedicated/);
  assert.throws(() => knowledgeImportCronJob({ ...enabled, KNOWLEDGE_IMPORT_WORKER_SECRET: secret, CRON_SECRET: secret }), /dedicated/);
  const job = knowledgeImportCronJob({ ...enabled, KNOWLEDGE_IMPORT_WORKER_SECRET: secret });
  assert.equal(job.path, '/api/knowledge-import-worker');
  assert.equal(job.method, 'POST');
  assert.equal(job.secret, secret);
  assert.equal(cronMatches(job.cron, at('2026-11-20T09:37:00Z')), true);
});
