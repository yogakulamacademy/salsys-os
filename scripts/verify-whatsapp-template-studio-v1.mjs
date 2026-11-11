import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

const migration = read('supabase/migrations/20261111103500_whatsapp_template_drafts_v1.sql');
const nameGuardCorrection = read('supabase/migrations/20261111141500_whatsapp_template_draft_name_guard_v1.sql');
const authoring = read('lib/integrations/whatsapp-template-authoring.ts');
const draftsRoute = read('app/api/integrations/whatsapp/templates/drafts/route.ts');
const submitRoute = read('app/api/integrations/whatsapp/templates/submit/route.ts');
const studio = read('app/automation/templates/new/template-authoring-studio.tsx');
const workspace = read('app/automation/templates/template-workspace.tsx');
const page = read('app/automation/templates/page.tsx');

for (const [name, content] of Object.entries({
  migration, authoring, draftsRoute, submitRoute, studio, workspace, page,
})) assert.ok(content.trim(), name + ' is empty');

for (const check of [
  'organization_id uuid not null',
  'whatsapp_account_id uuid not null',
  'enable row level security',
  'revoke all on public.whatsapp_template_drafts from anon, authenticated',
  'wa.organization_id = new.organization_id',
  "'submitting'",
  "'uncertain'",
]) assert.ok(migration.includes(check), 'Draft schema contract missing: ' + check);

for (const check of [
  'can_manage_organization',
  "['owner', 'admin']",
  "profiles",
  'getWhatsAppRuntimeForOrganization',
  "automation_whatsapp_templates",
]) assert.ok(authoring.includes(check) || draftsRoute.includes(check), 'Server auth contract missing: ' + check);

// The existing Templates page must work before the optional authoring migration exists.
assert.ok(page.includes("process.env.WA_TEMPLATE_STUDIO_ENABLED === 'true'"), 'Studio must be default-off on the provider list');
assert.ok(page.includes('if (studioEnabled && senderResult.accountId)'), 'No draft table reads until explicitly enabled');
assert.ok(draftsRoute.includes("process.env.WA_TEMPLATE_STUDIO_ENABLED !== 'true'"), 'Draft routes must fail closed');
assert.ok(submitRoute.includes("process.env.WA_TEMPLATE_STUDIO_ENABLED !== 'true'"), 'Submission needs the separate studio gate');
assert.ok(workspace.includes('canCreate'), 'Template Studio creation control must be gated');
const newPage = read('app/automation/templates/new/page.tsx');
assert.ok(
  newPage.includes("const studioEnabled = process.env.WA_TEMPLATE_STUDIO_ENABLED === 'true'") &&
  newPage.includes('if (!studioEnabled && !previewMode) notFound()'),
  'Editor must remain unavailable without enablement or an explicit safe preview',
);

assert.ok(draftsRoute.includes("request.headers.get('origin') !== request.nextUrl.origin"), 'Draft write needs CSRF origin check');
assert.ok(submitRoute.includes("request.headers.get('origin') !== request.nextUrl.origin"), 'Provider request needs CSRF origin check');
assert.ok(submitRoute.includes("process.env.WA_TEMPLATE_AUTHORING_ENABLED !== 'true'"), 'Authoring must default OFF');
assert.ok(submitRoute.includes(".eq('status', 'draft')") && submitRoute.includes("'submitting'"), 'Provider claim must be atomic');
assert.ok(submitRoute.includes("status: 'uncertain'") || submitRoute.includes("'uncertain'"), 'Ambiguous sends must not retry');
assert.ok(submitRoute.includes("customerMessageSent: false"), 'Template review must not claim customer messaging');
assert.ok(authoring.includes("/message_templates"), 'Meta must receive a template review request');
assert.ok(!authoring.includes("'/messages'") && !submitRoute.includes("'/messages'"), 'Template authoring must never call WhatsApp send');
assert.ok(studio.includes('Live WhatsApp preview') && studio.includes('Save draft'), 'Studio actions missing');
assert.ok(studio.includes('Confirm submission') && studio.includes('reviewOpen'), 'Explicit review confirmation missing');
assert.ok(page.includes('whatsapp_template_drafts'), 'Drafts must be loaded for workspace');
assert.ok(workspace.includes('previewContent(template.components)'), 'Meta-approved preview must use provider content');

// Preview mode must permit UI inspection only, never access the draft API or Meta.
const previewPage = read('app/automation/templates/new/page.tsx');
assert.ok(previewPage.includes("params.preview === '1'"), 'Admin UI preview needs explicit preview marker');
assert.ok(previewPage.includes("['owner', 'admin'].includes("), 'Editor preview must enforce tenant admin role');
assert.ok(previewPage.includes("!previewMode && typeof params.draft"), 'Preview must never fetch an existing draft');
assert.ok(previewPage.includes("submissionEnabled={!previewMode"), 'Preview must never open provider submission');
assert.ok(studio.includes('if (previewMode) return null'), 'Preview save must short-circuit before network');
assert.ok(studio.includes('previewMode || !canSubmit'), 'Preview submit must short-circuit before provider');
assert.ok(studio.includes('disabled={previewMode || locked}'), 'Preview must disable Save draft');
assert.ok(studio.includes('disabled={!canSubmit}'), 'Preview must disable Submit');
assert.ok(workspace.includes('/automation/templates/new?preview=1'), 'Template library must expose preview entry');
assert.ok(draftsRoute.includes("process.env.WA_TEMPLATE_STUDIO_ENABLED !== 'true'"), 'Draft API remains default-off');
assert.ok(submitRoute.includes("process.env.WA_TEMPLATE_AUTHORING_ENABLED !== 'true'"), 'Meta API remains default-off');

// A real Postgres write preflight found that {1,512} is an invalid regex bound.
assert.ok(nameGuardCorrection.includes('length(template_name) between 1 and 512'),
  'Draft name constraint requires a separate explicit character bound');
assert.ok(nameGuardCorrection.includes("template_name ~ '^[a-z0-9_]+
"),
  'Draft name characters must remain limited to a lowercase identifier');
assert.ok(!nameGuardCorrection.includes('{1,512}'),
  'Do not reintroduce the invalid PostgreSQL regex repetition bound');

console.log('WhatsApp Template Studio V1 contracts passed (read only).');
