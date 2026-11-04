const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEAD='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RUN='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REVIEW='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MESSAGE='message:ffffffff-ffff-4fff-8fff-ffffffffffff';

const context={
  audience:'staff_insight',
  schemaVersion:'lead_context_v1',
  generatedAt:'2026-11-04T12:00:00.000Z',
  lead:{id:LEAD, organizationId:ORG, preferredLocation:'Mysore'},
  conversation:{messages:[{ref:MESSAGE, kind:'message', body:'Contact me at private@example.com', direction:'inbound'}]},
  staffOnly:{privateNotes:'CONFIDENTIAL TEAM NOTE', activities:[], tasks:[], paymentRecords:[]},
  limitations:[],
};
const insight={
  status:'supported',
  summary:{text:'Interested',evidenceRefs:[MESSAGE]},
  intent:{level:'medium',reason:'Asked a question',evidenceRefs:[MESSAGE]},
  interests:[],objections:[],
  nextAction:{kind:'follow_up',description:'Reply with the course details',evidenceRefs:[MESSAGE]},
  uncertainty:[],
};

function setup(options={}) {
  const calls={admin:0, reads:[], inserts:[], rpc:[], auth:0};
  const env=process.env.AI_LEAD_INSIGHTS_FEEDBACK_ENABLED;
  process.env.AI_LEAD_INSIGHTS_FEEDBACK_ENABLED=options.disabled ? 'false' : 'true';
  const session={
    auth:{getUser:async()=>{calls.auth++;return{data:{user:options.unauthenticated?null:{id:'test-reviewer'}},error:null}}},
    rpc:async(name,args)=>{calls.rpc.push({name,args});assert.equal(name,'can_work_lead');return{data:options.deny!==true,error:null}},
  };
  const admin={
    from(name) {
      calls.reads.push(name);
      return {
        select() {
          const query={
            eq(){return query},
            maybeSingle:async()=>({
              data:options.hiddenRun?null:{id:RUN,lead_id:LEAD,organization_id:ORG},error:null,
            }),
          };
          return query;
        },
        insert(payload) {
          calls.inserts.push({name,payload});
          return{select(){return{single:async()=>options.duplicate
            ?{data:null,error:{code:'23505'}}
            :{data:{id:name==='ai_lead_insight_runs'?RUN:REVIEW},error:null}}}};
        },
      };
    },
  };
  const module=load('lib/ai/lead-insight-feedback.ts',{
    'server-only':{},
    'node:crypto':require('node:crypto'),
    '@/lib/supabase/server':{createClient:async()=>session},
    '@/lib/supabase/admin':{createAdminClient(){calls.admin++;return admin}},
    '@/lib/workspace':{requireCurrentOrganizationId:async()=>options.wrongOrg?OTHER:ORG},
  });
  return{
    ...module,calls,
    restore(){if(env===undefined)delete process.env.AI_LEAD_INSIGHTS_FEEDBACK_ENABLED;
      else process.env.AI_LEAD_INSIGHTS_FEEDBACK_ENABLED=env},
  };
}

test('feedback feature off performs no database work',async()=>{
  const f=setup({disabled:true});
  try{
    assert.equal(await f.recordLeadInsightRun(context,insight,'test-model'),null);
    const result=await f.submitLeadInsightFeedback({runId:RUN,rating:'accurate',issueCodes:[]});
    assert.equal(result.ok,false);
    assert.equal(f.calls.admin,0);
  } finally{f.restore()}
});

