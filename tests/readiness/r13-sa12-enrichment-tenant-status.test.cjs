const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const access=load('lib/enrichment-tenant-access.ts',{'server-only':{}});
const deps={'server-only':{},'@/lib/enrichment-tenant-access':access,'@/lib/home-command-center':{},'@/lib/dm-links':{},'@/lib/lead-stages':{},'@/lib/lead-location':{},'@/lib/lead-source-context':{},'@/lib/lead-source-context-data':{},'@/lib/lead-interests':{}};
const location=load('lib/lead-location-data.ts',deps);
const interests=load('lib/lead-interests-data.ts',deps);
function fixture(status,{orgError=false,leadError=false,wrongOrg=false}={}){
  const calls=[];
  return {calls,admin:{from(table){
    calls.push(table);
    const q={select(){return q;},eq(k,v){calls.push(k+':'+v);return q;},async maybeSingle(){
      if(table==='organizations')return {data:status===null?null:{id:'org',status},error:orgError?{}:null};
      if(table==='leads')return {data:{id:'lead',organization_id:wrongOrg?'other':'org'},error:leadError?{}:null};
      throw Error('unexpected sensitive read');
    }};return q;
  }}};
}
test('inactive tenants are rejected before enrichment reads or mutations',async()=>{
  for(const status of ['suspended','archived',null,'unknown']){
    const a=fixture(status);
    assert.equal(await location.locateLead(a.admin,'lead',new Date()),null);
    assert.deepEqual(a.calls,['leads','id:lead','organizations','id:org']);
    const b=fixture(status);
    assert.deepEqual(await interests.collectLeadSigns(b.admin,'lead',[]),[]);
    assert.deepEqual(b.calls,['leads','id:lead','organizations','id:org']);
    for(const fn of [interests.applyLeadSigns,interests.recomputeLead]){
      const c=fixture(status);
      await fn(c.admin,'org','lead',[], '2026-11-24');
      assert.deepEqual(c.calls,['organizations','id:org']);
    }
  }
});
test('authorization read errors fail closed and mismatched lead binding is rejected',async()=>{
  const a=fixture('active',{orgError:true});
  await assert.rejects(location.locateLead(a.admin,'lead',new Date()),/authorization unavailable/);
  const b=fixture('active',{leadError:true});
  await assert.rejects(interests.collectLeadSigns(b.admin,'lead',[]),/lead unavailable/);
  const c=fixture('active',{wrongOrg:true});
  assert.equal(await access.enrichmentLeadAllowed(c.admin,'org','lead'),false);
  const d=fixture('active');
  assert.equal(await access.enrichmentLeadAllowed(d.admin,'org','lead'),true);
  assert.ok(d.calls.includes('organization_id:org'));
  const e=fixture('active');
  assert.equal(await access.enrichmentTenantActive(e.admin,null),false);
  assert.deepEqual(e.calls,[]);
});
