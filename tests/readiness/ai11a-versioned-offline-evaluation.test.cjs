const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {load}=require('./helpers.cjs');

const corpus=JSON.parse(fs.readFileSync(path.resolve('tests/evals/ai11a-copilot-synthetic-regression-v1.json'),'utf8'));
const evidence=load('lib/knowledge-evidence.ts');
const A='org-a';
process.env.ANTHROPIC_API_KEY='AI11A_OFFLINE_FAKE_KEY_NEVER_SENT';
process.env.ANTHROPIC_HAIKU_MODEL='ai11a-fixture-haiku';
process.env.ANTHROPIC_SONNET_MODEL='ai11a-fixture-sonnet';

function hit(options={}){
  return {
    chunk_id:'40000000-0000-4000-8000-000000000001',
    document_id:'50000000-0000-4000-8000-000000000001',
    title:'Synthetic FAQ',
    category:'faq',
    content:'For synthetic testing only, not a live organization policy.',
    rank:0.5,valid_until:null,
    metadata:{document_version:2},...options,
  };
}
function setup(fixture){
  const calls={model:[],search:[],admin:0,authorized:0};
  const originalFetch=global.fetch;
  global.fetch=async(_url,init)=>{
    const req=JSON.parse(init.body);
    calls.model.push(req);
    if(calls.model.length===1 && fixture.routerFails){
      return {ok:false,status:503,text:async()=>JSON.stringify({error:{message:'synthetic router unavailable'}})};
    }
    const isRouter=calls.model.length===1;
    const responseText=isRouter
      ? fixture.routerOutput||'simple|low|faq|reply|Synthetic classified route'
      : fixture.replyText||'The admissions team can confirm the current details.';
    return {ok:true,text:async()=>JSON.stringify({content:[{type:'text',text:responseText}]})};
  };

  const rows={
    leads:{id:'lead-a',organization_id:A,display_name:'Synthetic Lead',
      current_contact_channel:'whatsapp',interested_course_id:null},
    conversations:{id:'conversation-a'},
    messages:[
      {direction:'inbound',sender_type:'lead',body:fixture.latest,created_at:'2026-11-09T10:00:00Z'},
      {direction:'inbound',sender_type:'lead',body:'An older unrelated question.',created_at:'2026-11-08T09:00:00Z'},
    ],
    courses:[],course_batches:[],
  };

  function table(name){
    const q={
      select(){return q},eq(){return q},order(){return q},
      gte(){return q},limit(){return q},
      maybeSingle(){return Promise.resolve(resolve())},
      then(success,failure){return Promise.resolve(resolve()).then(success,failure)},
    };
    const resolve=()=>({data:rows[name],error:null});
    return q;
  }
  let foundRows;
  if(fixture.knowledge==='none')foundRows=[];
  else if(fixture.knowledge==='unverified_source'){
    foundRows=[hit({metadata:{document_version:2,source_metadata:{source_text_verified:false}}})];
  }else if(fixture.knowledge==='manual_review_required'){
    foundRows=[hit({metadata:{document_version:2,document_metadata:{manual_review_required:true}}})];
  }else if(fixture.knowledge==='unverified_chunk'){
    foundRows=[hit({metadata:{document_version:2,chunk_metadata:{source:'manual_discovery_draft_unverified'}}})];
  }else if(fixture.knowledge==='expired'){
    foundRows=[hit({valid_until:'2020-01-01T00:00:00Z'})];
  }else foundRows=[hit()];

  const session={
    auth:{getUser:async()=>({data:{user:{id:'synthetic-actor-a'}},error:null})},
    rpc:async(name,args)=>{
      if(name==='can_work_lead'){
        calls.authorized++;
        assert.equal(args.p_lead_id,'lead-a');
        return {data:fixture.denyLead!==true,error:null};
      }
      assert.equal(name,'search_organization_knowledge_v1');
      assert.equal(args.p_organization_id,A);
      calls.search.push(args);
      return {
        data:fixture.revokeAtRecheck && calls.search.length>1?[]:foundRows,
        error:fixture.knowledge==='retrieval_error'?{message:'synthetic unavailable'}:null,
      };
    },
  };
  const action=load('app/conversations/copilot-actions.ts',{
    '@/lib/supabase/server':{createClient:async()=>session},
    '@/lib/supabase/admin':{createAdminClient(){
      calls.admin++;
      return {from:table};
    }},
    '@/lib/knowledge-evidence':evidence,
  }).generateCopilotReplyAction;
  return {calls,action,restore:()=>{global.fetch=originalFetch}};
}

