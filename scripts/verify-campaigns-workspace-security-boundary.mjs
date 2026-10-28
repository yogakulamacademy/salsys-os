import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261028030320_promote_campaigns_workspace_security_boundary.sql',
  'utf8',
);

const probeMigration = fs.readFileSync(
  'supabase/migrations/20261028030036_add_campaigns_workspace_v2.sql',
  'utf8',
);

const cleanupMigration = fs.readFileSync(
  'supabase/migrations/20261028030358_remove_campaigns_workspace_v2_probe.sql',
  'utf8',
);

const required = [
  /alter function public\.get_campaigns_workspace\([\s\S]*?security definer;/i,
  /is_organization_member\(p_organization_id\)/i,
  /set search_path = public, auth, pg_temp/i,
  /revoke all[\s\S]*?get_campaigns_workspace_v2[\s\S]*?from public, anon, authenticated, service_role;/i,
  /grant execute[\s\S]*?get_campaigns_workspace_v2[\s\S]*?to authenticated, service_role;/i,
  /drop function if exists public\.get_campaigns_workspace_v2/i,
];

const checks = [
  [required[0], migration, 'Campaigns V1 must be promoted to SECURITY DEFINER'],
  [required[1], probeMigration, 'V2 probe must explicitly check organization membership'],
  [required[2], probeMigration, 'V2 probe must use a fixed search_path'],
  [required[3], probeMigration, 'V2 probe must revoke PUBLIC/anon execution before granting callers'],
  [required[4], probeMigration, 'V2 probe must grant only authenticated/service_role execution'],
  [required[5], cleanupMigration, 'Temporary V2 probe must be removed'],
];

for (const [pattern, text, message] of checks) {
  if (!pattern.test(text)) {
    throw new Error(message);
  }
}

console.log('Campaigns workspace security-boundary contract verified.');
