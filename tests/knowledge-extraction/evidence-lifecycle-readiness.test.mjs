import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessEvidenceReadiness,
} from '../../lib/knowledge-extraction/evidence-lifecycle-readiness.ts';

const AT=Date.parse('2026-11-06T12:00:00.000Z');
const ORG_A='10000000-0000-4000-8000-000000000001';
const ORG_B='10000000-0000-4000-8000-000000000002';
const USER='20000000-0000-4000-8000-000000000001';

function allowedFixture(){
  return {
    authenticatedAdmin:true,
    activeOrganizationId:ORG_A,
    evidenceOrganizationId:ORG_A,
    sourceUrl:'https://sample.example.com/courses?utm_source=test',
    verifiedHostname:'sample.example.com',
    domainVerifiedUntil:'2026-12-06T12:00:00Z',
    consent:{
      organizationId:ORG_A,hostname:'sample.example.com',
      purpose:'website_evidence_review',status:'granted',
      grantedBy:USER,grantedAt:'2026-11-06T10:00:00Z',
      validUntil:'2026-12-01T10:00:00Z',policyVersion:'policy-v1',
    },
    retention:{
      organizationId:ORG_A,status:'approved',version:'retention-v1',
      quoteRetentionDays:30,rawHtmlStorage:'forbidden',
      deletionPlanReviewed:true,deletionRehearsalPassed:true,
      auditTrailReviewed:true,auditRehearsalPassed:true,
    },
    tenantRlsRehearsalPassed:true,
    controlledStagingReadinessPassed:true,
  };
}

test('missing policy and consent block all storage and publishing by default',()=>{
  const result=assessEvidenceReadiness(null,AT);
  assert.equal(result.state,'blocked');
  assert.equal(result.total,9);
  assert.equal(result.satisfied,0);
  assert.ok(result.gates.every(g=>g.status==='blocked'));
  assert.deepEqual([result.canStoreEvidence,result.canStoreRawHtml,result.canPublishKnowledge],
    [false,false,false]);
});

test('even a fully furnished synthetic policy never enables persistence or publication',()=>{
  const fixture=allowedFixture();
  const result=assessEvidenceReadiness(fixture,AT);
  assert.equal(result.state,'eligible_for_review_only');
  assert.equal(result.satisfied,result.total);
  assert.deepEqual([result.canStoreEvidence,result.canStoreRawHtml,result.canPublishKnowledge],
    [false,false,false]);
  assert.deepEqual(result.gates.map(g=>g.id),[
    'admin_access','tenant_binding','verified_https_hostname',
    'active_domain_ownership','active_extraction_consent',
    'approved_retention_decision','deletion_rehearsal','audit_rehearsal',
    'isolated_staging_acceptance',
  ]);
});

test('another tenant cannot satisfy consent or retention for current evidence',()=>{
  const fixture=allowedFixture();
  fixture.consent.organizationId=ORG_B;
  fixture.retention.organizationId=ORG_B;
  const result=assessEvidenceReadiness(fixture,AT);
  assert.equal(result.state,'blocked');
  assert.equal(result.gates.find(g=>g.id==='active_extraction_consent').status,'blocked');
  assert.equal(result.gates.find(g=>g.id==='approved_retention_decision').status,'blocked');
  assert.equal(result.canStoreEvidence,false);
});

test('revoked, denied, pending and expired consent remain blocked',()=>{
  for(const status of ['withdrawn','denied','pending']){
    const fixture=allowedFixture();
    fixture.consent.status=status;
    const result=assessEvidenceReadiness(fixture,AT);
    assert.equal(result.state,'blocked',status);
    assert.equal(result.gates.find(g=>g.id==='active_extraction_consent').status,'blocked');
  }
  const fixture=allowedFixture();
  fixture.consent.validUntil='2026-11-06T12:00:00.000Z';
  assert.equal(assessEvidenceReadiness(fixture,AT).state,'blocked');
  fixture.consent.validUntil=null;
  assert.equal(assessEvidenceReadiness(fixture,AT).state,'blocked');
});

test('source must match exact previously verified HTTPS hostname',()=>{
  for(const url of [
    'http://sample.example.com/course',
    'https://www.sample.example.com/course',
    'https://sample.example.com.attacker.net/course',
    'https://username:password@sample.example.com/course',
    'https://sample.example.com:8443/course',
    'javascript:alert(1)',
    'https://127.0.0.1/internal',
  ]){
    const fixture=allowedFixture();
    fixture.sourceUrl=url;
    const status=assessEvidenceReadiness(fixture,AT);
    assert.equal(status.state,'blocked',url);
    assert.equal(status.gates.find(g=>g.id==='verified_https_hostname').status,'blocked');
    assert.equal(status.gates.find(g=>g.id==='active_extraction_consent').status,'blocked');
  }
  const fixture=allowedFixture();
  fixture.domainVerifiedUntil='2026-11-06T11:00:00Z';
  assert.equal(assessEvidenceReadiness(fixture,AT).state,'blocked');
});

test('retention is never inferred; all lifecycle rehearsals are separate required gates',()=>{
  const tests=[
    (f)=>{f.retention.quoteRetentionDays=null;},
    (f)=>{f.retention.quoteRetentionDays=0;},
    (f)=>{f.retention.quoteRetentionDays=1.5;},
    (f)=>{f.retention.rawHtmlStorage='permitted';},
    (f)=>{f.retention.status='draft';},
    (f)=>{f.retention.deletionRehearsalPassed=false;},
    (f)=>{f.retention.auditRehearsalPassed=false;},
    (f)=>{f.tenantRlsRehearsalPassed=false;},
    (f)=>{f.controlledStagingReadinessPassed=false;},
    (f)=>{f.authenticatedAdmin=false;},
  ];
  for(const mutate of tests){
    const fixture=allowedFixture();mutate(fixture);
    const result=assessEvidenceReadiness(fixture,AT);
    assert.equal(result.state,'blocked');
    assert.equal(result.canStoreEvidence,false);
  }
});
