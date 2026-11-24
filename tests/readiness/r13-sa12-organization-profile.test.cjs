const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const {readFileSync}=require('node:fs');

test('organization profile validates identifiers and denies before privileged reads',async()=>{
  const before=process.env.SALSYS_PLATFORM_ADMIN_ENABLED;
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let denied=false,calls=0,guard=0,missing=false,failed=false;
  const queries=[];
  const mod=load('lib/platform-organization-profile.ts',{
    'server-only':{},
    '@/lib/platform-admin-access':{requirePlatformAdminAccess:async()=>{guard++;if(denied)throw Error('denied');return {activeWorkspace:{organizationId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}};}},
    '@/lib/supabase/admin':{createAdminClient:()=>{calls++;return {from(table){
      const filters=[];
      const q={
        select(fields,options){assert.doesNotMatch(fields,/metadata|token|email|provider_customer_ref|external_event_ref|actor_user_id/);queries.push({table,fields,options,filters});return q;},
        eq(field,value){filters.push([field,value]);return q;},
        order(){return q;},limit(){return q;},in(){return q;},
        async maybeSingle(){return table==='organizations'?{data:missing?null:{id,name:'Synthetic organization'},error:null}:table==='saas_organization_subscriptions'?{data:null,error:failed?{message:'error'}:null}:{data:null,error:null};},
        then(resolve){resolve(table==='organization_members'?{count:2,error:null}:table==='leads'?{count:37,error:null}:table==='organization_workspaces'?{data:[{workspace_code:'sales'}],count:1,error:null}:table==='integration_connections'?{data:[{provider:'instagram',status:'connected'}],count:1,error:null}:{data:[],error:null});}
      };return q;
    }}}},
  });
  try{
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED='false';
    await assert.rejects(mod.loadPlatformOrganizationProfile(id),/unavailable/);
    assert.equal(guard,0);
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED='true';
    denied=true;
    await assert.rejects(mod.loadPlatformOrganizationProfile(id),/denied/);
    denied=false;
    assert.equal(await mod.loadPlatformOrganizationProfile('bad-id'),null);
    assert.equal(calls,0);
    missing=true;
    assert.equal(await mod.loadPlatformOrganizationProfile(id),null);
    assert.equal(queries.length,1);
    missing=false;queries.length=0;
    const result=await mod.loadPlatformOrganizationProfile(id);
    assert.equal(result.internal,false);
    assert.equal(result.activeMemberships,2);
    assert.equal(result.leadRecords,37);
    assert.deepEqual(result.integrationInventory.find(row=>row.provider==='instagram').states,['connected']);
    assert.deepEqual(result.integrationInventory.find(row=>row.provider==='whatsapp').states,[]);
    assert.deepEqual(mod.catalogLimits({named_users:5,lead_records:10000,unrelated:'not rendered'}),{namedUsers:5,leadRecords:10000});
    for(const invalid of [null,{},[],{named_users:'5',lead_records:100},{named_users:0,lead_records:100},{named_users:5,lead_records:-1}])assert.equal(mod.catalogLimits(invalid),null);
    assert.deepEqual(result.configuredWorkspaces,['sales']);
    assert.equal(result.subscription.available,true);
    assert.equal(result.subscription.record,null);
    assert.deepEqual(result.events,[]);
    assert.ok(queries.every(query=>query.filters.some(([key,value])=>key===(query.table==='organizations'?'id':'organization_id')&&value===id)));
    failed=true;
    assert.equal((await mod.loadPlatformOrganizationProfile(id)).subscription.available,false);
    assert.equal(mod.validOrganizationId(['id']),false);
  }finally{if(before===undefined)delete process.env.SALSYS_PLATFORM_ADMIN_ENABLED;else process.env.SALSYS_PLATFORM_ADMIN_ENABLED=before;}
});
test('profile route remains feature gated, read-only and explicit about record limitations',()=>{
  const page=readFileSync('app/platform-admin/organization/page.tsx','utf8');
  assert.ok(page.indexOf("SALSYS_PLATFORM_ADMIN_ENABLED!=='true'")<page.indexOf('await loadPlatformOrganizationProfile'));
  assert.match(page,/does not establish a Free plan/);
  assert.match(page,/not a historical contract version/);
  assert.doesNotMatch(page,/createAdminClient|\.rpc\(|\.from\(|<form/);
  const loader=readFileSync('lib/platform-organization-profile.ts','utf8');
  assert.ok(loader.indexOf('await requirePlatformAdminAccess()')<loader.indexOf('const admin = createAdminClient()'));
  assert.match(loader,/\.limit\(20\)/);
  assert.doesNotMatch(loader,/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test('organization inventory uses only aggregate lead reads and bounded connection status',()=>{
  const loader=readFileSync('lib/platform-organization-profile.ts','utf8');
  assert.match(loader,/from\('leads'\)\.select\('id',\{count:'exact',head:true\}\)\.eq\('organization_id',id\)/);
  assert.match(loader,/from\('integration_connections'\)\.select\('provider,status',\{count:'exact'\}\)\.eq\('organization_id',id\)/);
  assert.match(loader,/integrations.count===integrations.data.length/);
  assert.doesNotMatch(loader,/signup_usage_counters|resolve_signup_plan_internal_v1/);
  const page=readFileSync('app/platform-admin/organization/page.tsx','utf8');
  assert.match(page,/not verified quota counters, effective contract allowances/);
  assert.match(page,/Stored connection statuses only/);
});
