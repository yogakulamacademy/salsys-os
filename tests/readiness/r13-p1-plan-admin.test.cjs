const { test }=require('node:test');
const assert=require('node:assert/strict');
const { readFileSync }=require('node:fs');
const { load }=require('./helpers.cjs');
const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', USER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('commercial admin verifies platform identity before privileged access and derives actor server-side',async()=>{
  const before={SALSYS_PLAN_ADMIN_ENABLED:process.env.SALSYS_PLAN_ADMIN_ENABLED,SALSYS_COMMERCIAL_PLATFORM_ORG_ID:process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID,SALSYS_PLAN_PUBLICATION_ENABLED:process.env.SALSYS_PLAN_PUBLICATION_ENABLED};
  try{
    process.env.SALSYS_PLAN_ADMIN_ENABLED='true';
    process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID=ORG;
    let context={organization_id:ORG,organization_slug:'salsysos',role:'owner'};
    let identity={id:USER,email_confirmed_at:'2026-11-24T00:00:00Z',is_anonymous:false};
    let active=true, memberRole='owner',calls=[];
    const session={auth:{getUser:async()=>({data:{user:identity},error:null})},rpc:async()=>({data:context,error:null}),
      from(table){const q={select(){return q},eq(){return q},async maybeSingle(){return {error:null,data:table==='profiles'?{active}:table==='organization_members'?{role:memberRole,active:true}:{id:ORG,slug:'salsysos',status:'active'}}}};return q;}};
    const mod=load('lib/commercial/plan-admin.ts',{'server-only':{},'@/lib/config':{useMockData:false},'@/lib/supabase/server':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='commercial_publish_initial_plan_v1'?ORG:{may_author:true,may_review:false,may_publish:false,authorized_request_ids:[],published_request_ids:[],requests:[],versions:{}},error:null}}})}});
    assert.equal((await mod.readPlanReviewState()).actorId,USER);
    assert.deepEqual(calls,[{name:'commercial_read_plan_requests_v1',args:{p_actor:USER}}]);
    for(const patch of [{organization_id:USER},{organization_slug:'tenant'},{role:'employee'}]){
      const original=context;context={...context,...patch};
      await assert.rejects(mod.readPlanReviewState(),/Access denied/);
      context=original;
    }
    active=false;await assert.rejects(mod.readPlanReviewState(),/Access denied/);active=true;
    memberRole='admin';await assert.rejects(mod.readPlanReviewState(),/Access denied/);memberRole='owner';
    identity={...identity,is_anonymous:true};await assert.rejects(mod.readPlanReviewState(),/Access denied/);identity={...identity,is_anonymous:false};
    process.env.SALSYS_PLAN_PUBLICATION_ENABLED='false';
    await assert.rejects(mod.publishInitialPlan(ORG,3,'a'.repeat(64)),/Publication unavailable/);
    assert.equal(calls.length,1);
    process.env.SALSYS_PLAN_PUBLICATION_ENABLED='true';
    await assert.rejects(mod.publishInitialPlan(ORG,2,'a'.repeat(64)),/Invalid proposal reference/);
    assert.equal(await mod.publishInitialPlan(ORG,3,'a'.repeat(64)),ORG);
    assert.deepEqual(calls[1],{name:'commercial_publish_initial_plan_v1',args:{p_actor:USER,p_request:ORG,p_revision:3,p_digest:'a'.repeat(64)}});
    process.env.SALSYS_PLAN_ADMIN_ENABLED='false';
    await assert.rejects(mod.readPlanReviewState(),/unavailable/);
    assert.equal(calls.length,2);
  }finally{for(const [key,v] of Object.entries(before)){if(v===undefined)delete process.env[key];else process.env[key]=v;}}
});
test('initial publication requires a separate gate and exact approval without changing subscriptions',()=>{
  const sql=readFileSync('supabase/drafts/r13_governed_plan_admin.sql','utf8');
  const page=readFileSync('app/settings/commercial-plans/page.tsx','utf8');
  const actions=readFileSync('app/settings/commercial-plans/actions.ts','utf8');
  assert.ok(page.includes('await readPlanReviewState()'));
  assert.ok(page.includes('index:false'));
  assert.ok(page.includes('Approve for design only'));
  assert.ok(!actions.includes('p_actor'));
  assert.ok(sql.includes('security invoker'));
  assert.ok(sql.includes('from public,anon,authenticated,service_role;'));
  assert.ok(page.includes('state.publicationEnabled&&state.may_publish&&state.authorized_request_ids.includes(r.id)'));
  assert.ok(actions.includes("!=='PUBLISH INITIAL PLAN'"));
  assert.ok(sql.includes('v_req.author_user_id=p_actor or v_req.reviewer_user_id=p_actor'));
  assert.ok(sql.includes('v_auth.expires_at<=clock_timestamp()'));
  assert.ok(sql.includes('Existing plan version changes require customer contract migration'));
  assert.ok(sql.includes('published_plan_immutable'));
  assert.doesNotMatch(sql,/update public\.saas_plans|insert into public\.saas_organization_subscriptions|update public\.saas_organization_subscriptions|insert into public\.saas_plan_entitlements/i);
});

test('plan change requests are session-bound non-binding requests, not activation or billing',()=>{
  const sql=readFileSync('supabase/drafts/r13_subscription_change_requests.sql','utf8');
  const page=readFileSync('app/settings/subscription/changes/page.tsx','utf8');
  const actions=readFileSync('app/settings/subscription/changes/actions.ts','utf8');
  assert.ok(sql.includes("m.role='owner'"));
  assert.ok(sql.includes('v_sub.updated_at is distinct from p_expected_subscription_updated_at'));
  assert.ok(sql.includes('p.snapshot_sha256=p_target_digest'));
  assert.ok(sql.includes('subscription_one_pending_change_v1'));
  assert.ok(sql.includes('where id=p_request and organization_id=v_org'));
  assert.doesNotMatch(sql,/update public\.saas_organization_subscriptions|insert into public\.saas_organization_subscriptions|delete from public\./i);
  assert.ok(page.includes("workspace.role!=='owner'"));
  assert.ok(page.includes('non-binding request'));
  assert.ok(actions.includes("!=='request_only'"));
});
