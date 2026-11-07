import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {STAGING_SCENARIOS} from '../../lib/knowledge-extraction/staging-acceptance-ledger.ts';
import {reconcileOfflineStagingEvidence} from
  '../../lib/knowledge-extraction/offline-staging-evidence-verifier.mjs';

const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const PROJECT='abcdefghijklmnopqrst';
const ORIGINAL={schemaVersion:'kb07e-offline-evidence-v1',
  stagingProjectRef:PROJECT,tenantA:A,tenantB:B,runId:'staging-review-20261107',
  evidenceFiles:[],
};
function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'salsys-kb07e-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const manifest=structuredClone(ORIGINAL);
  const save=()=>writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));
  function add(scenario,{outcome=scenario.expected,bytes='synthetic-only',hash}={}){
    const file=scenario.id+'.evidence.json';
    writeFileSync(join(dir,file),bytes);
    const sha256=hash??createHash('sha256').update(bytes).digest('hex');
    manifest.evidenceFiles.push({
      scenarioId:scenario.id,observedOutcome:outcome,
      evidenceFile:file,sha256,
    });
    save();
    return file;
  }
  save();
  return {dir,manifest,save,add};
}

test('KB-07E starts 0 of 16 independently verified and cannot enable any release operations',t=>{
  const f=fixture(t);
  const old=globalThis.fetch;let calls=0;
  globalThis.fetch=()=>{calls++;throw Error('network forbidden');};
  try{
    const r=reconcileOfflineStagingEvidence({directory:f.dir});
    assert.equal(r.ok,true);
    assert.equal(r.status,'blocked_needs_independent_staging_witness_and_governance');
    assert.deepEqual(r.counts,{
      required:16,digestMatches:0,digestMismatches:0,
      contradictions:0,missing:16,independentlyVerified:0,
    });
    assert.equal(r.rows.length,STAGING_SCENARIOS.length);
    assert.ok(r.rows.every(x=>x.result==='no_evidence_file'));
    for(const key of ['projectIdentityIndependentlyVerified',
      'evidenceAuthenticityIndependentlyVerified',
      'reviewerIdentityIndependentlyVerified',
      'policyAndRetentionIndependentlyApproved',
      'liveStagingAccepted','canGrantConsent','canCrawl','canStoreEvidence',
      'canApproveKnowledge','canPublish','canMerge','canDeploy']){
      assert.equal(r[key],false,key);
    }
    assert.equal(calls,0);
  }finally{globalThis.fetch=old;}
});

test('KB-07E compares actual local SHA-256 bytes, outcomes and missing scenarios without claiming acceptance',t=>{
  const f=fixture(t);
  f.add(STAGING_SCENARIOS[0],{bytes:'{"result":"synthetic-deny"}'});
  f.add(STAGING_SCENARIOS[1],{bytes:'synthetic-unchanged',hash:'a'.repeat(64)});
  f.add(STAGING_SCENARIOS[2],{outcome:'audit'});
  const r=reconcileOfflineStagingEvidence({directory:f.dir});
  assert.equal(r.ok,true);
  assert.deepEqual(r.counts,{
    required:16,digestMatches:1,digestMismatches:1,
    contradictions:1,missing:13,independentlyVerified:0,
  });
  assert.equal(r.rows[0].result,'digest_matches_unverified_claim');
  assert.equal(r.rows[1].result,'digest_mismatch');
  assert.equal(r.rows[2].result,'contradictory_observation');
  assert.equal(r.rows[3].result,'no_evidence_file');
  assert.ok(!JSON.stringify(r).includes('synthetic-unchanged'));
  assert.ok(!JSON.stringify(r).includes(PROJECT));
  assert.equal(r.canDeploy,false);
});

test('even all 16 accurately hashed claim files cannot self-authorize',t=>{
  const f=fixture(t);
  for(const s of STAGING_SCENARIOS)f.add(s,{bytes:'{"synthetic":"'+s.id+'"}'});
  const before=JSON.stringify(f.manifest);
  const a=reconcileOfflineStagingEvidence({directory:f.dir});
  const b=reconcileOfflineStagingEvidence({directory:f.dir});
  assert.deepEqual(a,b);
  assert.equal(JSON.stringify(f.manifest),before);
  assert.equal(a.counts.digestMatches,16);
  assert.equal(a.counts.missing,0);
  assert.equal(a.counts.independentlyVerified,0);
  assert.equal(a.liveStagingAccepted,false);
  assert.equal(a.canMerge,false);
  assert.equal(a.canDeploy,false);
  assert.ok(Object.isFrozen(a));
});

