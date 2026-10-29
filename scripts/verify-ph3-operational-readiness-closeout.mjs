import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Missing ${label}: ${needle}`);
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Forbidden ${label}: ${needle}`);
  }
}

const migration = read('supabase/migrations/20261029115500_ph3_operational_readiness_closeout.sql');
const layout = read('app/system-health/layout.tsx');
const readiness = read('app/system-health/operational-readiness-section.tsx');
const page = read('app/system-health/page.tsx');

for (const [needle, label] of [
  ['create or replace view public.v_system_health_v2', 'versioned System Health V2'],
  ['create or replace view public.v_system_health_summary_v2', 'versioned System Health V2 summary'],
  ['create or replace view public.v_system_operational_readiness_v1', 'operational readiness view'],
  ['with (security_invoker = true)', 'security-invoker views'],
  ['grant select on public.v_system_operational_readiness_v1 to service_role', 'service-role readiness grant'],
  ["'tracking'::text as readiness_key", 'tracking readiness'],
  ["'privacy'::text", 'privacy readiness'],
  ["'search_indexing'::text", 'search readiness'],
  ["'conversion_feedback'::text", 'conversion-feedback readiness'],
  ["'automation_runtime'::text", 'automation runtime readiness'],
  ["'instagram_automation'::text", 'Instagram automation readiness'],
  ["'course_catalog_sync'::text", 'course sync readiness'],
  ["'meta_ads_readiness'::text", 'Meta Ads readiness'],
  ["'configuration_blocked'", 'configuration-blocked state'],
  ["'inactive'", 'inactive state'],
]) {
  requireText(migration, needle, label);
}

for (const forbidden of [
  'create table',
  'drop table',
  'drop view public.v_system_health',
]) {
  forbidText(migration.toLowerCase(), forbidden, 'destructive or duplicate telemetry DDL');
}

for (const [needle, label] of [
  ['OperationalReadinessSection', 'readiness component integration'],
  ['organizationId={organizationId}', 'authorized organization propagation'],
]) {
  requireText(layout, needle, label);
}

for (const [needle, label] of [
  ['v_system_operational_readiness_v1', 'readiness source'],
  ['.eq("organization_id", organizationId)', 'explicit tenant filter'],
  ['Operational readiness', 'readiness section heading'],
  ['configuration_blocked', 'configuration-blocked rendering'],
  ['inactive', 'inactive rendering'],
]) {
  requireText(readiness, needle, label);
}

for (const [needle, label] of [
  ['v_system_health', 'existing operational health source'],
  ['v_system_health_summary', 'existing operational summary source'],
  ['v_system_activity_24h', 'existing operational activity source'],
  ['v_system_recent_failures', 'existing recent-failure source'],
]) {
  requireText(page, needle, label);
}

console.log('PH-3 operational readiness closeout contract verified.');