test('generation receipts include only permitted metadata and digest, never prompt or model prose',async()=>{
  const f=setup();
  try{
    const id=await f.recordLeadInsightRun(context,insight,'test-model');
    assert.equal(id,RUN);
    assert.equal(f.calls.rpc.length,1);
    const {name,payload}=f.calls.inserts[0];
    assert.equal(name,'ai_lead_insight_runs');
    assert.equal(payload.organization_id,ORG);
    assert.equal(payload.lead_id,LEAD);
    assert.equal(payload.intent_level,'medium');
    assert.equal(payload.insight_status,'supported');
    assert.deepEqual(payload.evidence_refs,[MESSAGE]);
    assert.match(payload.context_sha256,/^[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(payload),/private@example\.com|CONFIDENTIAL TEAM NOTE|Reply with the course details/);
  }finally{f.restore()}
});

test('denied or mismatched tenant cannot write generation receipt',async()=>{
  for(const options of [{deny:true},{wrongOrg:true},{unauthenticated:true}]){
    const f=setup(options);
    try{
      await assert.rejects(f.recordLeadInsightRun(context,insight,'test-model'),/access|Unauthorized|context/i);
      assert.equal(f.calls.inserts.length,0);
    }finally{f.restore()}
  }
});

test('feedback validates ratings, reason combinations and duplicate codes before privileged DB access',async()=>{
  const f=setup();
  try{
    const bad=[
      {runId:RUN,rating:'accurate',issueCodes:['wrong_intent']},
      {runId:RUN,rating:'inaccurate',issueCodes:[]},
      {runId:RUN,rating:'inaccurate',issueCodes:['wrong_intent','wrong_intent']},
      {runId:RUN,rating:'invalid',issueCodes:[]},
      {runId:'not-a-uuid',rating:'accurate',issueCodes:[]},
      {runId:RUN,rating:'inaccurate',issueCodes:['unauthorized_code']},
    ];
    for(const input of bad)assert.equal((await f.submitLeadInsightFeedback(input)).ok,false);
    assert.equal(f.calls.admin,0);
  }finally{f.restore()}
});

test('one staff review is linked only to authorized run, reviewer and active tenant',async()=>{
  const f=setup();
  try{
    const result=await f.submitLeadInsightFeedback({
      runId:RUN,rating:'inaccurate',issueCodes:['wrong_intent','missing_context']
    });
    assert.deepEqual(result,{ok:true,reviewId:REVIEW});
    assert.deepEqual(f.calls.rpc[0],{name:'can_work_lead',args:{p_lead_id:LEAD}});
    const {name,payload}=f.calls.inserts[0];
    assert.equal(name,'ai_lead_insight_reviews');
    assert.equal(payload.organization_id,ORG);
    assert.equal(payload.lead_id,LEAD);
    assert.equal(payload.run_id,RUN);
    assert.equal(payload.reviewed_by,'test-reviewer');
    assert.deepEqual(payload.issue_codes,['wrong_intent','missing_context']);
    assert.equal('comment' in payload,false);
  }finally{f.restore()}
});

test('cross-tenant run and revoked lead deny feedback without writing',async()=>{
  for(const options of [{hiddenRun:true},{deny:true},{wrongOrg:true}]){
    const f=setup(options);
    try{
      const result=await f.submitLeadInsightFeedback({runId:RUN,rating:'unsure',issueCodes:[]});
      assert.equal(result.ok,false);
      assert.equal(f.calls.inserts.length,0);
    }finally{f.restore()}
  }
});

test('duplicate reviews have a stable error without overwriting feedback',async()=>{
  const f=setup({duplicate:true});
  try{
    const result=await f.submitLeadInsightFeedback({runId:RUN,rating:'accurate',issueCodes:[]});
    assert.equal(result.ok,false);
    assert.match(result.error,/already reviewed/);
  }finally{f.restore()}
});

test('feedback schema enforces composite tenant relationships, RLS and direct-client revoke',()=>{
  const sql=readFileSync('supabase/migrations/20261104193000_ai_lead_insight_feedback_v1.sql','utf8');
  for(const needle of [
    'foreign key (organization_id, lead_id)',
    'foreign key (organization_id, lead_id, run_id)',
    'enable row level security',
    'force row level security',
    'from public, anon, authenticated',
    'unique (run_id, reviewed_by)',
    'grant select, insert on table public.ai_lead_insight_reviews to service_role',
  ]) assert.ok(sql.includes(needle),needle);
  assert.doesNotMatch(sql,/create\s+policy\b/i);
});

test('model action only attaches a feedback receipt after final context re-verification',()=>{
  const source=readFileSync('app/leads/insights-actions.ts','utf8');
  assert.match(source,/sourceSignature\(fresh\) !== sourceSignature\(context\)/);
  const receiptPos=source.indexOf('await recordLeadInsightRun(context, insight, model)');
  const checkPos=source.indexOf('sourceSignature(fresh) !== sourceSignature(context)');
  assert.ok(receiptPos>checkPos);
  assert.doesNotMatch(source,/\.from\(['"]payments['"]\).*\.update\(/);
});
