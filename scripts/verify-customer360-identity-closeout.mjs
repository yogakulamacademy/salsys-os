import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Customer 360 identity verification failed: missing ${label} (${needle})`);
  }
}

const migration = read('supabase/migrations/20261020114000_customer360_identity_closeout_v1.sql');
const universalIdentify = read('app/api/events/identify/v1/route.ts');
const legacyIdentify = read('app/api/tracking/identify/route.ts');
const packageJson = read('package.json');
const ci = read('.github/workflows/ci.yml');

for (const [needle, label] of [
  ['attach_exact_session_identity_v1', 'atomic exact-session identity RPC'],
  ['pg_advisory_xact_lock', 'exact-session concurrency lock'],
  ['for update', 'exact-session row lock'],
  ["'identity_scope', 'exact_session'", 'exact-session routing provenance'],
  ["'atomic', true", 'atomic completion evidence'],
  ['visitor_identity_links_org_lead_fkey_v1', 'visitor routing tenant composite foreign key'],
  ['references public.leads(organization_id, id)', 'tenant-bound lead reference'],
  ['0.9800', 'conservative automatic-link threshold'],
  ["'weak_single_signal_auto_merge', false", 'weak-signal non-merge posture'],
  ['organizations_ensure_identity_resolution_policy_v1', 'future organization policy provisioning'],
  ['identity_resolution_policy_delete_guard_v1', 'active policy deletion guard'],
  ['v_customer360_identity_integrity_health_v1', 'Customer 360 identity health view'],
  ['visitor_current_session_mismatches', 'exact current-session routing health'],
  ['identifiers_shared_across_persons', 'identifier uniqueness health'],
  ['lead_sessions_missing_person_session', 'lead/session Person coverage health'],
  ['duplicate_canonical_journey_keys', 'canonical journey uniqueness health'],
  ['security_invoker = true', 'tenant/RLS-safe health view'],
  ['from public, anon, authenticated', 'internal RPC execution hardening'],
  ['to service_role', 'service-role-only atomic identity RPC'],
]) {
  requireText(migration, needle, label);
}

for (const [source, label] of [
  [universalIdentify, 'universal identity route'],
  [legacyIdentify, 'legacy compatibility identity route'],
]) {
  requireText(source, 'attach_exact_session_identity_v1', `${label} uses atomic RPC`);
  if (source.includes('.from("visitor_identity_links")') || source.includes(".from('visitor_identity_links')")) {
    throw new Error(`Customer 360 identity verification failed: ${label} still mutates visitor_identity_links outside the atomic RPC.`);
  }
  if (source.includes('attach_visitor_journey_to_lead')) {
    throw new Error(`Customer 360 identity verification failed: ${label} still performs non-atomic journey attachment.`);
  }
}

requireText(universalIdentify, 'source.organizationId', 'universal source-derived tenant binding');
requireText(legacyIdentify, '.from("leads")', 'legacy server-derived lead organization');
requireText(legacyIdentify, 'secretMatches', 'legacy timing-safe tracking secret comparison');
requireText(legacyIdentify, 'request.body.getReader()', 'legacy streamed request-body reader');
requireText(legacyIdentify, 'totalBytes > maxBytes', 'legacy actual byte-limit enforcement');
requireText(legacyIdentify, 'error: "Lead identification failed"', 'legacy stable backend failure response');

if (legacyIdentify.includes('supplied !== expected')) {
  throw new Error('Customer 360 identity verification failed: legacy identify still compares tracking secrets with ordinary string equality.');
}
if (legacyIdentify.includes('await request.json()')) {
  throw new Error('Customer 360 identity verification failed: legacy identify still fully buffers request.json() before enforcing the actual byte limit.');
}
if (legacyIdentify.includes('error instanceof Error ? error.message')) {
  throw new Error('Customer 360 identity verification failed: legacy identify still exposes caught backend exception messages.');
}

requireText(packageJson, 'verify:customer360-identity', 'package verifier script');
requireText(ci, 'npm run verify:customer360-identity', 'CI verifier step');

console.log('Customer Journey / Person 360 / Identity Closeout V1 contracts verified.');
