import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Admissions final closeout verification failed: missing ${label} (${needle})`);
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Admissions final closeout verification failed: forbidden ${label} (${needle})`);
  }
}

const migration = read('supabase/migrations/20261101050000_admissions_final_closeout_v1.sql');
const data = read('lib/admissions-data.ts');
const layout = read('app/admissions/layout.tsx');
const page = read('app/admissions/page.tsx');
const scoped = read('app/admissions/scoped/page.tsx');
const packageJson = read('package.json');
const ci = read('.github/workflows/ci.yml');

for (const [needle, label] of [
  ['with (security_invoker = true)', 'security-invoker upcoming-capacity view'],
  ['coalesce(end_date, start_date) >= current_date', 'effective upcoming schedule boundary'],
  ['active = true', 'active batch boundary'],
  ['capacity_status', 'capacity evidence preservation'],
]) {
  requireText(migration, needle, label);
}

for (const [needle, label] of [
  ["snapshotSource: 'canonical'", 'canonical snapshot provenance'],
  ['Admissions canonical snapshot timed out.', 'explicit timeout failure'],
  ['Partial fallback data is intentionally not shown', 'fail-closed explanation'],
  ["supabase.rpc('get_admissions_snapshot'", 'canonical Admissions snapshot RPC'],
]) {
  requireText(data, needle, label);
}

for (const [needle, label] of [
  ['getLightweightAdmissionsSnapshot', 'silent lightweight Admissions fallback'],
  ['Promise.allSettled([', 'partial fallback loader'],
]) {
  forbidText(data, needle, label);
}

for (const [needle, label] of [
  ["from('v_admissions_automation_health')", 'canonical automation-health read'],
  ['Admissions automation healthy', 'healthy automation state'],
  ['Admissions automation requires review', 'degraded automation state'],
  ['No healthy state is inferred', 'fail-closed health copy'],
]) {
  requireText(layout, needle, label);
}

for (const [needle, label] of [
  ['row.calculated_seats_remaining == null ? null', 'unknown capacity preservation'],
  ['remaining == null ? "—"', 'unknown seats rendering'],
  ['outstanding.missingCurrencyRecords', 'currency-safe payment summary'],
  ['on_time_response_rate_percent', 'SLA evidence retained'],
]) {
  requireText(page, needle, label);
}

for (const [needle, label] of [
  ['const snapshot = await getAdmissionsSnapshot();', 'scoped workspace canonical snapshot dependency'],
  ['Unknown metadata is not treated as a match.', 'scoped unknown-evidence boundary'],
]) {
  requireText(scoped, needle, label);
}

requireText(
  packageJson,
  'verify:admissions-final-closeout',
  'package Admissions final closeout verifier',
);
requireText(
  ci,
  'npm run verify:admissions-final-closeout',
  'CI Admissions final closeout gate',
);

console.log('Admissions final closeout contracts verified.');
