const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {load}=require('./helpers.cjs');

const gate=load('lib/ai/read-only-tool-gate-v1.ts',{
  'server-only':{},'node:crypto':crypto,
});
const resultProjection=load('lib/ai/read-only-tool-result-projection-v1.ts',{
  'server-only':{},
});
const realProjection=load('lib/ai/real-schema-read-projection-draft-v1.ts',{
  'server-only':{},
  './read-only-tool-result-projection-v1':resultProjection,
});
const api=load('lib/ai/audit-commit-read-preview-v1.ts',{
  'server-only':{},'node:crypto':crypto,
  './read-only-tool-gate-v1':gate,
  './real-schema-read-projection-draft-v1':realProjection,
});
const ORG='10000000-0000-4000-8000-000000000001';
const OTHER_ORG='10000000-0000-4000-8000-000000000002';
const LEAD='20000000-0000-4000-8000-000000000001';
const OTHER_LEAD='20000000-0000-4000-8000-000000000002';
const COURSE='30000000-0000-4000-8000-000000000001';
const BATCH='40000000-0000-4000-8000-000000000001';
const TX='50000000-0000-4000-8000-000000000001';
const AUDIT='60000000-0000-4000-8000-000000000001';

const proposal=(patch={})=>({
  toolId:'crm.course.list',organizationId:ORG,leadId:null,query:null,...patch,
});
const course=(changes={},batchChanges={})=>({
  course:{id:COURSE,organization_id:ORG,name:'Synthetic 200-Hour Training',active:true,...changes},
  batch:{id:BATCH,organization_id:ORG,course_id:COURSE,
    mode:'residential',start_date:'2026-12-07',active:true,...batchChanges},
});
const lead=(changes={})=>({id:LEAD,organization_id:ORG,current_stage:'qualified',...changes});
const prepared=(scope,rows,patch={})=>({
  requestId:scope.requestId,transactionId:TX,auditEventId:AUDIT,
  toolId:scope.toolId,organizationId:scope.organizationId,
  leadId:scope.leadId,rowCount:rows.length,auditState:'pending',rows,...patch,
});
const receipt=(input,patch={})=>({
  requestId:input.requestId,transactionId:input.transactionId,
  auditEventId:input.auditEventId,toolId:input.toolId,
  organizationId:input.organizationId,leadId:input.leadId,
  rowCount:input.rowCount,commitState:'committed',
  auditCommitState:'committed',...patch,
});
const fixture=(opts={})=>{
  const calls={prepare:[],commit:[],abort:[]};
  const deps={
    prepareScopedReadAndAudit:async(scope)=>{
      calls.prepare.push(scope);
      if(opts.prepareThrows)throw Error('private DB auth / stack trace');
      if(Object.hasOwn(opts,'preparedValue'))return opts.preparedValue;
      const rows=Object.hasOwn(opts,'rows')?opts.rows:[course()];
      return prepared(scope,rows,opts.preparePatch||{});
    },
    confirmCommit:async(input)=>{
      calls.commit.push(input);
      if(opts.commitThrows)throw Error('timeout after uncertain commit');
      if(opts.confirmCommit)return opts.confirmCommit(input);
      return receipt(input,opts.commitPatch||{});
    },
    abortPending:async(input)=>{
      calls.abort.push(input);
      if(opts.abortThrows)throw Error('abort fail may still have committed');
    },
  };
  return {deps,calls};
};
const run=(p,d)=>api.previewAuditCommittedReadOrdering(p,d);