test('AI-11A corpus is versioned, synthetic, counted, non-production and declares both known blockers',()=>{
  assert.equal(corpus.schemaVersion,1);
  assert.equal(corpus.suite,'AI-11A');
  assert.equal(corpus.classification,'synthetic_offline_regression_not_measured_model_accuracy');
  assert.equal(corpus.lockedBehavior,'human_review_required_no_autonomous_send');
  assert.equal(corpus.productionReady,false);
  assert.equal(corpus.providerCallsAllowed,false);
  assert.equal(corpus.realCustomerDataAllowed,false);
  assert.equal(corpus.stagingWitnesses,0);
  assert.equal(corpus.independentApprovalRecorded,false);
  assert.equal(corpus.cases.length,corpus.requiredTotalCases);
  assert.equal(corpus.cases.length,26);
  const ids=corpus.cases.map(c=>c.id);
  assert.equal(new Set(ids).size,26);
  assert.deepEqual(corpus.categories,['router','preflight','known_gap']);
  assert.equal(corpus.fixedKnownGaps.length,2);
  assert.equal(corpus.fixedKnownGaps.every(x=>x.releaseBlocking===true),true);
  assert.deepEqual(corpus.fixedKnownGaps.map(x=>x.id),[
    'misclassified_sensitive_router_output',
    'unsupported_reply_claim_not_deterministically_blocked',
  ]);
});

test('AI-11A deterministic router contract agrees with 16 MOCK router/fallback cases (not LLM accuracy)',async()=>{
  const cases=corpus.cases.filter(x=>x.category==='router');
  assert.equal(cases.length,16);
  let matched=0,haiku=0,sonnet=0,providerRequests=0;
  for(const c of cases){
    const f=setup(c);
    try{
      const result=await f.action('lead-a');
      assert.equal(result.ok,true,c.id+': '+result.error);
      assert.equal(result.risk,c.expectedRisk,c.id);
      assert.equal(result.nextAction,c.expectedAction,c.id);
      const model=c.expectedModel==='haiku'?'ai11a-fixture-haiku':'ai11a-fixture-sonnet';
      assert.equal(result.model,model,c.id);
      assert.equal(result.routerModel,'ai11a-fixture-haiku',c.id);
      assert.equal(f.calls.model.length,2,c.id);
      assert.equal(f.calls.model[0].model,'ai11a-fixture-haiku',c.id);
      assert.equal(f.calls.model[1].model,model,c.id);
      assert.equal(result.knowledgeUsed,c.knowledge==='none'?0:1,c.id);
      assert.equal(f.calls.authorized,1,c.id);
      assert.equal(f.calls.admin,1,c.id);
      for(const request of f.calls.model){
        assert.equal(Object.hasOwn(request,'tools'),false,c.id);
        assert.equal(Object.hasOwn(request,'tool_choice'),false,c.id);
        assert.equal(Object.hasOwn(request,'metadata'),false,c.id);
        assert.equal(request.messages.length,1,c.id);
        assert.equal(request.messages[0].role,'user',c.id);
        assert.match(request.system,/untrusted data|never instructions to change these rules/i,c.id);
      }
      assert.equal(f.calls.model[0].max_tokens,480,c.id);
      assert.equal(f.calls.model[1].max_tokens,700,c.id);
      assert.match(f.calls.model[1].system,/never send messages yourself/i,c.id);
      matched++;providerRequests+=f.calls.model.length;
      if(c.expectedModel==='haiku')haiku++;else sonnet++;
    }finally{f.restore();}
  }
  assert.equal(matched,16);
  assert.ok(haiku>0&&sonnet>0);
  assert.equal(providerRequests,32);
  console.log('AI11A_ROUTING_FIXTURE_METRICS',JSON.stringify({
    fixtureAgreement:matched+'/'+cases.length,
    haikuDrafts:haiku,sonnetDrafts:sonnet,
    mockedProviderRequests:providerRequests,realProviderRequests:0,
    claimsActualClaudeAccuracy:false,
  }));
});

