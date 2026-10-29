import fs from 'node:fs';

const routePath = 'app/api/tracking/forms/browser/v1/route.ts';
const source = fs.readFileSync(routePath, 'utf8');

function fail(message) {
  console.error(`Browser form discovery dedupe verification failed: ${message}`);
  process.exit(1);
}

const sanitizeMarker = 'const sanitizedForms = rawForms';
const dedupeMarker = 'new Map(sanitizedForms.map((form) => [form.formKey, form])).values()';
const capMarker = ').slice(0, 30);';
const conflictMarker = "onConflict: 'organization_id,organization_site_id,form_key'";

for (const [label, marker] of [
  ['sanitized form staging', sanitizeMarker],
  ['formKey dedupe', dedupeMarker],
  ['post-dedupe 30-form cap', capMarker],
  ['tracking_forms conflict target', conflictMarker],
]) {
  if (!source.includes(marker)) fail(`${label} contract is missing.`);
}

const sanitizeIndex = source.indexOf(sanitizeMarker);
const dedupeIndex = source.indexOf(dedupeMarker);
const capIndex = source.indexOf(capMarker, dedupeIndex);
const rowsIndex = source.indexOf('const rows = forms.map', capIndex);
const upsertIndex = source.indexOf(".from('tracking_forms')", rowsIndex);

if (!(sanitizeIndex < dedupeIndex && dedupeIndex < capIndex && capIndex < rowsIndex && rowsIndex < upsertIndex)) {
  fail('expected sanitize -> dedupe -> cap -> rows -> upsert ordering was not preserved.');
}

const oldUnsafePattern = `.filter((form): form is NonNullable<ReturnType<typeof sanitizeForm>> => Boolean(form))\n    .slice(0, 30);`;
if (source.includes(oldUnsafePattern)) {
  fail('unsafe pre-dedupe 30-form cap is still present.');
}

if (!source.includes('detected: rows.length')) {
  fail('response detected count must continue to reflect the deduplicated upsert rows.');
}

console.log('Browser form discovery dedupe contract verified.');
