/**
 * KB-07E — offline, non-authorizing digest reconciliation of a separately
 * collected isolated-staging evidence bundle. This never connects to Supabase,
 * GitHub, websites or AI providers, and never reads any user/customer data
 * unless a human explicitly points the CLI at a LOCAL external review folder.
 *
 * Digest equality is a byte-integrity check ONLY, not Auth provenance,
 * independently witnessed execution, policy approval or release authority.
 */
import { createHash } from 'node:crypto';
import { lstatSync, openSync, readFileSync, closeSync, realpathSync, fstatSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { STAGING_SCENARIOS } from './staging-acceptance-ledger.ts';

const SCHEMA='kb07e-offline-evidence-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF=/^[a-z]{20}$/;
const SHA=/^[0-9a-f]{64}$/;
const FILENAME=/^[a-z0-9][a-z0-9_-]{0,90}\.evidence\.(json|txt)$/;
const RUN=/^[a-z0-9][a-z0-9._-]{5,95}$/;
const FORBIDDEN=new Set(['doaozrkrtgeslddwhclj','wunnbqjvfzmawubglyhe']);
const FILE_LIMIT=1024*1024;
const MANIFEST_LIMIT=96*1024;
const MAX_FILES=STAGING_SCENARIOS.length;
const safeResult=(error)=>Object.freeze({ok:false,error});
const safeError=(e)=>{
  if(e?.code==='ENOENT')return 'evidence_file_missing';
  return 'evidence_bundle_unreadable';
};
const keysExactly=(o,k)=>o&&typeof o==='object'&&!Array.isArray(o)
  &&Object.keys(o).sort().join('|')===[...k].sort().join('|');
function loadSmallFile(path,sizeLimit) {
  const info=lstatSync(path);
  if(!info.isFile()||info.isSymbolicLink()||info.size>sizeLimit||info.size===0)
    throw new Error('invalid_evidence_file');
  // O_NOFOLLOW is not portable in every OS; realpath + lstat checks are the
  // basic guard; folder must be owned by an independent review operator.
  const fd=openSync(path,'r');
  try {
    const current=fstatSync(fd);
    if(!current.isFile()||current.size!==info.size||current.size>sizeLimit)
      throw new Error('invalid_evidence_file');
    return readFileSync(fd);
  }finally{closeSync(fd);}
}
function invalidPath(value) {
  return typeof value!=='string'||!FILENAME.test(value)||value!==basename(value)
    ||value.includes('..')||value.includes('/')||value.includes('\\');
}

/** Read explicit local files and compare their SHA-256 digests to claims.
 * Never accept results as independent evidence or release permission.
 */
export function reconcileOfflineStagingEvidence({directory,manifestName='manifest.json'}={}) {
  if(typeof directory!=='string'||!isAbsolute(directory)||
     manifestName!=='manifest.json')return safeResult('explicit_review_directory_required');
  let base,manifest;
  try {
    base=realpathSync(resolve(directory));
    if(!lstatSync(base).isDirectory())return safeResult('invalid_review_directory');
    const file=join(base,manifestName);
    const target=realpathSync(file);
    if(target!==file)return safeResult('manifest_path_not_regular');
    manifest=JSON.parse(loadSmallFile(file,MANIFEST_LIMIT).toString('utf8'));
  }catch(e){return safeResult(safeError(e));}
  const structure=['schemaVersion','stagingProjectRef','tenantA','tenantB','runId','evidenceFiles'];
  if(!keysExactly(manifest,structure)||manifest.schemaVersion!==SCHEMA||
     !REF.test(manifest.stagingProjectRef)||FORBIDDEN.has(manifest.stagingProjectRef)||
     !UUID.test(manifest.tenantA)||!UUID.test(manifest.tenantB)||
     manifest.tenantA===manifest.tenantB||!RUN.test(manifest.runId)||
     !Array.isArray(manifest.evidenceFiles)||manifest.evidenceFiles.length>MAX_FILES)
    return safeResult('invalid_or_forbidden_manifest');
  const expected=new Map(STAGING_SCENARIOS.map(s=>[s.id,s.expected]));
  const seen=new Set(),seenFiles=new Set(),rows=[];
  for(const rec of manifest.evidenceFiles){
    if(!keysExactly(rec,['scenarioId','observedOutcome','evidenceFile','sha256'])||
       !expected.has(rec.scenarioId)||seen.has(rec.scenarioId)||
       !['deny','delete','audit','reconcile'].includes(rec.observedOutcome)||
       invalidPath(rec.evidenceFile)||seenFiles.has(rec.evidenceFile)||
       !SHA.test(rec.sha256))
      return safeResult('invalid_or_duplicate_evidence_record');
    seen.add(rec.scenarioId);seenFiles.add(rec.evidenceFile);
    let actual;
    try{
      const target=join(base,rec.evidenceFile);
      const resolved=realpathSync(target);
      if(resolved!==target)return safeResult('nonregular_or_linked_evidence_file');
      actual=createHash('sha256').update(loadSmallFile(target,FILE_LIMIT)).digest('hex');
    }catch(e){return safeResult(safeError(e));}
    rows.push(Object.freeze({
      scenarioId:rec.scenarioId,
      result:rec.observedOutcome!==expected.get(rec.scenarioId)
        ?'contradictory_observation':actual!==rec.sha256
        ?'digest_mismatch':'digest_matches_unverified_claim',
    }));
  }
  const summaries=STAGING_SCENARIOS.map(s=>{
    const row=rows.find(r=>r.scenarioId===s.id);
    return row??Object.freeze({scenarioId:s.id,result:'no_evidence_file'});
  });
  const counts=Object.freeze({
    required:STAGING_SCENARIOS.length,
    digestMatches:summaries.filter(r=>r.result==='digest_matches_unverified_claim').length,
    digestMismatches:summaries.filter(r=>r.result==='digest_mismatch').length,
    contradictions:summaries.filter(r=>r.result==='contradictory_observation').length,
    missing:summaries.filter(r=>r.result==='no_evidence_file').length,
    independentlyVerified:0,
  });
  return Object.freeze({
    ok:true,schemaVersion:SCHEMA,
    status:'blocked_needs_independent_staging_witness_and_governance',
    counts,rows:Object.freeze(summaries),
    projectIdentityIndependentlyVerified:false,
    evidenceAuthenticityIndependentlyVerified:false,
    reviewerIdentityIndependentlyVerified:false,
    policyAndRetentionIndependentlyApproved:false,
    liveStagingAccepted:false,
    canGrantConsent:false,canCrawl:false,canStoreEvidence:false,
    canApproveKnowledge:false,canPublish:false,canMerge:false,canDeploy:false,
  });
}
