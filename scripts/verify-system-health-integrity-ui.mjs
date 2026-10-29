import fs from 'node:fs';

const layout = fs.readFileSync('app/system-health/layout.tsx', 'utf8');
const page = fs.readFileSync('app/system-health/page.tsx', 'utf8');

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`System Health integrity UI verification failed: missing ${label} (${needle})`);
  }
}

for (const [needle, label] of [
  ['v_system_integrity_health_v1', 'normalized integrity source'],
  ['requireIntegrityAdminAccess', 'admin access guard'],
  ['workspace.activeWorkspace.role !== "owner"', 'owner role enforcement'],
  ['workspace.activeWorkspace.role !== "admin"', 'admin role enforcement'],
  ['createAdminClient()', 'service-role reader'],
  ['.eq("organization_id", organizationId)', 'explicit tenant scope'],
  ['Data integrity', 'Data integrity section'],
  ['Core integrity checks', 'integrity heading'],
  ['Actionable issues', 'actionable issue metric'],
  ['Open identity conflicts', 'identity conflict detail'],
  ['Actionable orphan persons', 'actionable orphan detail'],
  ['Missing journey coverage', 'journey coverage detail'],
  ['Retained identities', 'retained identity detail'],
  ['informational', 'retained identity informational label'],
]) {
  requireText(layout, needle, label);
}

for (const [needle, label] of [
  ['v_system_health', 'existing operational health source'],
  ['v_system_health_summary', 'existing operational summary source'],
  ['v_system_activity_24h', 'existing operational activity source'],
  ['v_system_recent_failures', 'existing recent-failure source'],
  ['24h activity', 'existing sync/event card semantics'],
]) {
  requireText(page, needle, label);
}

if (page.includes('v_system_integrity_health_v1')) {
  throw new Error('Integrity rows must remain separate from the existing operational SystemHealthCard pipeline.');
}

console.log('System Health integrity UI contracts verified.');
