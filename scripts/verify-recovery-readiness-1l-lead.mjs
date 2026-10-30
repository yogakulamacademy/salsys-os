import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PH-5.2B.1l lead recovery verification failed: ${message}`);
  }
}

const baseline = read('supabase/recovery/039_leads_landing_page_baseline.sql');

for (const [needle, label] of [
  ['alter table public.leads', 'leads table alteration'],
  ['add column if not exists landing_page text', 'nullable text landing-page column'],
  ['This file is NOT part of the normal production migration ledger.', 'recovery-only warning'],
  ['Never run it against current production.', 'production safety warning'],
  ['No production lead data is copied or rewritten.', 'no-data-copy warning'],
]) {
  assert(baseline.includes(needle), `missing ${label}.`);
}

assert(
  !baseline.includes('not null') && !baseline.includes(' default '),
  'landing_page recovery must remain nullable text with no default.',
);

assert(
  !baseline.toLowerCase().includes('update public.leads') &&
    !baseline.toLowerCase().includes('insert into public.leads'),
  'lead landing-page recovery must not mutate production-like lead data.',
);

console.log('PH-5.2B.1l lead landing-page recovery contract verified.');
