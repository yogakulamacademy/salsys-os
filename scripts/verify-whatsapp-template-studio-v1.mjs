import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

const migration = read('supabase/migrations/20261111103500_whatsapp_template_drafts_v1.sql');
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

console.log('WhatsApp Template Studio V1 contracts passed (read only).');
