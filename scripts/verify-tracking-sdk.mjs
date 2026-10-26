import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const intelligenceLoaderPath = 'public/salsys-intelligence.js';
const intelligenceCorePath = 'public/salsys-intelligence-core-v1.6.0.js';

const requiredFiles = [
  intelligenceLoaderPath,
  intelligenceCorePath,
  'public/salsys-tracker.js',
  'public/salsys-consent.js',
  'schemas/salsys-event-v1.schema.json',
  'app/api/events/v1/route.ts',
  'app/api/events/browser/v1/route.ts',
  'app/api/events/identify/v1/route.ts',
  'app/api/privacy/consent/v1/route.ts',
  'lib/tracking/durable-events.ts',
  'docs/universal-event-protocol-v1.md',
  'docs/universal-tracking-intelligence-sdk.md',
  'docs/universal-consent-ui-v1.md',
  'docs/event-tracking-v1.md',
  'supabase/migrations/20261020114000_customer360_identity_closeout_v1.sql',
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

for (const file of [
  intelligenceLoaderPath,
  intelligenceCorePath,
  'public/salsys-tracker.js',
  'public/salsys-consent.js',
]) {
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
const intelligenceLoader = read(intelligenceLoaderPath);
const intelligenceCore = read(intelligenceCorePath);
const intelligence = `${intelligenceLoader}\n${intelligenceCore}`;
const consentUi = read('public/salsys-consent.js');
const browserRoute = read('app/api/events/browser/v1/route.ts');
const serverRoute = read('app/api/events/v1/route.ts');
const durableServerIngestion = read('lib/tracking/durable-events.ts');
const identifyRoute = read('app/api/events/identify/v1/route.ts');
const identityCloseout = read(
  'supabase/migrations/20261020114000_customer360_identity_closeout_v1.sql',
);
const consentRoute = read('app/api/privacy/consent/v1/route.ts');
const middleware = read('middleware.ts');

if (!intelligenceLoader.includes('salsys-intelligence-core-v1.6.0.js')) {
  fail('Universal entrypoint loader is not pinned to the expected core runtime.');
}

const trackerChecks = [
  ['web.session_started', 'session event'],
  ['web.page_viewed', 'page event'],
  ['web.cta_clicked', 'CTA event'],
  ['web.form_started', 'form-start event'],
  ['web.form_submitted', 'form-submit event'],
  ['salsys_visitor_id', 'canonical visitor field'],
  ['salsys_session_id', 'canonical session field'],
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
  ['data-salsys-lead-form', 'canonical lead-form marker'],
  ['FORM_MODE', 'lead-form tracking mode'],
  ['salsys:consent', 'canonical consent event bridge'],
  ['salsys_tracking_ready', 'canonical dataLayer readiness event'],
  ["data-legacy-aliases', 'false", 'legacy-alias disablement'],
];
for (const [needle, label] of intelligenceChecks) {
  if (!intelligence.includes(needle)) fail(`Universal entrypoint is missing ${label} (${needle}).`);
}

for (const forbidden of [
  'data-yk-lead-form',
  'yk:consent',
  'yk_tracking_ready',
  'YKTracking',
  'yk_visitor_id',
  'yk_session_id',
  'yk_first_touch',
  'yk_session_touch',
]) {
  if (intelligence.includes(forbidden)) {
    fail(`Universal entrypoint must not contain legacy Yogakulam tracking alias ${forbidden}.`);
  }
}

const consentUiChecks = [
  ['SalsysConsent', 'consent UI global'],
  ['Your privacy choices', 'first-run consent banner'],
  ['Privacy settings', 'preference center'],
  ['Accept all', 'accept-all control'],
  ['Reject all', 'reject-all control'],
  ['sale_sharing', 'sale/sharing purpose'],
  ['globalPrivacyControl', 'GPC enforcement'],
  ['data-salsys-privacy-settings', 'manual preference-center opener'],
  ['attachShadow', 'style-isolated consent UI'],
  ['salsys:consent-changed', 'consent-change event'],
];
for (const [needle, label] of consentUiChecks) {
  if (!consentUi.includes(needle)) fail(`Consent UI is missing ${label} (${needle}).`);
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
if (
  !serverRoute.includes('verifyDurableTrustedSource') ||
  !serverRoute.includes('verifySourceWithDeadline')
) {
  fail('Trusted server ingestion must authenticate a tracking source before or after durable admission.');
}
if (
  !durableServerIngestion.includes('ingest_tracking_event_v1') ||
  !durableServerIngestion.includes('p_source_event_id: event.eventId')
) {
  fail('Trusted server ingestion must use canonical idempotent event ingestion with the stable source event ID.');
}
if (!identifyRoute.includes('authenticateServerTrackingSource')) {
  fail('Identity handoff must require an authenticated tracking source.');
}
if (!identifyRoute.includes('source.organizationId')) {
  fail('Identity handoff tenant authority must come from the authenticated tracking source.');
}
if (!identifyRoute.includes('attach_exact_session_identity_v1')) {
  fail('Identity handoff must use the atomic exact-session identity boundary.');
}
if (identifyRoute.includes(".from('visitor_identity_links')") || identifyRoute.includes('attach_visitor_journey_to_lead')) {
  fail('Identity HTTP route must not split canonical identity mutations outside the atomic RPC.');
}
for (const [needle, label] of [
  ['create or replace function public.attach_exact_session_identity_v1', 'atomic identity RPC'],
  ['public.attach_visitor_journey_to_lead', 'canonical exact-session visitor-to-lead attachment'],
  ['ws.session_key = v_session_key', 'exact session-key verification'],
  ['ws.anonymous_visitor_id = v_visitor_id', 'anonymous visitor verification against exact session'],
  ["'identity_scope', 'exact_session'", 'exact-session identity scope'],
  ['for update', 'transactional session lock'],
  ['to service_role', 'service-role-only identity mutation boundary'],
]) {
  if (!identityCloseout.includes(needle)) {
    fail(`Atomic identity boundary is missing ${label} (${needle}).`);
  }
}
if (identityCloseout.includes('p_session_key text default null')) {
  fail('Atomic identity handoff must not permit a visitor-only/no-session fallback.');
}
if (!consentRoute.includes('privacy')) {
  fail('Privacy consent endpoint appears to have lost its privacy handling contract.');
}
for (const purpose of ['analytics', 'marketing', 'advertising', 'sale_sharing', 'personalization']) {
  if (!consentRoute.includes(`'${purpose}'`)) {
    fail(`Privacy endpoint must support ${purpose}.`);
  }
}

for (const publicPath of [
  '/salsys-intelligence.js',
  '/salsys-tracker.js',
  '/salsys-consent.js',
  '/api/events/v1',
  '/api/events/browser/v1',
  '/api/events/identify/v1',
  '/api/privacy/consent/v1',
]) {
  if (!middleware.includes(`\"${publicPath}\"`)) {
    fail(`Middleware must expose ${publicPath} as a public tracking surface.`);
  }
}

if (fs.existsSync(path.join(root, 'integrations/php/event-intelligence'))) {
  fail('PHP Event Intelligence runtime must not be part of the universal tracking architecture.');
}

console.log('[tracking-sdk] PASS: Canonical Salsys Universal Tracking Intelligence SDK V1 + Consent UI contract verified.');
