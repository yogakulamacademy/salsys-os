const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const fromRoot=p=>fs.readFileSync(path.join(root,p),'utf8');
const reviewPath='docs/contracts/AI-09K-independent-review-slices-v1.json';
const docPath='docs/checkpoints/AI-09K-Independent-Security-Review-Slices-DRAFT.md';
const manifest=JSON.parse(fromRoot(reviewPath));
const older=JSON.parse(fromRoot('docs/contracts/AI-09H-production-read-authorization-release-hold-v1.json'));
const ids=['AI09K-01','AI09K-02','AI09K-03','AI09K-04','AI09K-05','AI09K-06'];
const sensitiveModules=[
  'lib/ai/agent-governance-v1.ts',
  'lib/ai/read-only-tool-gate-v1.ts',
  'lib/ai/read-only-auth-boundary-v1.ts',
  'lib/ai/read-only-tool-result-projection-v1.ts',
  'lib/ai/real-schema-read-projection-draft-v1.ts',
  'lib/ai/audit-commit-read-preview-v1.ts',
];

test('AI-09K is an independent source REVIEW intake and cannot approve a release',()=>{
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.checkpoint,'AI-09K');
  assert.equal(manifest.type,'source_only_independent_review_index');
  assert.equal(manifest.baseBranch,'integration/kb16-r2-main-preserve-20261109');
  assert.equal(manifest.baseReviewCommit,'bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6');
  assert.equal(manifest.sourceDraftPrNumber,671);
  assert.equal(manifest.reviewReady,true);
  for(const key of ['independentApprovalRecorded','runtimeEnabled','mainMergeAllowed','stagingActivated']){
    assert.equal(manifest[key],false,key);
  }
  assert.equal(manifest.realSignedUserWitnessCount,0);
  assert.equal(manifest.requiredRealSignedUserWitnessCount,16);
  assert.deepEqual(manifest.releaseGateIssues,[601,612,613,614]);
  assert.equal(older.productionReady,false);
  assert.equal(older.runtimeWired,false);
  assert.equal(older.mayExecute,false);
  assert.equal(older.independentReviews,0);
  assert.equal(older.signedUserWitnesses,0);
});

test('six review slices have exact fixed identity and no self-approved reviewer',()=>{
  assert.equal(manifest.reviewSlices.length,6);
  assert.deepEqual(manifest.reviewSlices.map(x=>x.id),ids);
  for(const x of manifest.reviewSlices){
    assert.equal(x.status,'pending_independent_review',x.id);
    assert.ok(x.independentReviewFunction.length>15,x.id);
    assert.equal(Array.isArray(x.questions),true,x.id);
    assert.ok(x.questions.length>=2,x.id);
    assert.ok(x.questions.every(q=>q.length>35),x.id);
    assert.ok(x.requiredEvidence.length>70,x.id);
    assert.equal(Object.hasOwn(x,'approvedBy'),false,x.id);
    assert.equal(Object.hasOwn(x,'approvalTimestamp'),false,x.id);
    assert.equal(Object.hasOwn(x,'approved'),false,x.id);
    assert.ok(Array.isArray(x.reviewPaths)&&x.reviewPaths.length>=3,x.id);
  }
});

test('review slices name existing real files and cover all six AI source modules exactly once',()=>{
  const seen=new Set();
  for(const x of manifest.reviewSlices){
    for(const p of x.reviewPaths){
      assert.match(p,/^(?:lib\/ai\/|tests\/(?:database|readiness)\/|docs\/(?:contracts|sql|checkpoints)\/)[a-zA-Z0-9_.\-/]+$/);
      assert.equal(path.posix.normalize(p),p,p);
      assert.ok(!p.includes('..'),p);
      assert.ok(fs.statSync(path.resolve(root,p)).isFile(),p);
      assert.ok(!seen.has(p),'repeated review path '+p);
      seen.add(p);
    }
    assert.ok(x.reviewPaths.some(p=>p.startsWith('tests/')),x.id);
  }
  for(const p of sensitiveModules)assert.ok(seen.has(p),'unreviewed AI source '+p);
  assert.equal(seen.size>=30,true);
});

