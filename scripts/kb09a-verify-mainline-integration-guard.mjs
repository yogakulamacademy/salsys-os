import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * KB-09A: REPRODUCIBLE OFFLINE MAINLINE-INTEGRATION GUARD.
 *
 * This pins selected current-main paths so a KB feature draft cannot quietly
 * rewrite the EXISTING manual knowledge approval/Co-Pilot retrieval contract.
 * It also checks that disposable SQL is not wired into app runtime and that
 * the experimental discovery worker stays default-off and bearer protected.
 *
 * This is a regression/scope tripwire, NOT a substitute for independent
 * code review, Auth/RLS/consent validation, live acceptance or deployment.
 * If a legitimate mainline change moves a pin, stop and independently rebase
 * and re-approve the baseline. Never silently update these hashes.
 */
export const REVIEWED_MAIN_SHA = '691dc44182b969a2e0c272017fcdfc927c2dc9fc';
export const REVIEWED_PARENT_HEAD = '45ff2968a7af0bbb6ec6d9a9238e1fd22df0c644';

export const PROTECTED_MAIN_BLOBS = Object.freeze({
  'app/settings/knowledge/actions.ts': '30a6ac02c91baefaf440fb979bf6cae94dbd031b',
  'app/conversations/copilot-actions.ts': '637558fc254e48cfbb4945f177e12cec057a1698',
  'supabase/migrations/20261016173500_organization_knowledge_search_v1.sql': '0f21489896cb9d0c2213682eefc435975f53fa24',
  'supabase/migrations/20261102053201_knowledge_retrieval_anon_execute_hardening.sql': '5ffa89b6ed347159a5a50665a7b806bcde38204c',
  'scripts/verify-ai-knowledge-final-closeout.mjs': 'beb64e245b968698aac0f5472c07f1695b7a0f45',
  'scripts/verify-conversations-final-closeout.mjs': '02bd7d91b27aab43afe2f826ed4f562aba1d292a',
  'lib/supabase/admin.ts': 'f1a172e6dd9c7a20de4162a1d4d829cab7cbef98',
});

const REHEARSALS = Object.freeze([
  ['docs/sql/KB-08E-version-aware-knowledge-approval-REHEARSAL-DRAFT.sql',
    'KB08E_DISPOSABLE_EMPTY_DATABASE_REQUIRED'],
  ['docs/sql/KB-08F-postapproval-source-invalidation-REHEARSAL-DRAFT.sql',
    'KB08F_DISPOSABLE_PARENT_FIXTURE_REQUIRED'],
  ['docs/sql/KB-08G-source-verification-alert-gate-REHEARSAL-DRAFT.sql',
    'KB08G_DISPOSABLE_PARENT_FIXTURE_REQUIRED'],
]);

const STAGING_WORKFLOWS = Object.freeze([
  ['.github/workflows/kb-isolated-staging-readonly.yml',
    'kb-isolated-staging-acceptance'],
  ['.github/workflows/kb-isolated-staging-session-binding.yml',
    'kb-isolated-staging-session-binding-acceptance'],
]);

const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

export function gitBlobSha(contents) {
  const data=Buffer.isBuffer(contents)?contents:Buffer.from(contents);
  return createHash('sha1').update('blob '+data.byteLength+'\0')
    .update(data).digest('hex');
}

export function runtimePaths(root=process.cwd()) {
  const result=[];
  for(const dirname of ['app','components','lib']){
    const visit=(dir)=>{
      for(const entry of readdirSync(resolve(root,dir),{withFileTypes:true})){
        const path=join(dir,entry.name);
        if(entry.isDirectory()){
          if(!['node_modules','.next','.git'].includes(entry.name))visit(path);
        }else if(entry.isFile()&&SOURCE_EXT.test(path)){
          result.push(path.split('\\').join('/'));
        }
      }
    };
    visit(dirname);
  }
  return result.sort();
}

