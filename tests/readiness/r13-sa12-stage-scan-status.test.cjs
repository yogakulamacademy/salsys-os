const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const {readFileSync}=require('node:fs');
const scanner=load('lib/lead-stages-data.ts',{'@/lib/lead-interests':{},'@/lib/lead-stages':{}});
function fixture(statuses, {leadError=false,orgError=false,missing=false}={}){
  const calls=[];let i=0;
  return {calls,admin:{from(table){
    calls.push('from:'+table);
    const q={select(){return q;},eq(key,value){calls.push(key+':'+value);return q;},
      async maybeSingle(){
        if(table==='leads')return {data:missing?null:{id:'lead',organization_id:'org',current_stage:'enrolled',metadata:{}},error:leadError?{}:null};
        if(table==='organizations')return {data:statuses[i]===null?null:{id:'org',status:statuses[i++]},error:orgError?{}:null};
        throw Error('unexpected sensitive read');
      },
      update(){calls.push('update:'+table);return q;},
      then(resolve){resolve({error:null});}
    };return q;
  }}};
}
test('inactive or missing organizations cannot reach stage scan effects even in dry run',async()=>{
  for(const mode of ['live','dry_run']){
    for(const status of ['suspended','archived',null,'unknown']){
      const {admin,calls}=fixture([status]);
      assert.equal(await scanner.scanLeadStage(admin,'lead',mode,new Date()),null);
      assert.deepEqual(calls,['from:leads','id:lead','from:organizations','id:org']);
    }
  }
});
test('stage scan fails closed on database errors and performs no work in off mode',async()=>{
  const a=fixture(['active'],{orgError:true});
  await assert.rejects(scanner.scanLeadStage(a.admin,'lead','live',new Date()),/authorization unavailable/);
  assert.ok(!a.calls.includes('update:leads'));
  const b=fixture(['active'],{leadError:true});
  await assert.rejects(scanner.scanLeadStage(b.admin,'lead','live',new Date()),/lead unavailable/);
  const c=fixture(['active']);
  assert.equal(await scanner.scanLeadStage(c.admin,'lead','off',new Date()),null);
  assert.deepEqual(c.calls,[]);
});
test('final-stage metadata write rechecks tenant status and scopes update to tenant',async()=>{
  const a=fixture(['active','suspended']);
  assert.equal(await scanner.scanLeadStage(a.admin,'lead','live',new Date()),null);
  assert.ok(!a.calls.includes('update:leads'));
  const b=fixture(['active','active']);
  assert.equal(await scanner.scanLeadStage(b.admin,'lead','live',new Date()),null);
  assert.ok(b.calls.includes('update:leads'));
  assert.ok(b.calls.includes('organization_id:org'));
});
test('stage scan retains authorization checks before AI and live effects',()=>{
  const source=readFileSync('lib/lead-stages-data.ts','utf8');
  assert.ok(source.indexOf('!await organizationActive(admin, lead.organization_id)')<source.indexOf('admin.from("messages").select("body'));
  assert.match(source,/if \(!await organizationActive\(admin, lead.organization_id\)\) return null;\s*ai = await classifyWithClaude/);
  assert.match(source,/if \(!await organizationActive\(admin, lead.organization_id\)\) return null;\s*if \(mode === "live" && decision.action === "move"\)/);
});
