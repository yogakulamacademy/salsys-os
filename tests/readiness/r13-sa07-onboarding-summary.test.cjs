const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers.cjs');

test('onboarding summary is operator guarded, scoped, exact and fails closed', async ()=>{
  const previous = process.env.SALSYS_PLATFORM_ADMIN_ENABLED;
  const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let denied=false, adminCalls=0, failure=false, inconsistent=false;
  const queries=[];
  const mod=load('lib/platform-onboarding-summary.ts',{
    'server-only':{},
    '@/lib/platform-admin-access':{requirePlatformAdminAccess:async()=>{
      if(denied) throw Error('denied');
      return {activeWorkspace:{organizationId:org}};
    }},
    '@/lib/supabase/admin':{createAdminClient:()=>{
      adminCalls++;
      return {from(table){
        assert.ok(['organizations','organization_onboarding'].includes(table));
        const filters=[];
        const q={
          select(columns,opts){assert.equal(columns,table==='organizations'?'id':'organization_id');assert.deepEqual(opts,{count:'exact',head:true});return q;},
          neq(key,value){filters.push(['neq',key,value]);return q;},
          eq(key,value){filters.push(['eq',key,value]);return q;},
          then(resolve){
            queries.push({table,filters});
            const field=table==='organizations'?'id':'organization_id';
            assert.ok(filters.some(f=>f[0]==='neq'&&f[1]===field&&f[2]===org));
            const status=filters.find(f=>f[0]==='eq'&&f[1]==='status')?.[2];
            const enforced=filters.some(f=>f[0]==='eq'&&f[1]==='enforce_on_sign_in'&&f[2]===true);
            if(enforced)assert.ok(filters.some(f=>f[0]==='neq'&&f[1]==='status'&&f[2]==='completed'));
            const byStatus={not_started:0,in_progress:1,completed:1,dismissed:0};
            const count=table==='organizations'?3:enforced?1:status?byStatus[status]:inconsistent?3:2;
            resolve({count:failure?null:count,error:failure?{message:'failed'}:null});
          },
        };
        return q;
      }};
    }},
  });
  try{
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED='false';
    await assert.rejects(mod.loadPlatformOnboardingSummary(),/unavailable/);
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED='true';
    denied=true;
    await assert.rejects(mod.loadPlatformOnboardingSummary(),/denied/);
    assert.equal(adminCalls,0);
    denied=false;
    assert.deepEqual(await mod.loadPlatformOnboardingSummary(),{registered:3,recorded:{not_started:0,in_progress:1,completed:1,dismissed:0},missingRecords:1,enforcedIncomplete:1});
    assert.equal(queries.length,7);
    failure=true;
    await assert.rejects(mod.loadPlatformOnboardingSummary(),/unavailable/);
    failure=false;
    inconsistent=true;
    await assert.rejects(mod.loadPlatformOnboardingSummary(),/inconsistent/);
  }finally{if(previous===undefined)delete process.env.SALSYS_PLATFORM_ADMIN_ENABLED;else process.env.SALSYS_PLATFORM_ADMIN_ENABLED=previous;}
});
