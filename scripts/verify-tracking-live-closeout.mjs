import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20261020121000_tracking_live_closeout_health_v1.sql';

function fail(message) {
  console.error(`\n[tracking-live-closeout] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const sql = read(migrationPath);

const required = [
  ['v_tracking_live_closeout_health_v1', 'live-closeout health view'],
  ["s.source_type = 'website'", 'website-source scoping'],
  ["s.auth_mode = 'origin'", 'origin-authenticated browser source scoping'],
  ["s.privacy_mode = 'strict'", 'strict privacy posture'],
  ['require_consent_for_optional', 'optional tracking consent requirement'],
  ['honor_gpc', 'GPC source requirement'],
  ['privacy_notice_version', 'privacy notice version requirement'],
  ["r.source_event_type = 'web.session_started'", 'canonical session event evidence'],
  ["r.source_event_type = 'web.page_viewed'", 'canonical page event evidence'],
  ["'web.form_submitted'", 'canonical form-submit evidence'],
  ["pr.purpose_key = 'analytics'", 'analytics consent receipts'],
  ["pr.decision = 'granted'", 'analytics grant proof'],
  ["pr.decision = 'denied'", 'analytics denial proof'],
  ["pr.decision = 'withdrawn'", 'analytics withdrawal proof'],
  ["pr.purpose_key = 'sale_sharing'", 'sale/sharing consent purpose'],
  ["pr.decision = 'opted_out'", 'GPC opt-out proof'],
  ["pr.evidence->>'gpc'", 'GPC receipt evidence'],
  ['exact_session_identity_links_7d', 'exact-session identity proof'],
  ['identified_form_submissions_7d', 'form-to-known-lead proof'],
  ['dead_letter_events_7d', 'processing dead-letter health'],
  ['stuck_processing_events_24h', 'stuck processing health'],
  ['contract_rejected_events_7d', 'event-contract rejection health'],
  ['backend_closeout_candidate', 'explicit backend closeout candidate gate'],
  ["then 'not_live'", 'not-live state'],
  ["then 'degraded'", 'degraded state'],
  ["then 'backend_closeout_candidate'", 'candidate state'],
  ["else 'collecting'", 'collecting state'],
  ['revoke all on public.v_tracking_live_closeout_health_v1 from public, anon, authenticated', 'restricted health telemetry'],
  ['grant select on public.v_tracking_live_closeout_health_v1 to service_role', 'service-role telemetry access'],
  ['Browser tag uniqueness', 'manual browser acceptance caveat'],
  ['third-party consent gating', 'third-party consent caveat'],
];

for (const [needle, label] of required) {
  if (!sql.includes(needle)) fail(`Migration is missing ${label} (${needle}).`);
}

if (/grant\s+select\s+on\s+public\.v_tracking_live_closeout_health_v1\s+to\s+(anon|authenticated)/i.test(sql)) {
  fail('Live-closeout health must not expose raw-event-derived telemetry directly to anon/authenticated roles.');
}

if (!sql.includes("vil.source_system in ('events-identify-v1', 'tracking-identify')")) {
  fail('Identity proof must be limited to the trusted exact-session identify routes.');
}

console.log('[tracking-live-closeout] PASS: live tracking/consent closeout health contracts verified.');