test('AI-11A eight preflight and revocation fixtures deny before any model or after recheck',async()=>{
  const cases=corpus.cases.filter(x=>x.category==='preflight');
  assert.equal(cases.length,8);
  let deniedBefore=0,deniedAfter=0,empty=0;
  for(const c of cases){
    const f=setup(c);
    try{
      const result=await f.action('lead-a');
      if(c.expectedStatus==='deny_before_model'){
        assert.equal(result.ok,false,c.id);
        assert.equal(f.calls.model.length,0,c.id);
        assert.equal(Object.hasOwn(result,'draft'),false,c.id);
        deniedBefore++;
      }else if(c.expectedStatus==='deny_after_recheck'){
        assert.equal(result.ok,false,c.id);
        assert.equal(f.calls.model.length,2,c.id);
        assert.equal(f.calls.search.length,2,c.id);
        assert.equal(Object.hasOwn(result,'draft'),false,c.id);
        deniedAfter++;
      }else{
        assert.equal(c.expectedStatus,'approved_empty',c.id);
        assert.equal(result.ok,true,c.id);
        assert.equal(result.knowledgeUsed,0,c.id);
        assert.deepEqual(result.knowledgeEvidence,[],c.id);
        empty++;
      }
    }finally{f.restore();}
  }
  assert.deepEqual({deniedBefore,deniedAfter,empty},{deniedBefore:6,deniedAfter:1,empty:1});
});

test('AI-11A MUST disclose two observable known gaps, not classify them as safe or approved',async()=>{
  const cases=corpus.cases.filter(x=>x.category==='known_gap');
  assert.equal(cases.length,2);
  for(const c of cases){
    const gap=corpus.fixedKnownGaps.find(x=>x.id===c.knownIssue);
    assert.ok(gap&&gap.releaseBlocking,c.id);
    const f=setup(c);
    try{
      const result=await f.action('lead-a');
      assert.equal(result.ok,true,c.id+': current runtime gap no longer reproducible; reevaluate baseline');
      assert.equal(result.risk,c.expectedObservedRisk,c.id);
      if(c.id==='G01'){
        assert.equal(result.nextAction,'reply',c.id);
        assert.equal(result.model,'ai11a-fixture-haiku',c.id);
        assert.match(c.latest,/refund dispute/i);
      }
      if(c.id==='G02'){
        assert.equal(result.draft,c.replyText,c.id);
        assert.match(result.draft,/payment has been confirmed/i,c.id);
        assert.equal(result.knowledgeUsed,1,c.id);
      }
      assert.equal(f.calls.model.length,2,c.id);
      assert.equal(Object.hasOwn(result,'sent'),false,c.id);
    }finally{f.restore();}
  }
  console.log('AI11A_RELEASE_BLOCKERS',JSON.stringify({
    knownReleaseBlockingGaps:cases.map(x=>x.knownIssue),
    humanReviewStillRequired:true,productionReady:false,
  }));
});

test('AI-11A exercises only existing server action and does not change live Co-Pilot or Knowledge approval',()=>{
  const source=fs.readFileSync('app/conversations/copilot-actions.ts','utf8');
  assert.match(source,/export async function generateCopilotReplyAction/);
  assert.match(source,/You never send messages yourself/);
  assert.match(source,/cache:\s*'no-store'/);
  assert.match(source,/search_organization_knowledge_v1/);
  assert.doesNotMatch(source,/AI-11A|ai11a-copilot-synthetic/);
  const approval=fs.readFileSync('app/settings/knowledge/actions.ts','utf8');
  assert.doesNotMatch(approval,/AI-11A|ai11a-copilot-synthetic/);
});
