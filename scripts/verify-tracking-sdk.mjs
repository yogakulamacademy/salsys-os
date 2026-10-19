import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const requiredFiles = [
  'public/salsys-intelligence.js',
  'public/salsys-tracker.js',
  'schemas/salsys-event-v1.schema.json',
  'app/api/events/v1/route.ts',
  'app/api/events/browser/v1/route.ts',
  'app/api/events/identify/v1/route.ts',
  'app/api/privacy/consent/v1/route.ts',
  'docs/universal-event-protocol-v1.md',
  'docs/universal-tracking-intelligence-sdk.md',
  'docs/event-tracking-v1.md',
];

function fail(message) {
  console.error(`\n[tracking-sdk] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

for (const file of requiredFiles) read(file);

for (const file of ['public/salsys-intelligence.js', 'public/salsys-tracker.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(`${file} failed JavaScript syntax validation:\n${result.stderr || result.stdout}`);
  }
}

const schema = JSON.parse(read('schemas/salsys-event-v1.schema.json'));
const requiredEnvelopeFields = ['event_id', 'event_name', 'schema_version'];
for (const field of requiredEnvelopeFields) {
  if (!Array.isArray(schema.required) || !schema.required.includes(field)) {
    fail(`Event schema must require ${field}.`);
  }
}
if (schema.additionalProperties !== false) {
  fail('Event schema must reject unknown top-level fields.');
}
if (schema?.properties?.event_name?.pattern !== '^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$') {
  fail('Event schema event_name pattern no longer matches namespace.event_name.');
}

const tracker = read('public/salsys-tracker.js');
const intelligence = read('public/salsys-intelligence.js');
const browserRoute = read('app/api/events/browser/v1/route.ts');
const serverRoute = read('app/api/events/v1/route.ts');
const identifyRoute = read('app/api/events/identify/v1/route.ts');
const consentRoute = read('app/api/privacy/consent/v1/route.ts');
const middleware = read('middleware.ts');

const trackerChecks = [
  ['web.session_started', 'session event'],
  ['web.page_viewed', 'page event'],
  ['web.cta_clicked', 'CTA event'],
  ['web.form_started', 'form-start event'],
  ['web.form_submitted', 'form-submit event'],
  ['data-salsys-lead-form', 'lead-form marker'],
  ['salsys_visitor_id', 'neutral visitor field'],
  ['salsys_session_id', 'neutral session field'],
  ['gclid', 'Google click ID capture'],
  ['fbclid', 'Meta click ID capture'],
  ['globalPrivacyControl', 'GPC support'],
  ['salsys_event_queue_v1', 'browser retry queue'],
];
for (const [needle, label] of trackerChecks) {
  if (!tracker.includes(needle)) fail(`Browser core is missing ${label} (${needle}).`);
}

const intelligenceChecks = [
  ['SalsysIntelligence', 'product-facing global'],
  ['instagram_click', 'Instagram CTA compatibility'],
  ['enrollment_cta_click', 'enrollment CTA compatibility'],
  ['data-yk-lead-form', 'legacy lead-form migration marker'],
  ['yk:consent', 'legacy consent migration bridge'],
  ['yk_tracking_ready', 'controlled legacy dataLayer readiness bridge'],
];
for (const [needle, label] of intelligenceChecks) {
  if (!intelligence.includes(needle)) fail(`Universal entrypoint is missing ${label} (${needle}).`);
}

if (!browserRoute.includes('resolveBrowserTrackingSource')) {
  fail('Browser ingestion must resolve the tracking source from trusted origin configuration.');
}
if (!browserRoute.includes('privacy_gate_tracking_event_v1')) {
  fail('Browser ingestion must privacy-gate before persistence.');
}
if (!browserRoute.includes('ingest_tracking_event_v1')) {
  fail('Browser ingestion must use canonical idempotent event ingestion.');
}
if (!serverRoute.includes('authenticateServerTrackingSource')) {
  fail('Trusted server ingestion must authenticate a tracking source.');
}
if (!serverRoute.includes('ingest_tracking_event_v1')) {
  fail('Trusted server ingestion must use canonical idempotent event ingestion.');
}
if (!identifyRoute.includes('authenticateServerTrackingSource')) {
  fail('Identity handoff must require an authenticated tracking source.');
}
if (!identifyRoute.includes('attach_web_identity_to_lead')) {
  fail('Identity handoff must preserve the canonical visitor/session-to-lead attachment flow.');
}
if (!consentRoute.includes('privacy')) {
  fail('Privacy consent endpoint appears to have lost its privacy handling contract.');
}

for (const publicPath of [
  '/salsys-intelligence.js',
  '/salsys-tracker.js',
  '/api/events/v1',
  '/api/events/browser/v1',
  '/api/events/identify/v1',
  '/api/privacy/consent/v1',
]) {
  if (!middleware.includes(`"${publicPath}"`)) {
    fail(`Middleware must expose ${publicPath} as a public tracking surface.`);
  }
}

if (fs.existsSync(path.join(root, 'integrations/php/event-intelligence'))) {
  fail('PHP Event Intelligence runtime must not be part of the universal tracking architecture.');
}

console.log('[tracking-sdk] PASS: Universal Tracking Intelligence SDK V1 contract verified.');
