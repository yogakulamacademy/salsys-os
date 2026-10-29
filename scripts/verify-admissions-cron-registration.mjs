import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const route = fs.readFileSync('app/api/admissions/auto-tasks/route.ts', 'utf8');

const admissionCrons = (vercel.crons ?? []).filter(
  (cron) => cron.path === '/api/admissions/auto-tasks',
);

if (admissionCrons.length !== 1) {
  throw new Error(
    `Admissions cron verification failed: expected exactly one /api/admissions/auto-tasks cron, found ${admissionCrons.length}.`,
  );
}

if (admissionCrons[0].schedule !== '*/15 * * * *') {
  throw new Error(
    `Admissions cron verification failed: expected */15 * * * *, found ${admissionCrons[0].schedule}.`,
  );
}

for (const [needle, label] of [
  ['process.env.CRON_SECRET?.trim()', 'CRON_SECRET lookup'],
  ['bearerMatchesAnySecret', 'constant-time bearer helper'],
  ['if (!cronSecret)', 'missing-secret deny path'],
  ['return bearerMatchesAnySecret', 'bearer authorization decision'],
  ['trigger_source: "cron"', 'cron run provenance'],
  ['admissions_auto_task_runs', 'Admissions run logging'],
  ['run_admissions_auto_tasks', 'Admissions automation RPC'],
]) {
  if (!route.includes(needle)) {
    throw new Error(`Admissions cron verification failed: missing ${label} (${needle}).`);
  }
}

if (route.includes('crm.yogakulam.com/api/admissions/auto-tasks')) {
  throw new Error(
    'Admissions cron verification failed: legacy crm.yogakulam.com admissions endpoint must not be used by the current admissions runner.',
  );
}

for (const expected of [
  '/api/intelligence/system-snapshot',
  '/api/intelligence/lead-scoring-snapshot',
  '/api/intelligence/prediction-outcomes',
  '/api/automation/whatsapp/broadcast-runner',
  '/api/automation/instagram/runner',
  '/api/analytics/ga4/sync',
  '/api/analytics/gsc/sync',
  '/api/analytics/google-ads/sync',
  '/api/analytics/meta-ads/sync',
]) {
  if (!(vercel.crons ?? []).some((cron) => cron.path === expected)) {
    throw new Error(`Admissions cron verification failed: existing cron disappeared (${expected}).`);
  }
}

const durableTrigger =
  vercel.functions?.['app/api/tracking/durable-events/consume/route.ts']?.experimentalTriggers;
if (!Array.isArray(durableTrigger) || durableTrigger.length === 0) {
  throw new Error('Admissions cron verification failed: durable tracking queue trigger disappeared.');
}

console.log('Admissions cron registration and scheduler-authority contracts verified.');
