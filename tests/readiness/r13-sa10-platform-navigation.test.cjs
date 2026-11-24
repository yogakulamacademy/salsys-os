const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const {readFileSync}=require('node:fs');

test('platform navigation is feature-gated, tenant scoped and actor verified',async()=>{
  const keys=['SALSYS_PLATFORM_ADMIN_ENABLED','SALSYS_COMMERCIAL_PLATFORM_ORG_ID'];
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let operatorCalls=0, sessionCalls=0, denied=false, actorId=actor;
  let context={active_organization_id:org,role:'admin'};
  const mod=load('lib/platform-workspace-navigation.ts',{
    'server-only':{},
    '@/lib/config':{useMockData:false},
    '@/lib/commercial/plan-admin':{readPlanReviewState:async()=>{operatorCalls++;if(denied)throw Error('denied');return {actorId};}},
    '@/lib/supabase/server':{createClient:async()=>{sessionCalls++;return {rpc:async()=>({data:context,error:null})};}},
  });
  try{
    process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID=org;
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED='false';
    assert.equal(await mod.canOpenPlatformWorkspace({organizationId:org,userId:actor}),false);
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED='true';
    assert.equal(await mod.canOpenPlatformWorkspace({organizationId:'different-tenant',userId:actor}),false);
    assert.equal(operatorCalls,0);
    assert.equal(await mod.canOpenPlatformWorkspace({organizationId:org,userId:actor}),true);
    assert.equal(sessionCalls,0);
    actorId='other-actor';
    assert.equal(await mod.canOpenPlatformWorkspace({organizationId:org,userId:actor}),false);
    actorId=actor;
    denied=true;
    assert.equal(await mod.canOpenPlatformWorkspace(),false);
    denied=false;
    assert.equal(await mod.canOpenPlatformWorkspace(),true);
    context={...context,role:'employee'};
    assert.equal(await mod.canOpenPlatformWorkspace(),false);
    context={active_organization_id:'other-tenant',role:'admin'};
    assert.equal(await mod.canOpenPlatformWorkspace(),false);
  }finally{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('optional platform navigation times out instead of blocking normal login',async()=>{
  const previous=process.env.SALSYS_PLATFORM_ADMIN_ENABLED, orgBefore=process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID;
  try{
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED='true';process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID='test-platform';
    const mod=load('lib/platform-workspace-navigation.ts',{
      'server-only':{},'@/lib/config':{useMockData:false},
      '@/lib/commercial/plan-admin':{readPlanReviewState:()=>new Promise(()=>{})},
      '@/lib/supabase/server':{},
    });
    assert.equal(await mod.canOpenPlatformWorkspace({organizationId:'test-platform',userId:'actor'}),false);
  }finally{if(previous===undefined)delete process.env.SALSYS_PLATFORM_ADMIN_ENABLED;else process.env.SALSYS_PLATFORM_ADMIN_ENABLED=previous;if(orgBefore===undefined)delete process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID;else process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID=orgBefore;}
});
test('login routing preserves security onboarding and explicit deep links',()=>{
  const source=readFileSync('app/actions/auth.ts','utf8');
  const start=source.indexOf('export async function signInAction');
  const action=source.slice(start,source.indexOf('export async function requestPasswordResetAction',start));
  const lookup=action.indexOf("if (next === '/dashboard' && await canOpenPlatformWorkspace");
  assert.ok(lookup>action.indexOf('await setWorkspaceCookie(tenant.organizationId)'));
  assert.ok(lookup>action.indexOf("redirect('/onboarding/security')"));
  assert.ok(lookup>action.indexOf('await shouldEnterRequiredOnboarding'));
  assert.ok(action.indexOf('redirect(next);',lookup)>lookup);
  assert.match(readFileSync('app/home/page.tsx','utf8'),/platformWorkspaceAvailable && <Link href="\/platform-admin"/);
  const frame=readFileSync('components/platform-admin-frame.tsx','utf8');
  assert.match(frame,/form action=\{signOutAction\}/);
  assert.match(frame,/Mobile platform administration/);
  assert.match(frame,/lg:h-screen/);
});
