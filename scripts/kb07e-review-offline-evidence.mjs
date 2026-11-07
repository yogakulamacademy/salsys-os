#!/usr/bin/env node
// KB-07E human-invoked OFFLINE digest check. No network, no uploads, no DB
// calls, no release actions. NEVER print evidence payloads, tenant IDs or
// full paths. An independently verified witness is required separately.
import {reconcileOfflineStagingEvidence} from
  '../lib/knowledge-extraction/offline-staging-evidence-verifier.mjs';

const PHRASE='I_ACKNOWLEDGE_DIGESTS_ARE_NOT_ACCEPTANCE';
const args=process.argv.slice(2);
if(args.length!==1||process.env.SALSYS_KB_EVIDENCE_REVIEW_ONLY!==PHRASE){
  console.error('KB-07E blocked: explicit read-only acknowledgement and one absolute local review directory required.');
  process.exitCode=2;
}else{
  const result=reconcileOfflineStagingEvidence({directory:args[0]});
  if(!result.ok){
    console.error('KB-07E blocked: '+result.error);
    process.exitCode=2;
  }else{
    // No filenames, evidence bytes, tenant IDs, Supabase refs, secrets, or
    // witness identifiers are written to stdout.
    console.log(JSON.stringify({
      schemaVersion:result.schemaVersion,
      status:result.status,
      counts:result.counts,
      scenarios:result.rows,
      independentAcceptanceVerified:result.liveStagingAccepted,
      canMerge:result.canMerge,
      canDeploy:result.canDeploy,
    },null,2));
    // The command is an integrity preflight, NOT an acceptance decision.
    // Integrity failure is a nonzero exit; even complete hash matches are
    // still explicitly blocked from production or release.
    process.exitCode=(
      result.counts.digestMismatches>0||result.counts.contradictions>0
    )?1:0;
  }
}