test('manifest covers each disposable SQL and its regression test without deploying SQL',()=>{
  const expected=[
    ['AI-03A-prompt-approval-ledger-REHEARSAL-DRAFT.sql','ai-governed-prompt-ledger-rehearsal.test.mjs'],
    ['AI-09D-transaction-scoped-read-REHEARSAL-DRAFT.sql','ai-transaction-scoped-read-rehearsal.test.mjs'],
    ['AI-09G-real-shape-read-REHEARSAL-DRAFT.sql','ai-real-shape-read-policy-rehearsal.test.mjs'],
    ['AI-09J-idempotent-audit-replay-REHEARSAL-DRAFT.sql','ai-audit-idempotency-replay-rehearsal.test.mjs'],
  ];
  const p=new Set(manifest.reviewSlices.flatMap(s=>s.reviewPaths));
  for(const [sql,testname] of expected){
    assert.ok(p.has('docs/sql/'+sql),sql);
    assert.ok(p.has('tests/database/'+testname),testname);
    const content=fromRoot('docs/sql/'+sql);
    assert.match(content,/NOT A MIGRATION/);
  }
  assert.equal(manifest.reviewSlices.flatMap(s=>s.reviewPaths)
    .some(p=>p.startsWith('supabase/migrations/')),false);
});

test('AI-09K is never imported by Co-Pilot or the existing Knowledge approval actions',()=>{
  for(const p of ['app/conversations/copilot-actions.ts','app/settings/knowledge/actions.ts']){
    const source=fromRoot(p);
    assert.doesNotMatch(source,/AI-09K|ai09k-independent-review-slices|AI-09K-Independent-Security-Review/);
  }
  const manifestText=fromRoot(reviewPath);
  assert.doesNotMatch(manifestText,/SUPABASE_SERVICE_ROLE_KEY|PRIVATE KEY|BEGIN OPENSSH|DATABASE_URL/);
  for(const token of [
    'no_main_merge','no_production_deploy','no_hosted_supabase_sql',
    'no_mcp_or_ai_tool_execution','no_customer_data_or_crawling',
    'no_paid_staging','no_ruleset_or_release_settings_changes',
  ])assert.ok(manifest.noLiveActions.includes(token),token);
});

test('all six source-only modules retain immutable runtime-disable flags',()=>{
  const flags=[
    ['lib/ai/agent-governance-v1.ts','AGENT_GOVERNANCE_EXECUTION_WIRED'],
    ['lib/ai/read-only-tool-gate-v1.ts','READ_ONLY_TOOL_GATE_RUNTIME_WIRED'],
    ['lib/ai/read-only-auth-boundary-v1.ts','READ_ONLY_AUTH_BOUNDARY_RUNTIME_WIRED'],
    ['lib/ai/read-only-tool-result-projection-v1.ts','READ_ONLY_TOOL_RESULT_RUNTIME_WIRED'],
    ['lib/ai/real-schema-read-projection-draft-v1.ts','REAL_SCHEMA_READ_ADAPTER_RUNTIME_WIRED'],
    ['lib/ai/audit-commit-read-preview-v1.ts','AUDIT_COMMIT_PREVIEW_RUNTIME_WIRED'],
  ];
  for(const [p,key] of flags){
    const s=fromRoot(p);
    assert.match(s,new RegExp('export const '+key+'\\s*=\\s*false as const'),p);
    assert.match(s,/import 'server-only'/,p);
  }
});

test('documentation uses immutable source links and cannot imply an approval of PR 671',()=>{
  const doc=fromRoot(docPath);
  assert.match(doc,/# AI-09K — Independent Security Review Slices/);
  assert.match(doc,/272 changed files/);
  for(const id of ids)assert.ok(doc.includes(id),id);
  assert.ok(doc.includes(manifest.baseReviewCommit));
  assert.ok(doc.includes('review/ai09k-independent-security-slices-20261109'));
  assert.ok(doc.includes('0\/16'));
  assert.ok(doc.includes('DRAFT'));
  assert.ok(doc.includes('pending_independent_review'));
  assert.match(doc,/not approve the underlying code/i);
  const all=manifest.reviewSlices.flatMap(s=>s.questions).join('\n');
  for(const topic of ['consent','transaction','session','tenant','audit'])assert.ok(all.toLowerCase().includes(topic),topic);
});
