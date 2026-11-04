const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(file)=>fs.readFileSync(path.join(__dirname,'../..',file),'utf8');
const overview=read('app/settings/integrations/page.tsx');
const dashboard=read('app/settings/integrations/integrations-dashboard.tsx');
const wizard=read('app/settings/integrations/connect/page.tsx');
const picker=read('app/settings/integrations/connect/integration-connection-picker.tsx');
const css=read('app/settings/integrations/integrations-ui.css');
test('admin/owner authorization and tenant-scoped integration reads remain',()=>{
  for(const src of [overview,wizard]){
    assert.ok(src.includes("['owner', 'admin'].includes(activeWorkspace.role)") ||
      src.includes("['owner','admin'].includes(activeWorkspace.role)"));
    assert.ok(src.includes('getWorkspaceContextForUser(supabase,'));
    assert.ok(src.includes(".eq('organization_id',"));
    assert.ok(src.includes(".eq('status', 'active')") || src.includes(".eq('status','active')"));
    assert.ok(!src.includes(".select('*')"));
    assert.ok(!src.includes('access_token_ciphertext') && !src.includes('refresh_token_ciphertext'));
  }
});
test('existing OAuth, asset selection and removal actions are reused',()=>{
  for(const text of ['<GoogleIntegrationAssets','<MetaIntegrationAssets','<WhatsAppRemoveButton','disconnectIntegrationAction']) assert.ok(dashboard.includes(text));
  for(const text of ['<GoogleIntegrationAssets','<MetaIntegrationAssets']) assert.ok(wizard.includes(text));
  assert.ok(picker.includes('<IntegrationConnectButton'));
  assert.ok(picker.includes('/settings/integrations/whatsapp'));
});
test('empty and error states never fabricate sync totals or health percentages',()=>{
  for(const text of ['No accounts connected yet','Connection status unavailable','No integration data yet','No verified health score','Records synced']) assert.ok(dashboard.includes(text));
  for(const bad of ['92%','8,420','3,420','Sync Now']) assert.ok(!dashboard.includes(bad));
  assert.ok(wizard.includes('This is not a claim that data synchronization'));
});
test('wizard guards completion behind an authorized provider connection',()=>{
  assert.ok(wizard.includes("step:Step=connected?requested:'choose'"));
  assert.ok(wizard.includes("const connected=connection?.status==='connected'"));
  assert.ok(picker.includes('setCategory'));
  assert.ok(picker.includes('aria-pressed={category===categoryOption.id}'));
  for(const text of ['Review & Complete','.aiu-empty-connected','.aiu-wizard-layout']){
    assert.ok(wizard.includes(text)||css.includes(text));
  }
  assert.ok(css.includes('@media(max-width:540px)'));
});