test('KB-07E rejects forged scope, unknown scenario, duplicate rows and paths',t=>{
  const f=fixture(t);
  const s=STAGING_SCENARIOS[0];
  f.add(s,{bytes:'synthetic'});
  const good=structuredClone(f.manifest);
  const variations=[
    {stagingProjectRef:'doaozrkrtgeslddwhclj'},
    {stagingProjectRef:'wunnbqjvfzmawubglyhe'},
    {stagingProjectRef:'bad'},
    {tenantB:A},
    {tenantA:'not-a-uuid'},
    {runId:'../../bad'},
    {evidenceFiles:[...good.evidenceFiles,{...good.evidenceFiles[0]}]},
    {evidenceFiles:[{...good.evidenceFiles[0],scenarioId:'fake_approval'}]},
    {evidenceFiles:[{...good.evidenceFiles[0],evidenceFile:'../../secret.evidence.json'}]},
    {evidenceFiles:[{...good.evidenceFiles[0],evidenceFile:'../secret.evidence.txt'}]},
    {evidenceFiles:[{...good.evidenceFiles[0],evidenceFile:'unexpected/name.evidence.json'}]},
    {evidenceFiles:[{...good.evidenceFiles[0],evidenceFile:'/etc/passwd'}]},
    {evidenceFiles:[{...good.evidenceFiles[0],sha256:'1'}]},
    {evidenceFiles:[{...good.evidenceFiles[0],observedOutcome:'approved'}]},
    {schemaVersion:'release-approved'},
    {extraApproval:true},
  ];
  for(const patch of variations){
    for(const key of Object.keys(f.manifest))delete f.manifest[key];
    Object.assign(f.manifest,structuredClone(good),patch);
    f.save();
    const r=reconcileOfflineStagingEvidence({directory:f.dir});
    assert.equal(r.ok,false,JSON.stringify(patch));
  }
  assert.deepEqual(reconcileOfflineStagingEvidence({directory:'relative/path'}),
    {ok:false,error:'explicit_review_directory_required'});
  assert.deepEqual(reconcileOfflineStagingEvidence({
    directory:f.dir,manifestName:'../secret.json'}),
    {ok:false,error:'explicit_review_directory_required'});
});

test('KB-07E rejects symbolic links, missing and oversized local evidence',t=>{
  const f=fixture(t);
  const scenario=STAGING_SCENARIOS[0];
  const name=f.add(scenario);
  rmSync(join(f.dir,name));
  assert.equal(reconcileOfflineStagingEvidence({directory:f.dir}).error,
    'evidence_file_missing');
  writeFileSync(join(f.dir,'real-source.evidence.json'),'synthetic');
  symlinkSync(join(f.dir,'real-source.evidence.json'),join(f.dir,name));
  assert.equal(reconcileOfflineStagingEvidence({directory:f.dir}).error,
    'nonregular_or_linked_evidence_file');
  rmSync(join(f.dir,name));
  writeFileSync(join(f.dir,name),'x'.repeat(1024*1024+1));
  assert.equal(reconcileOfflineStagingEvidence({directory:f.dir}).error,
    'evidence_bundle_unreadable');
  rmSync(join(f.dir,name));
  writeFileSync(join(f.dir,name),'synthetic');
  rmSync(join(f.dir,'manifest.json'));
  symlinkSync(join(f.dir,name),join(f.dir,'manifest.json'));
  assert.equal(reconcileOfflineStagingEvidence({directory:f.dir}).error,
    'manifest_path_not_regular');
});

test('KB-07E CLI requires explicit human ack and prints only sanitized non-authorizing counts',t=>{
  const f=fixture(t);
  const executable=fileURLToPath(new URL(
    '../../scripts/kb07e-review-offline-evidence.mjs',import.meta.url));
  const cmd=(ack)=>spawnSync(process.execPath,
    ['--experimental-strip-types',executable,f.dir],{
      env:{...process.env,SALSYS_KB_EVIDENCE_REVIEW_ONLY:ack},
      encoding:'utf8',timeout:10000,
    });
  const empty=cmd('I_ACKNOWLEDGE_DIGESTS_ARE_NOT_ACCEPTANCE');
  assert.equal(empty.status,1,empty.stderr);
  assert.equal(JSON.parse(empty.stdout).counts.missing,16);
  f.add(STAGING_SCENARIOS[0],{bytes:'NEVER_PRINT_PRIVATE_SYNTHETIC_PAYLOAD'});
  const denied=cmd('');
  assert.equal(denied.status,2);
  assert.match(denied.stderr,/explicit read-only acknowledgement/);
  const permitted=cmd('I_ACKNOWLEDGE_DIGESTS_ARE_NOT_ACCEPTANCE');
  assert.equal(permitted.status,1,permitted.stderr);
  const report=JSON.parse(permitted.stdout);
  assert.equal(report.counts.digestMatches,1);
  assert.equal(report.counts.independentlyVerified,0);
  assert.equal(report.canDeploy,false);
  assert.equal(report.independentAcceptanceVerified,false);
  for(const privateValue of [
    'NEVER_PRINT_PRIVATE_SYNTHETIC_PAYLOAD',f.dir,A,B,PROJECT,
  ])assert.ok(!permitted.stdout.includes(privateValue),'CLI leaked context');

  for(const s of STAGING_SCENARIOS.slice(1))
    f.add(s,{bytes:'synthetic-evidence-'+s.id});
  const full=cmd('I_ACKNOWLEDGE_DIGESTS_ARE_NOT_ACCEPTANCE');
  assert.equal(full.status,0,full.stderr);
  const fullReport=JSON.parse(full.stdout);
  assert.equal(fullReport.counts.digestMatches,16);
  assert.equal(fullReport.counts.missing,0);
  assert.equal(fullReport.counts.independentlyVerified,0);
  assert.equal(fullReport.independentAcceptanceVerified,false);
  assert.equal(fullReport.canMerge,false);
  assert.equal(fullReport.canDeploy,false);
});