export function auditKBMainlineIntegration({
  readFile=(path)=>readFileSync(path),
  codePaths=runtimePaths(),
}={}) {
  const violations=[];
  const read=(path)=>{
    try{return readFile(path);}catch{
      violations.push('missing_required_file:'+path);
      return Buffer.from('');
    }
  };
  const text=(path)=>Buffer.from(read(path)).toString('utf8');

  for(const [path,expected] of Object.entries(PROTECTED_MAIN_BLOBS)){
    const actual=gitBlobSha(read(path));
    if(actual!==expected)violations.push('protected_main_contract_changed:'+path);
  }

  for(const [path,guard] of REHEARSALS){
    const source=text(path);
    if(!source.includes(guard)||
      !source.includes('current_database()')||
      !source.includes('to_regclass(')||
      !/DISPOSABLE|disposable/i.test(source)){
      violations.push('rehearsal_db_guard_missing:'+path);
    }
    if(/^\s*(create|alter|drop)\s+(?:or replace\s+)?(?:function|table|view|schema)\s+(?:public\.)/im.test(source)){
      violations.push('rehearsal_touches_public_schema:'+path);
    }
    // A rehearsal is allowed in docs, NEVER in a runnable migration.
    const migrationPath='supabase/migrations/'+path.split('/').at(-1);
    if(Buffer.from(readFileMaybe(migrationPath,readFile)).length>0){
      violations.push('rehearsal_copied_to_migrations:'+migrationPath);
    }
  }

  const enabled=text('lib/knowledge-discovery/pilot-gate.ts');
  if(!enabled.includes("process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED === 'true'")||
    !enabled.includes("process.env.KNOWLEDGE_DISCOVERY_PAUSED !== 'true'")||
    !enabled.includes('allowed.includes(host)')){
    violations.push('pilot_default_off_or_exact_host_gate_changed');
  }

  const worker=text('app/api/knowledge/discovery/worker/route.ts');
  const pilotIndex=worker.indexOf('if (!discoveryPilotEnabled())');
  const bearerIndex=worker.indexOf('bearerMatchesAnySecret(');
  const adminIndex=worker.indexOf('createAdminClient()');
  if(pilotIndex<0||bearerIndex<0||adminIndex<0||
    pilotIndex>adminIndex||bearerIndex>adminIndex||
    !worker.includes('process.env.KNOWLEDGE_DISCOVERY_RUNNER_SECRET')||
    /process\.env\.CRON_SECRET\b/.test(worker)||
    !worker.includes('discoveryHostAllowed(')||
    !worker.includes('discoveryDomainVerified(')||
    !worker.includes('discoverySiteConsentActive(')){
    violations.push('worker_pilot_auth_or_consent_boundary_changed');
  }
  // KB-09C: a GET request must NEVER invoke the side-effectful worker,
  // including by future handler aliasing, cron defaults or prefetch requests.
  if(!worker.includes('export function GET()')||
    !worker.includes('status: 405')||
    /export const GET\s*=\s*POST/.test(worker)){
    violations.push('worker_get_mutation_boundary_changed');
  }
  if(!worker.includes('validDiscoveryClaim(claim)')||
    !worker.includes('Array.isArray(data)')||
    !worker.includes('data.length > 1')){
    violations.push('worker_claim_validation_boundary_changed');
  }
  // KB-09D: a rejected SQL commit must propagate failure from the page core
  // through the HTTP response, never be acknowledged as processed.
  const core=text('lib/knowledge-discovery/run-core.ts');
  if(!core.includes('if (!result || result.ok !== true)')||
     !core.includes('ok: false')||
     /return\s*\{\s*ok:\s*true,\s*status:\s*result\.reason/.test(core)||
     !worker.includes('if (!outcome || outcome.ok !== true)')||
     !worker.includes('Discovery page commit was not acknowledged')){
    violations.push('worker_commit_acknowledgment_boundary_changed');
  }

  for(const [path,environment] of STAGING_WORKFLOWS){
    const source=text(path);
    if(!/^on:\s*\r?\n\s{2}workflow_dispatch:/m.test(source)||
      /^\s{2}(?:push|pull_request|schedule|workflow_run):/m.test(source)||
      !source.includes('environment: '+environment)){
      violations.push('staging_workflow_dispatch_or_env_changed:'+path);
    }
  }

  for(const path of codePaths){
    if(!SOURCE_EXT.test(path))continue;
    if(!/^(?:app|components|lib)\//.test(path))continue;
    const source=text(path);
    if(/kb08[e-g]_fixture|KB-08[E-G]-.+REHEARSAL-DRAFT\.sql/i.test(source)){
      violations.push('disposable_fixture_referenced_by_runtime:'+path);
    }
  }
  return [...new Set(violations)].sort();
}

function readFileMaybe(path,readFile){
  try{return readFile(path);}catch{return '';}
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href){
  const violations=auditKBMainlineIntegration();
  if(violations.length){
    for(const violation of violations)console.error('KB09A_BLOCKED '+violation);
    process.exitCode=1;
  }else{
    console.log('KB09A offline integration scope guard passed: core workflows pinned; rehearsal SQL isolated; pilot/auth boundaries present. No live acceptance inferred.');
  }
}
