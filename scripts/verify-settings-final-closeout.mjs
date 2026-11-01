import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function expectIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Settings final closeout verification failed: ${label}`);
  }
}

function expectNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Settings final closeout verification failed: ${label}`);
  }
}

const layout = read('app/settings/layout.tsx');
const page = read('app/settings/page.tsx');
const settingsActions = read('app/settings/actions.ts');
const teamPage = read('app/settings/team/page.tsx');
const teamActions = read('app/settings/team/actions.ts');
const integrationsPage = read('app/settings/integrations/page.tsx');
const providerVisibility = read('lib/integrations/provider-visibility.ts');
const routeAccess = read('lib/route-access.ts');
const migration = read('supabase/migrations/20261101060000_settings_final_closeout_v1.sql');

expectIncludes(layout, 'requirePrivilegedWorkspaceAccess', 'Settings route tree must use the canonical privileged workspace guard');
expectIncludes(layout, 'await requirePrivilegedWorkspaceAccess();', 'Settings layout must enforce the privileged guard before rendering children');
expectIncludes(routeAccess, 'const PRIVILEGED_ROLES = new Set(["owner", "admin", "manager"]);', 'privileged Settings roles must remain owner/admin/manager');

for (const [needle, label] of [
  ["type SettingsSource = 'database' | 'reference' | 'unavailable';", 'Settings must track configuration evidence source explicitly'],
  ["const unavailableSettings: SettingsPayload", 'live Settings failures must have an unavailable state'],
  ["source === 'unavailable'", 'Settings UI must render an unavailable state'],
  ['Tenant forecast and aging values are hidden rather than replaced with defaults.', 'live Settings failure must explicitly reject fallback substitution'],
  ['Reference defaults only · not tenant data', 'mock/setup reference defaults must be labeled as non-tenant data'],
  ['Live forecast probabilities could not be verified, so no fallback values are presented as tenant configuration.', 'forecast failure must fail closed'],
  ['Live pipeline-aging rules could not be verified. No thresholds are inferred from fallback defaults.', 'aging failure must fail closed'],
  ['Settings audit could not be verified:', 'audit read failure must be distinguished from an empty audit'],
  ['This is not presented as an empty change history.', 'audit failure must not masquerade as no history'],
  ['providerVisibility.instagramConnected', 'Instagram status must come from provider visibility evidence'],
  ['visibility.whatsappConnected', 'WhatsApp fallback status must come from provider visibility evidence'],
  ["status={instagramStatus}", 'Instagram Settings row must render canonical provider status'],
  ['Workspace-scoped Instagram Direct messaging and automation eligibility', 'Instagram capability copy must reflect implemented messaging operations'],
  ['Owner / Admin / Manager permissions', 'Settings mutation role label must match database authorization'],
]) {
  expectIncludes(page, needle, label);
}
expectNotIncludes(page, 'Future milestone', 'Settings must not hardcode Instagram as a future milestone');
expectNotIncludes(page, 'Database-backed stage probabilities\"', 'fallback/default evidence must not be hardcoded as database-backed without source branching');

for (const [needle, label] of [
  ['instagramConnected: boolean;', 'provider visibility helper must expose Instagram connectivity'],
  ['whatsappConnected: boolean;', 'provider visibility helper must expose WhatsApp connectivity'],
  ['payload.instagram_connected === true', 'provider visibility helper must map Instagram boolean'],
  ['payload.whatsapp_connected === true', 'provider visibility helper must map WhatsApp boolean'],
]) {
  expectIncludes(providerVisibility, needle, label);
}

for (const [needle, label] of [
  ["'instagram_connected'", 'provider visibility RPC must include Instagram connectivity'],
  ["c.provider = 'instagram'", 'Instagram connectivity must use the canonical provider row'],
  ["'whatsapp_connected'", 'provider visibility RPC must include WhatsApp connectivity'],
  ["c.provider = 'whatsapp'", 'WhatsApp connectivity must use the canonical provider row'],
  ['revoke all on function public.get_provider_visibility(uuid) from public, anon;', 'provider visibility must deny anonymous execution'],
  ['grant execute on function public.get_provider_visibility(uuid) to authenticated, service_role;', 'provider visibility must remain authenticated/service-role only'],
  ['No credentials, asset', 'migration must document secret-minimized provider visibility'],
]) {
  expectIncludes(migration, needle, label);
}
for (const forbidden of ['access_token_ciphertext', 'refresh_token_ciphertext', 'client_secret', 'provider_metadata']) {
  expectNotIncludes(migration, forbidden, `provider visibility migration must not return or reference ${forbidden}`);
}

expectIncludes(settingsActions, "requireCurrentOrganizationId", 'Settings writes must stay bound to the active organization');
expectIncludes(settingsActions, "update_crm_stage_probability_v2", 'forecast writes must stay on tenant-aware RPC');
expectIncludes(settingsActions, "update_crm_pipeline_aging_rule_v2", 'aging writes must stay on tenant-aware RPC');
expectIncludes(teamPage, "['owner', 'admin'].includes", 'Team & Access page must remain owner/admin only');
expectIncludes(teamActions, "['owner', 'admin'].includes", 'Team & Access mutations must remain owner/admin only');
expectIncludes(integrationsPage, "!['owner', 'admin'].includes(activeWorkspace.role)", 'integration administration must remain owner/admin only');

console.log('Settings final closeout contracts verified.');
