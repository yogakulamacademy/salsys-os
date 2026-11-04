const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

const page = read('app/settings/page.tsx');
const editor = read('app/settings/crm-rule-editor.tsx');
const actions = read('app/settings/actions.ts');
const sql = read('supabase/migrations/20261104131500_crm_settings_bulk_v1.sql');
const css = read('app/settings/crm-rules.css');

test('CRM Rules uses trusted tenant-scoped settings, messaging and audit sources', () => {
  for (const needle of ["supabase.rpc('get_crm_stage_settings')",
    "supabase.rpc('get_crm_settings_audit'", 'getCurrentWorkspaceContext',
    'loadProviderVisibility(live)', 'loadWhatsAppConnectionState(', 'source === \'unavailable\'',
    'Settings audit could not be verified:', 'This is not presented as an empty change history.']) {
    assert.ok(page.includes(needle), needle);
  }
  assert.ok(page.includes('<CrmRuleEditor'));
  assert.ok(page.includes('Owner / Admin / Manager permissions'));
  assert.ok(page.includes('Reference defaults only · not tenant data'));
  assert.ok(!page.includes('92%'));
});

test('editor Reset, Save Changes and validation genuinely submit only changes', () => {
  assert.ok(editor.includes('action={saveCrmSettingsBulkAction}'));
  assert.ok(editor.includes('name="changes_json"'));
  assert.ok(editor.includes('onClick={reset}'));
  assert.ok(editor.includes('result.invalid || result.dirty === 0'));
  assert.ok(editor.includes("source === 'database'"));
  assert.ok(editor.includes('changes: {probabilities,aging:agingChanges}'));
  assert.ok(editor.includes('old_percent:row.probability_percent'));
  assert.ok(editor.includes('old_warning_hours:row.warning_hours'));
  assert.ok(editor.includes('old_stuck_hours:row.stuck_hours'));
  assert.ok(editor.includes('stuck <= warning'));
  assert.ok(editor.includes('Show all'));
});

test('server action validates every edit and uses single authenticated transaction RPC', () => {
  for (const needle of ["requireCurrentOrganizationId", "supabase.rpc('update_crm_settings_bulk_v1'",
    'useMockData', 'seenProbabilities', 'seenAging',
    'old_percent', 'old_warning_hours', 'old_stuck_hours',
    "settingsRedirect('error'", "revalidatePath('/pipeline')"]) {
    assert.ok(actions.includes(needle), needle);
  }
  assert.ok(sql.includes('create or replace function public.update_crm_settings_bulk_v1('));
  assert.ok(sql.includes("auth.role() <> 'authenticated'"));
  assert.ok(sql.includes('public.current_tenant_organization_id() is distinct from p_organization_id'));
  assert.ok(sql.includes('public.can_administer_organization_crm'));
  assert.ok(sql.includes('for update;'));
  assert.ok(sql.includes('changed since this page loaded'));
  assert.ok(sql.includes('public.update_crm_stage_probability_v2('));
  assert.ok(sql.includes('public.update_crm_pipeline_aging_rule_v2('));
  assert.ok(sql.includes('revoke all on function public.update_crm_settings_bulk_v1(uuid, jsonb)'));
  assert.ok(sql.includes('grant execute on function public.update_crm_settings_bulk_v1(uuid, jsonb)'));
  assert.ok(sql.includes('commit;'));
});

test('new layout is scoped and responsive with no false sync or health claims', () => {
  assert.ok(css.includes('.cr-main'));
  assert.ok(css.includes('.cr-audit-table'));
  assert.ok(css.includes('@media(max-width:650px)'));
  assert.ok(page.includes('Implemented · runtime unverified'));
  assert.ok(page.includes('Supabase persistence configured, not a live health check.'));
  assert.ok(page.includes('No verified configuration gaps'));
  assert.ok(!page.includes('Mock dataset is disabled. Enable'));
});
