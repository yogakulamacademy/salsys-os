import test from 'node:test';
import assert from 'node:assert/strict';
import { assessWebsiteRefreshPreflight } from '../../lib/knowledge-extraction/website-refresh-preflight.ts';

const ORG='00000000-0000-4000-8000-000000000001';
const ADMIN='00000000-0000-4000-8000-000000000002';
const HOST='sample.example.com';
const NOW='2026-11-06T12:00:00.000Z';
function proposal(){
  return {
    activeOrganizationId:ORG,
    evidenceOrganizationId:ORG,
    sourceUrl:'https://sample.example.com/services',
    verifiedHostname:HOST,
    evidenceLifecycleState:'eligible_for_review_only',
    consent:{
      organizationId:ORG,verifiedHostname:HOST,
      purpose:'website_change_monitoring',status:'granted',
      grantedBy:ADMIN,grantedAt:'2026-11-01T12:00:00Z',
      validUntil:'2026-12-01T12:00:00Z',policyVersion:'refresh-opt-in-v1',
    },
    limits:{
      organizationId:ORG,status:'approved',version:'limits-v1',
      pagesPerRun:10,pagesPerDay:40,minimumIntervalMinutes:120,
      concurrentRuns:1,respectRobotsTxt:true,redirects:'forbidden',
      crossOriginRequests:'forbidden',
    },
    operations:{
      globalEmergencyStop:false,organizationPaused:false,
      ownershipRevoked:false,consentWithdrawalObserved:false,
      robotsDecision:'allowed',pagesUsedToday:10,runningJobs:0,
      lastRunFinishedAt:'2026-11-06T08:00:00Z',
    },
  };
}
function report(input=proposal(),now=NOW){
  return assessWebsiteRefreshPreflight(input,now);
}
test('even an all-green synthetic review never schedules, crawls, stores or publishes',()=>{
  const result=report();
  assert.equal(result.schemaVersion,'kb04b-v1');
  assert.equal(result.status,'reviewable_in_isolated_staging_only');
  assert.equal(result.satisfied,7);
  assert.equal(result.total,7);
  assert.ok(result.gates.every(x=>x.status==='satisfied'));
  for(const key of ['evidenceVerifiedAtExecution','canEnqueue','canCrawl',
    'canStore','canSyncKnowledge','canApprove','canPublish']){
    assert.equal(result[key],false,key);
  }
});
test('missing and malformed inputs fail closed',()=>{
  assert.equal(assessWebsiteRefreshPreflight(null,NOW).status,'blocked');
  assert.equal(report(proposal(),'not-a-timestamp').status,'blocked');
  assert.equal(report(proposal(),'2026-02-30T12:00:00Z').status,'blocked');
  assert.equal(report({...proposal(),evidenceLifecycleState:'blocked'}).status,'blocked');
  const missing=proposal();missing.consent=null;
  assert.equal(report(missing).status,'blocked');
  assert.equal(report(missing).sourceUrl,'https://sample.example.com/services');
});
test('tenant boundaries, aliases, other pages and insecure URLs fail closed',()=>{
  for(const mutation of [
    x=>{x.evidenceOrganizationId='00000000-0000-4000-8000-000000000003';},
    x=>{x.sourceUrl='https://www.sample.example.com/services';},
    x=>{x.sourceUrl='https://sample.example.com.evil.net/services';},
    x=>{x.sourceUrl='http://sample.example.com/services';},
    x=>{x.sourceUrl='https://sample.example.com/services?token=a';},
    x=>{x.sourceUrl='https://sample.example.com/services#top';},
    x=>{x.sourceUrl='https://sample.example.com:444/services';},
    x=>{x.sourceUrl='https://user:pw@sample.example.com/services';},
    x=>{x.verifiedHostname='other.example.com';},
  ]){
    const x=proposal();mutation(x);
    const r=report(x);
    assert.equal(r.status,'blocked');
    assert.equal(r.sourceUrl,null);
  }
});
test('purpose-bound refresh consent cannot be inferred from general evidence consent',()=>{
  for(const mutation of [
    x=>{x.consent.status='withdrawn';},
    x=>{x.consent.status='pending';},
    x=>{x.consent.purpose='website_evidence_review';},
    x=>{x.consent.organizationId='00000000-0000-4000-8000-000000000003';},
    x=>{x.consent.verifiedHostname='www.sample.example.com';},
    x=>{x.consent.validUntil='2026-11-06T12:00:00Z';},
    x=>{x.consent.grantedAt='2026-11-07T12:00:00Z';},
    x=>{x.consent.grantedBy=null;},
    x=>{x.consent.policyVersion='';},
  ]){
    const x=proposal();mutation(x);
    assert.equal(report(x).gates.find(g=>g.id==='refresh_consent').status,'blocked');
  }
});
test('kill switches, withdrawal observation and robots unknown/disallow block immediately',()=>{
  for(const mutation of [
    x=>{x.operations.globalEmergencyStop=true;},
    x=>{x.operations.organizationPaused=true;},
    x=>{x.operations.ownershipRevoked=true;},
    x=>{x.operations.consentWithdrawalObserved=true;},
    x=>{x.operations.robotsDecision='unknown';},
    x=>{x.operations.robotsDecision='disallowed';},
    x=>{x.operations=null;},
  ]){
    const x=proposal();mutation(x);
    assert.equal(report(x).status,'blocked');
  }
});
test('approved, bounded fetch policy is required; permissive refresh rules fail',()=>{
  for(const mutation of [
    x=>{x.limits.status='draft';},
    x=>{x.limits.organizationId='00000000-0000-4000-8000-000000000003';},
    x=>{x.limits.pagesPerRun=26;},
    x=>{x.limits.pagesPerRun=0;},
    x=>{x.limits.pagesPerDay=101;},
    x=>{x.limits.minimumIntervalMinutes=59;},
    x=>{x.limits.concurrentRuns=2;},
    x=>{x.limits.respectRobotsTxt=false;},
    x=>{x.limits.redirects='follow';},
    x=>{x.limits.crossOriginRequests='allowed';},
  ]){
    const x=proposal();mutation(x);
    assert.equal(report(x).status,'blocked');
  }
});
test('daily budget, concurrency and cooldown must all be available',()=>{
  for(const mutation of [
    x=>{x.operations.pagesUsedToday=31;},
    x=>{x.operations.pagesUsedToday=-1;},
    x=>{x.operations.pagesUsedToday=0.5;},
    x=>{x.operations.runningJobs=1;},
    x=>{x.operations.lastRunFinishedAt='2026-11-06T11:30:00Z';},
    x=>{x.operations.lastRunFinishedAt='2026-11-07T12:00:00Z';},
    x=>{x.operations.lastRunFinishedAt='not-a-timestamp';},
  ]){
    const x=proposal();mutation(x);
    assert.equal(report(x).gates.find(g=>g.id==='capacity_and_cooldown').status,'blocked');
  }
});
test('report is deterministic, no input objects change and readiness cannot authorize writes',()=>{
  const x=proposal();const before=structuredClone(x);
  const first=report(x);const second=report(x);
  assert.deepEqual(first,second);
  assert.deepEqual(x,before);
  assert.equal(first.canEnqueue,false);
  assert.equal(first.evidenceVerifiedAtExecution,false);
});
