const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const {readFileSync}=require('node:fs');
const {parseLifecyclePreview:parse,lifecycleConfirmationReady:ready}=load('lib/platform-lifecycle-view.ts');
const target='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',platform='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const event={revision:1,action:'suspend',previous_status:'active',new_status:'suspended',reason:'Synthetic test reason',occurred_at:'2026-11-25T00:00:00Z'};
const row={state:'available',organization_id:target,status:'suspended',revision:1,may_suspend:false,may_restore:true,events:[event]};
test('lifecycle presentation requires exact target, coherent history and action-specific permission',()=>{
  const v=parse({...row,private_metadata:'not exposed'},target,platform);
  assert.equal(v.action,'restore');assert.equal(v.events.length,1);assert.equal(v.events[0].reason,event.reason);
  assert.equal(Object.hasOwn(v,'private_metadata'),false);
  assert.equal(parse({...row,may_restore:false},target,platform).action,null);
  assert.equal(parse({...row,status:'active',revision:0,events:[],may_suspend:true},target,platform).action,'suspend');
  assert.equal(parse({...row,status:'archived',revision:0,events:[]},target,platform).action,null);
  for(const bad of [null,{}, {...row,organization_id:platform}, {...row,may_restore:'true'}, {...row,revision:2}, {...row,status:'active'}, {...row,events:[{...event,new_status:'active'}]}, {...row,events:[{...event,occurred_at:'invalid'}]}]){
    assert.deepEqual(parse(bad,target,platform),{state:'unavailable'});
  }
  assert.deepEqual(parse({...row,organization_id:platform},platform,platform),{state:'unavailable'});
  assert.deepEqual(parse({...row,revision:2,events:[{...event,revision:2},event]},target,platform),{state:'unavailable'});
});
test('confirmation rehearsal requires valid reason and exact action word',()=>{
  assert.equal(ready('suspend','Synthetic test reason','SUSPEND'),true);
  assert.equal(ready('restore','Synthetic test reason','RESTORE'),true);
  for(const [action,reason,word] of [['restore','short','RESTORE'],['suspend',' '.repeat(15),'SUSPEND'],['restore','a'.repeat(513),'RESTORE'],['suspend','Synthetic test reason','RESTORE'],['archive','Synthetic test reason','ARCHIVE']])assert.equal(ready(action,reason,word),false);
});
test('lifecycle panel has no write endpoint and renders only gated views',()=>{
  const panel=readFileSync('components/platform-lifecycle-panel.tsx','utf8');
  assert.doesNotMatch(panel,/fetch\(|\.rpc\(|createAdminClient|<form|onSubmit/);
  assert.match(panel,/<button type="button" disabled/);
  const page=readFileSync('app/platform-admin/organization/page.tsx','utf8');
  assert.match(page,/readViews&&/);
  assert.match(page,/<PlatformLifecyclePanel key={organization.id/);
  assert.match(page,/readViews.lifecycle.revision/);
  assert.doesNotMatch(page,/parseLifecyclePreview/);
});