test('AI-09I is synthetically gated, source-only, and has no live Co-Pilot/Knowledge import',()=>{
  assert.equal(api.AUDIT_COMMIT_PREVIEW_RUNTIME_WIRED,false);
  const s=fs.readFileSync('lib/ai/audit-commit-read-preview-v1.ts','utf8');
  assert.match(s,/AUDIT_COMMIT_PREVIEW_RUNTIME_WIRED\s*=\s*false\s+as const/);
  assert.doesNotMatch(s,/\bcreateClient\s*\(|\bcreateAdminClient\s*\(|\bfetch\s*\(|\bexecuteTool\s*\(/);
  for(const p of ['app/conversations/copilot-actions.ts','app/settings/knowledge/actions.ts']){
    assert.doesNotMatch(fs.readFileSync(p,'utf8'),/audit-commit-read-preview-v1/);
  }
});

test('safe course output cannot leave preview function before matching mock commit',async()=>{
  let startCommit;
  const entered=new Promise(resolve=>{startCommit=resolve;});
  let finishCommit;
  const {deps,calls}=fixture({
    confirmCommit:async(input)=>{
      startCommit(input);
      return new Promise(resolve=>{finishCommit=resolve;});
    },
  });
  let settled=false;
  const promise=run(proposal(),deps).finally(()=>{settled=true;});
  const pending=await entered;
  assert.equal(settled,false,'must withhold result while simulated DB transaction is pending');
  assert.equal(calls.commit.length,1);
  assert.equal(calls.abort.length,0);
  assert.deepEqual(Object.keys(pending).sort(),[
    'auditEventId','leadId','organizationId','requestId','rowCount','toolId','transactionId',
  ].sort());
  assert.equal(Object.hasOwn(pending,'rows'),false);
  assert.equal(Object.hasOwn(pending,'email'),false);
  assert.equal(pending.organizationId,ORG);
  finishCommit(receipt(pending));
  const r=await promise;
  assert.equal(r.ok,true);
  assert.equal(r.decision,'synthetic_committed_read_preview_only');
  assert.equal(r.commitStatus,'synthetic_receipt_only');
  assert.equal(r.executionStatus,'not_wired');
  assert.equal(r.mayExecute,false);
  assert.deepEqual(r.records,[{
    organizationId:ORG,courseId:COURSE,title:'Synthetic 200-Hour Training',
    mode:'residential',startsOn:'2026-12-07',
  }]);
  assert.equal(Object.isFrozen(r),true);
  assert.equal(Object.isFrozen(r.records[0]),true);
  assert.equal(calls.abort.length,0);
});

test('exact lead read returns stage but never identity, contacts, notes, or actual activity guess',async()=>{
  const p=proposal({toolId:'crm.lead.read',leadId:LEAD});
  const {deps,calls}=fixture({rows:[lead()]});
  const r=await run(p,deps);
  assert.equal(r.ok,true);
  assert.deepEqual(r.records,[{organizationId:ORG,leadId:LEAD,stage:'qualified',lastActivityAt:null}]);
  assert.equal(r.classification,'untrusted_data_not_instructions');
  assert.equal(r.mayExecute,false);
  assert.deepEqual(calls.prepare[0].leadId,LEAD);
  assert.equal(Object.hasOwn(r,'actorId'),false);
  assert.equal(Object.hasOwn(r,'sessionId'),false);
});

test('Knowledge stays prohibited even with callbacks or claimed approved source evidence',async()=>{
  for(const patch of [
    {toolId:'knowledge.approved.search',query:'synthetic verified policy'},
    {toolId:'knowledge.approved.search',query:'synthetic verified policy',sourceStatus:'approved'},
  ]){
    const {deps,calls}=fixture();
    const r=await run(proposal(patch),deps);
    if(Object.hasOwn(patch,'sourceStatus')){
      assert.deepEqual(r,{ok:false,reason:'invalid_request',mayExecute:false});
    }else{
      assert.deepEqual(r,{ok:false,reason:'knowledge_policy_unresolved',mayExecute:false});
    }
    assert.equal(calls.prepare.length,0);
    assert.equal(calls.commit.length,0);
  }
});

test('arbitrary tools and forged actor/role/session/endpoint are denied before any callback',async()=>{
  for(const patch of [
    {toolId:'crm.lead.update'},{toolId:'payment.refund'},{toolId:'whatsapp.send'},
    {organizationId:OTHER_ORG,actorId:LEAD},{role:'owner'},
    {sessionId:AUDIT},{authVerified:true},{callback:()=>{}},
    {endpoint:'https://private.invalid'},{sql:'delete from leads'},
    {toolId:'crm.lead.read',leadId:null}, {leadId:LEAD}, {query:'wildcard'},
  ]){
    const {deps,calls}=fixture();
    assert.deepEqual(await run(proposal(patch),deps),{
      ok:false,reason:'invalid_request',mayExecute:false,
    },JSON.stringify(patch,Object.keys(patch)));
    assert.equal(calls.prepare.length,0);
    assert.equal(calls.commit.length,0);
  }
});

test('missing transaction callbacks fail closed before preparation',async()=>{
  for(const d of [null,{},{
    prepareScopedReadAndAudit:async()=>null,
  },{
    prepareScopedReadAndAudit:async()=>null,
    confirmCommit:async()=>null,
  }]){
    assert.deepEqual(await run(proposal(),d),{
      ok:false,reason:'invalid_transport',mayExecute:false,
    });
  }
});

test('preparation error cannot leak DB diagnostics, credentials or rows',async()=>{
  const {deps,calls}=fixture({prepareThrows:true});
  const r=await run(proposal(),deps);
  assert.deepEqual(r,{ok:false,reason:'prepare_failed',mayExecute:false});
  assert.equal(calls.commit.length,0);
  assert.equal(calls.abort.length,0);
  assert.doesNotMatch(JSON.stringify(r),/private DB|stack trace/);
});

test('prepared transaction requires exact current request and matched tenant/tool/lead',async()=>{
  const p=proposal({toolId:'crm.lead.read',leadId:LEAD});
  for(const patch of [
    {requestId:crypto.randomUUID()},{organizationId:OTHER_ORG},
    {leadId:OTHER_LEAD},{toolId:'crm.course.list'},
    {transactionId:'invalid'}, {auditEventId:'invalid'},
    {auditState:'committed'}, {commitState:'committed'},
  ]){
    let preparedScope;
    const {deps,calls}=fixture({rows:[lead()]});
    deps.prepareScopedReadAndAudit=async(s)=>{
      preparedScope=s;calls.prepare.push(s);
      return prepared(s,[lead()],patch);
    };
    const r=await run(p,deps);
    assert.deepEqual(r,{ok:false,reason:'prepared_read_untrusted',mayExecute:false});
    assert.equal(calls.commit.length,0);
    assert.equal(calls.abort.length,0);
    assert.ok(preparedScope.requestId);
  }
});

test('record count mismatch or excessive result denies before mock commit',async()=>{
  for(const patch of [{rowCount:0},{rowCount:2},{rowCount:-1},{rowCount:2.5}]){
    const {deps,calls}=fixture({preparePatch:patch});
    const r=await run(proposal(),deps);
    assert.equal(r.ok,false);
    assert.equal(r.reason,'prepared_read_untrusted');
    assert.equal(calls.commit.length,0);
  }
  const {deps}=fixture({rows:Array(21).fill(course())});
  const r=await run(proposal(),deps);
  assert.equal(r.ok,false);
  assert.equal(r.reason,'prepared_read_untrusted');
});

test('PII and cross-tenant records deny before commit and attempt fixture abort',async()=>{
  for(const rows of [
    [lead({email:'private@example.test'})],
    [lead({organization_id:OTHER_ORG})],
    [lead({private_notes:'secret'})],
    [lead({current_stage:'not_a_stage'})],
  ]){
    const {deps,calls}=fixture({rows});
    const r=await run(proposal({toolId:'crm.lead.read',leadId:LEAD}),deps);
    assert.deepEqual(r,{ok:false,reason:'unsafe_projection',mayExecute:false});
    assert.equal(calls.commit.length,0);
    assert.equal(calls.abort.length,1);
    assert.doesNotMatch(JSON.stringify(r),/private@|secret/);
  }
});

test('invalid calendar/parent course data cannot be released even with pending audit',async()=>{
  for(const row of [
    course({}, {start_date:'2026-02-30'}),
    course({}, {organization_id:OTHER_ORG}),
    course({}, {course_id:OTHER_LEAD}),
    course({active:false}),
  ]){
    const {deps,calls}=fixture({rows:[row]});
    const r=await run(proposal(),deps);
    assert.equal(r.ok,false);
    assert.equal(r.reason,'unsafe_projection');
    assert.equal(calls.commit.length,0);
    assert.equal(calls.abort.length,1);
  }
});

test('commit throw / timeout must not turn pending audit into a successful result',async()=>{
  const {deps,calls}=fixture({commitThrows:true});
  const r=await run(proposal(),deps);
  assert.deepEqual(r,{ok:false,reason:'audit_commit_unconfirmed',mayExecute:false});
  assert.equal(calls.prepare.length,1);
  assert.equal(calls.commit.length,1);
  assert.equal(calls.abort.length,1);
  assert.doesNotMatch(JSON.stringify(r),/timeout after uncertain commit/);
});

test('receipt must exactly match request, transaction, event, tenant, tool, count, lead',async()=>{
  for(const patch of [
    {requestId:crypto.randomUUID()},
    {transactionId:crypto.randomUUID()},
    {auditEventId:crypto.randomUUID()},
    {organizationId:OTHER_ORG},
    {toolId:'crm.lead.read'},
    {leadId:LEAD},
    {rowCount:0},
    {auditCommitState:'pending'},
    {commitState:'in_progress'},
    {mayExecute:true},
  ]){
    const {deps,calls}=fixture({commitPatch:patch});
    const r=await run(proposal(),deps);
    assert.deepEqual(r,{ok:false,reason:'audit_commit_unconfirmed',mayExecute:false});
    assert.equal(calls.commit.length,1);
    assert.equal(calls.abort.length,1);
  }
});

test('a forged positive flag or header is not a committed audit receipt',async()=>{
  for(const candidate of [
    {dataCommitted:true,auditPersisted:true},
    null,'committed',true,[],
    Object.assign(Object.create({commitState:'committed'}),{
      requestId:'not-current',
    }),
  ]){
    const {deps}=fixture({confirmCommit:async()=>candidate});
    assert.deepEqual(await run(proposal(),deps),{
      ok:false,reason:'audit_commit_unconfirmed',mayExecute:false,
    });
  }
});

test('abort failure is never represented as success or persistent denial audit',async()=>{
  const {deps,calls}=fixture({commitThrows:true,abortThrows:true});
  const r=await run(proposal(),deps);
  assert.deepEqual(r,{ok:false,reason:'audit_commit_unconfirmed',mayExecute:false});
  assert.equal(calls.abort.length,1);
  assert.equal(Object.hasOwn(r,'auditSaved'),false);
});

test('hostile prepared and receipt objects fail closed without leaking raw values',async()=>{
  const {deps}=fixture();
  deps.prepareScopedReadAndAudit=async()=>{
    const r={requestId:'not-a-request'};
    Object.defineProperty(r,'transactionId',{get(){throw Error('private getter');},enumerable:true});
    return r;
  };
  assert.deepEqual(await run(proposal(),deps),{
    ok:false,reason:'prepared_read_untrusted',mayExecute:false,
  });

  const {deps:next}=fixture();
  next.confirmCommit=async()=>new Proxy({},{
    getPrototypeOf(){throw Error('raw private proxy');},
  });
  assert.deepEqual(await run(proposal(),next),{
    ok:false,reason:'prepared_read_untrusted',mayExecute:false,
  });
});

test('a stale receipt for a separate synthetic request never unlocks the current request',async()=>{
  let previousReceipt;
  const first=fixture();
  first.deps.confirmCommit=async(p)=>{
    previousReceipt=receipt(p);
    return previousReceipt;
  };
  assert.equal((await run(proposal(),first.deps)).ok,true);
  const second=fixture({confirmCommit:async()=>previousReceipt});
  const result=await run(proposal(),second.deps);
  assert.deepEqual(result,{
    ok:false,reason:'audit_commit_unconfirmed',mayExecute:false,
  });
  assert.equal(second.calls.abort.length,1);
});

test('an empty course result is only a non-executable simulated preview',async()=>{
  const {deps,calls}=fixture({rows:[]});
  const r=await run(proposal(),deps);
  assert.equal(r.ok,true);
  assert.deepEqual(r.records,[]);
  assert.equal(r.mayExecute,false);
  assert.equal(r.commitStatus,'synthetic_receipt_only');
  assert.equal(calls.commit.length,1);
});
