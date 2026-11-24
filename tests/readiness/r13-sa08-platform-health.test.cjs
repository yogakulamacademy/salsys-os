const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const {readFileSync}=require('node:fs');

test('platform health enforces operator scope and does not expose scheduler credentials',async()=>{
  const keys=['SALSYS_PLATFORM_ADMIN_ENABLED','CRON_SECRET','SALSYS_SIGNUP_ADMISSION_MODE','SALSYS_PUBLIC_SIGNUP_ENABLED'];
  const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let denied=false,calls=0,error=null,data={total_systems:'8',healthy_systems:2,warning_systems:5,critical_systems:1,checked_at:'2026-11-24T16:00:00Z'};
  const mod=load('lib/platform-health.ts',{
    'server-only':{},
    '@/lib/platform-admin-access':{requirePlatformAdminAccess:async()=>{
      if(denied) throw Error('denied');
      return {activeWorkspace:{organizationId:org}};
    }},
    '@/lib/supabase/admin':{createAdminClient:()=>{
      calls++;
      return {from(table){
        assert.equal(table,'v_system_health_summary');
        const query={
          select(fields){assert.equal(fields,'total_systems,healthy_systems,warning_systems,critical_systems,checked_at');return query;},
          eq(key,value){assert.equal(key,'organization_id');assert.equal(value,org);return query;},
          async maybeSingle(){return {data,error};},
        };
        return query;
      }};
    }},
  });
  try{
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED='false';
    await assert.rejects(mod.loadPlatformHealth(),/unavailable/);
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED='true';
    denied=true;
    await assert.rejects(mod.loadPlatformHealth(),/denied/);
    assert.equal(calls,0);
    denied=false;
    process.env.CRON_SECRET='synthetic-test-secret';
    process.env.SALSYS_SIGNUP_ADMISSION_MODE='closed';
    process.env.SALSYS_PUBLIC_SIGNUP_ENABLED='false';
    const result=await mod.loadPlatformHealth();
    assert.deepEqual(result.health,{total:8,healthy:2,warning:5,critical:1,checkedAt:'2026-11-24T16:00:00.000Z'});
    assert.equal(result.flags.cronSecretConfigured,true);
    assert.equal(result.flags.publicSignupSwitch,false);
    assert.equal(result.flags.admissionMode,'closed');
    assert.ok(!JSON.stringify(result).includes('synthetic-test-secret'));
    data={...data,total_systems:9};
    assert.equal((await mod.loadPlatformHealth()).health,null);
    data={...data,total_systems:8,checked_at:'invalid'};
    assert.equal((await mod.loadPlatformHealth()).health,null);
    data=null;
    assert.equal((await mod.loadPlatformHealth()).health,null);
    error={message:'failed'};
    assert.equal((await mod.loadPlatformHealth()).health,null);
  }finally{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('operations page is guarded before reading health and has no mutation or global health claim',()=>{
  const page=readFileSync('app/platform-admin/health/page.tsx','utf8');
  assert.ok(page.indexOf('await readPlanReviewState()')<page.indexOf('await loadPlatformHealth()'));
  assert.match(page,/internal tenant only/);
  assert.match(page,/Credential values are never rendered/);
  assert.doesNotMatch(page,/createAdminClient|\.rpc\(|\.from\(|<form/);
});
