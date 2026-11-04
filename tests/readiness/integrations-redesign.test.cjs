const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const overview=read('app/settings/integrations/page.tsx');
const dashboard=read('app/settings/integrations/integrations-dashboard.tsx');
const wizard=read('app/settings/integrations/connect/page.tsx');
const picker=read('app/settings/integrations/connect/integration-connection-picker.tsx');
const css=read('app/settings/integrations/integrations-ui.css');
test('admin/owner authorization and tenant-scoped integration reads remain',()=>{
  for(const src of [overview,wizard]){
    assert.match(src,/!\\['owner', 'admin'\\]\\.includes\\(activeWorkspace\\.role\\)|!\\['owner','admin'\\]\\.includes\\(activeWorkspace\\.role\\)/);
    assert.match(src,/getWorkspaceContextForUser\\(supabase,\\s*user\\.id\\)/);
    assert.match(src,/\\.eq\\('organization_id',\\s*(organizationId|orgId)\\)/);
    assert.match(src,/\\.eq\\('status',\\s*'active'\\)/);
    assert.doesNotMatch(src,/select\\('\\*'\\)/);
  }
  assert.doesNotMatch(overview,/access_token_ciphertext|refresh_token_ciphertext|client_secret/);
  assert.doesNotMatch(wizard,/access_token_ciphertext|refresh_token_ciphertext|client_secret/);
});
test('existing OAuth, asset selection and removal actions are reused',()=>{
  assert.match(picker,/<IntegrationConnectButton/);
  assert.match(picker,/\\/settings\\/integrations\\/whatsapp/);
  assert.match(dashboard,/<GoogleIntegrationAssets/);
  assert.match(dashboard,/<MetaIntegrationAssets/);
  assert.match(dashboard,/<WhatsAppRemoveButton/);
  assert.match(dashboard,/action=\\{disconnectIntegrationAction\\}/);
  assert.match(wizard,/<GoogleIntegrationAssets/);
  assert.match(wizard,/<MetaIntegrationAssets/);
});
test('populated, empty and error states do not fabricate synced counts or health',()=>{
  assert.match(dashboard,/No accounts connected yet/);
  assert.match(dashboard,/Connection status unavailable/);
  assert.match(dashboard,/No integration data yet/);
  assert.match(dashboard,/No verified health score/);
  assert.match(dashboard,/Records synced/);
  assert.match(dashboard,/No verified|not available|not verified/i);
  assert.doesNotMatch(dashboard,/92%|8,420|3,420|Sync Now/);
  assert.match(wizard,/This is not a claim that data synchronization/);
});
test('wizard steps represent real authorized connection, not simulated successes',()=>{
  assert.match(wizard,/step:Step=connected\\?requested:'choose'/);
  assert.match(wizard,/const connected=connection\\?\\.status==='connected'/);
  assert.match(picker,/setCategory/);
  assert.match(picker,/aria-pressed=\\{category===categoryOption\\.id\\}/);
  assert.match(wizard,/Review & Complete/);
  assert.match(css,/\\.aiu-empty-connected/);
  assert.match(css,/\\.aiu-wizard-layout/);
  assert.match(css,/@media\\(max-width:540px\\)/);
});
