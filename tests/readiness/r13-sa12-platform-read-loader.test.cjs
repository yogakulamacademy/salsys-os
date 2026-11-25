const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const {readFileSync}=require('node:fs');
const target='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',platform='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const lifecycle={state:'available',organization_id:target,status:'active',revision:0,may_suspend:false,may_restore:false,events:[]};
const quota={state:'managed_separately'};
async function run(options={}){
 const names=['SALSYS_PLATFORM_ADMIN_ENABLED','SALSYS_PLATFORM_READ_API_ENABLED','SALSYS_COMMERCIAL_PLATFORM_ORG_ID'];
 const old=Object.fromEntries(names.map(n=>[n,process.env[n]]));
 Object.assign(process.env,{[names[0]]:'true',[names[1]]:options.disabled?'false':'true',[names[2]]:platform});
 const calls=[];
 const user={id:'synthetic-user',is_anonymous:false};
 const fn=load('lib/platform-lifecycle-quota-loader.ts',{
  'server-only':{},
  '@/lib/platform-admin-access':{requirePlatformAdminAccess:async()=>{calls.push('guard');return {user,activeWorkspace:{organizationId:options.wrongWorkspace?target:platform,organizationSlug:'salsysos',role:'admin'}};}},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.wrongUser?{id:'different'}:user},error:null})},rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='platform_lifecycle_read_v1')return options.denyLifecycle?{error:{message:'private error'},data:null}:{error:null,data:options.wrongTarget?{...lifecycle,organization_id:platform}:lifecycle};
   if(options.rejectQuota)throw Error('private error');
   assert.equal(name,'platform_effective_quota_read_v1');return {error:null,data:quota};
  }})},
  '@/lib/platform-lifecycle-view':load('lib/platform-lifecycle-view.ts'),
  '@/lib/platform-effective-quota-view':load('lib/platform-effective-quota-view.ts'),
 }).loadPlatformLifecycleAndQuota;
 try{return {views:await fn(options.target??target),calls};}
 finally{for(const n of names){if(old[n]===undefined)delete process.env[n];else process.env[n]=old[n];}}
}
test('read loader is disabled by default and denies invalid or protected targets before access',async()=>{
 for(const options of [{disabled:true},{target:platform},{target:'invalid'}])assert.deepEqual(await run(options),{views:null,calls:[]});
 const wrong=await run({wrongWorkspace:true});assert.equal(wrong.views,null);assert.deepEqual(wrong.calls,['guard']);
 const actor=await run({wrongUser:true});assert.deepEqual(actor.views,{lifecycle:{state:'unavailable'},quota:{state:'unavailable'}});assert.deepEqual(actor.calls,['guard']);
});
test('independent authenticated RPCs use exact bound platform and target, fail closed separately',async()=>{
 const valid=await run();assert.equal(valid.views.lifecycle.status,'active');assert.equal(valid.views.quota.state,'managed_separately');
 assert.deepEqual(valid.calls,['guard',['platform_lifecycle_read_v1',{p_platform:platform,p_target:target}],['platform_effective_quota_read_v1',{p_platform:platform,p_target:target}]]);
 for(const options of [{denyLifecycle:true},{wrongTarget:true}]){const r=await run(options);assert.equal(r.views.lifecycle.state,'unavailable');assert.equal(r.views.quota.state,'managed_separately');}
 const failed=await run({rejectQuota:true});assert.equal(failed.views.lifecycle.status,'active');assert.equal(failed.views.quota.state,'unavailable');
});
test('loader remains server-only, has no mutation or service-role access and uses gated profile wiring',()=>{
 const source=readFileSync('lib/platform-lifecycle-quota-loader.ts','utf8');
 assert.match(source,/import 'server-only'/);
 assert.doesNotMatch(source,/createAdminClient|\.from\(|\.update\(|\.insert\(/);
 const page=readFileSync('app/platform-admin/organization/page.tsx','utf8');
 assert.match(page,/profile.internal\?null:await loadPlatformLifecycleAndQuota\(organization.id\)/);
 assert.ok(page.indexOf('await loadPlatformOrganizationProfile(')<page.indexOf('await loadPlatformLifecycleAndQuota('));
 assert.match(page,/readViews&&/);
});
