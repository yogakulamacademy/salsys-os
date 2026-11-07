import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENVIRONMENT_READY_PHRASE,
  assessKbStagingWorkflowAttestation,
} from '../../scripts/verify-kb-staging-workflow-attestation.mjs';
import {
  validateKbStagingEnvironment,
} from '../../scripts/verify-kb-isolated-staging-readonly.mjs';

const sha='a'.repeat(40);
const base=()=>({
  SALSYS_KB_STAGING_ENVIRONMENT_READY:ENVIRONMENT_READY_PHRASE,
  SALSYS_KB_STAGING_APPROVED_COMMIT:sha,
  SALSYS_KB_STAGING_CHECKOUT_SHA:sha,
  SALSYS_KB_STAGING_GITHUB_SHA:sha,
  SALSYS_KB_STAGING_REVIEWED_REF:'refs/heads/kb-staging-review',
  SALSYS_KB_STAGING_GITHUB_REF:'refs/heads/kb-staging-review',
  SALSYS_KB_STAGING_PROJECT_REF:'kb05dstagingfixturea',
  OPERATOR_STAGING_PROJECT_REF:'kb05dstagingfixturea',
});

test('complete operator attestation is still only a consistency claim',()=>{
  const f=base();const r=assessKbStagingWorkflowAttestation(f);
  assert.equal(r.state,'consistent_claims_only');
  assert.equal(r.reviewedCodeCommitMatches,true);
  assert.equal(r.gitRefMatches,true);
  assert.equal(r.projectRefMatches,true);
  for(const key of [
    'protectedEnvironmentIndependentlyVerified',
    'independentHumanApprovalIndependentlyVerified',
    'actualStagingOwnershipVerified',
    'grantsRuntimeOrProductionPermission']){
    assert.equal(r[key],false,key);
  }
  assert.ok(Object.isFrozen(r));
});

test('absent or unapproved environment configuration fails before network',()=>{
  for(const key of Object.keys(base())){
    const data=base();delete data[key];
    assert.throws(()=>assessKbStagingWorkflowAttestation(data),
      /kb_staging_attestation_/);
  }
  const bad=base();bad.SALSYS_KB_STAGING_ENVIRONMENT_READY='true';
  assert.throws(()=>assessKbStagingWorkflowAttestation(bad),
    /environment_not_approved/);
});

test('changed checkout, GitHub commit or reviewed SHA cannot reuse approval',()=>{
  for(const field of [
    'SALSYS_KB_STAGING_APPROVED_COMMIT',
    'SALSYS_KB_STAGING_CHECKOUT_SHA',
    'SALSYS_KB_STAGING_GITHUB_SHA']){
    const bad=base();bad[field]='b'.repeat(40);
    assert.throws(()=>assessKbStagingWorkflowAttestation(bad),/unreviewed_commit/);
    bad[field]='not-a-commit';
    assert.throws(()=>assessKbStagingWorkflowAttestation(bad),/unreviewed_commit/);
  }
});

test('branch and project must match exact protected review claims',()=>{
  const trials=[
    ['SALSYS_KB_STAGING_GITHUB_REF','refs/heads/main',/unreviewed_git_ref/],
    ['SALSYS_KB_STAGING_REVIEWED_REF','refs/heads/../../main',/unreviewed_git_ref/],
    ['SALSYS_KB_STAGING_REVIEWED_REF','refs/heads/x//a',/unreviewed_git_ref/],
    ['SALSYS_KB_STAGING_REVIEWED_REF','refs/tags/v1',/unreviewed_git_ref/],
    ['OPERATOR_STAGING_PROJECT_REF','differentprojectref0',/operator_project_mismatch/],
    ['SALSYS_KB_STAGING_PROJECT_REF','wrong-project',/operator_project_mismatch/],
  ];
  for(const [key,value,error] of trials){
    const f=base();f[key]=value;
    assert.throws(()=>assessKbStagingWorkflowAttestation(f),error);
  }
});

test('staging preflight requires the same reviewer attestation even for direct script use',()=>{
  const e=base();
  e.SALSYS_KB_STAGING_RUN_APPROVAL='I_APPROVE_READ_ONLY_KB_STAGING';
  e.SALSYS_KB_STAGING_API_URL='https://kb05dstagingfixturea.supabase.co';
  e.SALSYS_KB_STAGING_ANON_KEY='synthetic-public-test-key-with-no-privileges';
  for(const [kind,user,org,doc,marker] of [
    ['A','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001','kbfixtureaalphatoken0001'],
    ['B','10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002','kbfixturebbetatoken0002'],
  ]){
    const prefix='SALSYS_KB_STAGING_'+kind+'_';
    e[prefix+'EMAIL']=kind.toLowerCase()+'@fixture.invalid';
    e[prefix+'PASSWORD']='synthetic-test-password-'+kind;
    e[prefix+'USER_ID']=user;
    e[prefix+'ORG_ID']=org;
    e[prefix+'DOCUMENT_ID']=doc;
    e[prefix+'MARKER']=marker;
  }
  assert.equal(validateKbStagingEnvironment(e).ref,'kb05dstagingfixturea');
  delete e.SALSYS_KB_STAGING_ENVIRONMENT_READY;
  assert.throws(()=>validateKbStagingEnvironment(e),/kb_staging_attestation_/);
});
