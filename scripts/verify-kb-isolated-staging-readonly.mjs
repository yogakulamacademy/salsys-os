/**
 * KB-05D: explicitly authorized, read-only KNOWLEDGE data acceptance on
 * a dedicated Supabase staging project using two real test-account sessions.
 *
 * NO writes to application tables or approval/crawl/provider endpoints.
 * Password sign-in DOES create Auth sessions in the approved staging project.
 * Do not run on production, recovery rehearsal, or customer accounts.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectValidatedStagingJwtClaims } from './verify-kb-staging-jwt-claims.mjs';
import { assessKbStagingWorkflowAttestation } from './verify-kb-staging-workflow-attestation.mjs';

export const EXECUTION_PHRASE = 'I_APPROVE_READ_ONLY_KB_STAGING';
export const SESSION_BINDING_APPROVAL_PHRASE =
  'I_APPROVE_TWO_STAGING_TEST_SESSION_BINDINGS_ONLY';
export const SESSION_BINDING_ENVIRONMENT_READY =
  'OWNER_APPROVED_ISOLATED_STAGING_SESSION_BINDING_WRITES';
export const FORBIDDEN_PROJECT_REFS = Object.freeze([
  'doaozrkrtgeslddwhclj', // known SalsysOS Production
  'wunnbqjvfzmawubglyhe', // known SalsysOS Recovery Rehearsal
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_REF = /^[a-z0-9]{20}$/;
const MARKER = /^kbfixture[a-z0-9]{12,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Object identity, not a spread-copyable property, certifies local preflight.
const VALIDATED_CONFIGS = new WeakSet();

function fail(code) {
  throw new Error('kb_staging_preflight_' + code);
}
function required(env, key) {
  const v = env[key];
  if (typeof v !== 'string' || !v.trim()) fail('missing_' + key);
  return v.trim();
}
function uuid(env, key) {
  const v = required(env, key);
  if (!UUID.test(v)) fail('invalid_' + key);
  return v.toLowerCase();
}
function identity(env, prefix) {
  const email = required(env, prefix + '_EMAIL');
  const password = required(env, prefix + '_PASSWORD');
  if (!EMAIL.test(email) || email.length > 254) fail('invalid_' + prefix + '_EMAIL');
  if (password.length < 12 || password.length > 200) fail('invalid_' + prefix + '_PASSWORD');
  return {
    email, password,
    userId: uuid(env, prefix + '_USER_ID'),
    organizationId: uuid(env, prefix + '_ORG_ID'),
    documentId: uuid(env, prefix + '_DOCUMENT_ID'),
    marker: required(env, prefix + '_MARKER'),
  };
}

/** No HTTP, login, filesystem write, or provider call occurs here. */
export function validateKbStagingEnvironment(env) {
  if (!env || typeof env !== 'object') fail('missing_configuration');
  // A missing GitHub environment or stale reviewed SHA blocks even a direct
  // CLI/imported invocation before any Auth or data request.
  assessKbStagingWorkflowAttestation(env);
  if (required(env, 'SALSYS_KB_STAGING_RUN_APPROVAL') !== EXECUTION_PHRASE) {
    fail('manual_approval_missing');
  }
  const ref = required(env, 'SALSYS_KB_STAGING_PROJECT_REF');
  if (!PROJECT_REF.test(ref) || FORBIDDEN_PROJECT_REFS.includes(ref)) {
    fail('project_not_dedicated_staging');
  }
  const apiUrl = required(env, 'SALSYS_KB_STAGING_API_URL');
  // No custom domains, URLs containing ports, paths, credentials or queries.
  if (apiUrl !== 'https://' + ref + '.supabase.co') {
    fail('project_url_mismatch');
  }
  const anonKey = required(env, 'SALSYS_KB_STAGING_ANON_KEY');
  if (anonKey.length < 20 || anonKey.length > 4096) fail('invalid_api_key');
  const a = identity(env, 'SALSYS_KB_STAGING_A');
  const b = identity(env, 'SALSYS_KB_STAGING_B');
  if (a.email.toLowerCase() === b.email.toLowerCase() ||
    a.userId === b.userId || a.organizationId === b.organizationId ||
    a.documentId === b.documentId || a.marker === b.marker) {
    fail('test_fixtures_not_distinct');
  }
  for (const [tag, actor] of [['A', a], ['B', b]]) {
    if (!MARKER.test(actor.marker)) fail('invalid_marker_' + tag);
  }
  if (a.organizationId === b.documentId || b.organizationId === a.documentId) {
    fail('fixture_crossed_identifier');
  }
  // A session-binding POST changes only the test actor's staging tenant-session
  // binding; require separate operator signoff AND protected environment claim.
  // Existing read-only execution has no additional permissions.
  const bindingClaim = env.SALSYS_KB_STAGING_BINDING_WRITES_READY;
  const bindingApproval = env.SALSYS_KB_STAGING_BINDING_APPROVAL_PHRASE;
  const requestedBinding = Boolean(bindingClaim || bindingApproval);
  const bindingApproved =
    bindingClaim === SESSION_BINDING_ENVIRONMENT_READY &&
    bindingApproval === SESSION_BINDING_APPROVAL_PHRASE;
  if (requestedBinding && !bindingApproved) {
    fail('independent_session_binding_approval_missing');
  }
  const config = Object.freeze({
    ref, apiUrl, anonKey,
    allowSessionBinding: bindingApproved,
    a: Object.freeze(a), b: Object.freeze(b),
  });
  VALIDATED_CONFIGS.add(config);
  return config;
}

export function documentPath(documentId) {
  if (!UUID.test(documentId)) fail('invalid_document_id');
  const params = new URLSearchParams({
    select: 'id,organization_id,status',
    id: 'eq.' + documentId.toLowerCase(),
  });
  return '/rest/v1/knowledge_documents?' + params;
}
/** STABLE KB-06B RPC: safe GET only. No grant or consent data is fetched. */
export function consentActorPath(organizationId) {
  if (!UUID.test(organizationId)) fail('invalid_consent_actor_organization_id');
  const params=new URLSearchParams({p_org:organizationId.toLowerCase()});
  return '/rest/v1/rpc/kb_discovery_consent_actor_v1?' + params;
}
export function searchPath(organizationId, marker) {
  if (!UUID.test(organizationId) || !MARKER.test(marker)) {
    fail('invalid_retrieval_arguments');
  }
  const params = new URLSearchParams({
    p_organization_id: organizationId.toLowerCase(),
    p_query: marker,
    p_limit: '6',
  });
  // This RPC is declared STABLE in the checked-in SQL, so only GET is used.
  return '/rest/v1/rpc/search_organization_knowledge_v1?' + params;
}

async function request(config, path, { token = null, method = 'GET', json = null } = {}) {
  const allowed = [
    '/auth/v1/token?grant_type=password',
    '/auth/v1/logout?scope=local',
    '/auth/v1/user',
    '/rest/v1/knowledge_documents?',
    '/rest/v1/rpc/search_organization_knowledge_v1?',
    '/rest/v1/rpc/kb_discovery_consent_actor_v1?',
    '/rest/v1/rpc/bind_current_tenant_session',
  ];
  if (!allowed.some(prefix => path.startsWith(prefix)) || path.includes('://')) {
    fail('disallowed_request_path');
  }
  const signIn=path==='/auth/v1/token?grant_type=password';
  const signOut=path==='/auth/v1/logout?scope=local';
  const sessionBind=path==='/rest/v1/rpc/bind_current_tenant_session';
  if ((path.startsWith('/rest/v1/rpc/bind_current_tenant_session') && !sessionBind) ||
      (method==='POST' && !(signIn || (signOut && typeof token==='string' &&
        token.length>0 && json===null) ||
        (sessionBind && config.allowSessionBinding===true &&
          typeof token==='string' && token.length>0 &&
          json && typeof json==='object' && !Array.isArray(json) &&
          Object.keys(json).length===1 &&
          [config.a.organizationId,config.b.organizationId].includes(json.p_organization_id)))) ||
      (method==='GET' && (signIn || signOut || sessionBind)) ||
      !['GET','POST'].includes(method)) {
    fail('disallowed_http_method');
  }
  const headers = { apikey: config.anonKey, accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (json !== null) headers['content-type'] = 'application/json';
  const response = await fetch(config.apiUrl + path, {
    method, headers,
    body: json === null ? undefined : JSON.stringify(json),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data };
}

function assertRows(result, { mustContain = null, forbidden = null, orgId = null, label }) {
  if (result.status !== 200 || !Array.isArray(result.data)) {
    throw new Error('kb_staging_' + label + '_unexpected_status_or_body');
  }
  if (forbidden !== null && result.data.some(row => row?.id === forbidden ||
    row?.document_id === forbidden)) {
    throw new Error('kb_staging_' + label + '_cross_tenant_leak');
  }
  if (mustContain !== null && !result.data.some(row =>
    (row?.id === mustContain || row?.document_id === mustContain) &&
    (orgId === null || row.organization_id === orgId || row.document_id === mustContain))) {
    throw new Error('kb_staging_' + label + '_missing_positive_fixture');
  }
}
async function login(config, actor, label, registerIssuedToken) {
  // Auth session creation is staging-only; no knowledge row is modified.
  const resp = await request(config, '/auth/v1/token?grant_type=password', {
    method: 'POST', json: { email: actor.email, password: actor.password },
  });
  // Record the token IMMEDIATELY on receipt, even if identity/JWT checks
  // later fail. Finally-cleanup must include every newly issued Auth session.
  if (resp.status === 200 && typeof resp.data?.access_token === 'string') {
    registerIssuedToken(resp.data.access_token);
  }
  if (resp.status !== 200 || typeof resp.data?.access_token !== 'string' ||
    resp.data?.user?.id !== actor.userId) {
    throw new Error('kb_staging_' + label + '_authentication_or_identity_failed');
  }
  const userResp = await request(config, '/auth/v1/user', {
    token: resp.data.access_token,
  });
  if (userResp.status !== 200 || userResp.data?.id !== actor.userId) {
    throw new Error('kb_staging_' + label + '_user_session_unverified');
  }
  const claims = inspectValidatedStagingJwtClaims(resp.data.access_token, {
    userId: actor.userId, apiUrl: config.apiUrl,
  });
  return { token: resp.data.access_token, sessionId: claims.sessionId };
}
async function revokeOnlyThisTestSession(config,token) {
  // Explicit LOCAL scope is essential; omitting it signs out all sessions.
  const response=await request(config,'/auth/v1/logout?scope=local',{
    method:'POST',token,
  });
  if(response.status!==204) {
    throw new Error('kb_staging_auth_local_logout_failed');
  }
}
function requireNoRows(result, label) {
  if (result.status === 401 || result.status === 403) return;
  if (result.status !== 200 || !Array.isArray(result.data)) {
    throw new Error('kb_staging_' + label + '_unexpected_status_or_body');
  }
  if (result.data.length !== 0) {
    throw new Error('kb_staging_' + label + '_cross_tenant_leak');
  }
}
async function deniedDoc(config, token, docId, label) {
  requireNoRows(await request(config, documentPath(docId), { token }), label);
}
async function deniedSearch(config, token, orgId, marker, docId, label) {
  requireNoRows(await request(config, searchPath(orgId, marker), { token }), label);
}
async function ownDoc(config, token, actor, label) {
  const r = await request(config, documentPath(actor.documentId), { token });
  assertRows(r, {
    mustContain: actor.documentId, orgId: actor.organizationId,
    label: label + '_own_document',
  });
  const row = r.data.find(x => x?.id === actor.documentId);
  if (row?.organization_id !== actor.organizationId || row?.status !== 'approved') {
    throw new Error('kb_staging_' + label + '_document_not_approved_in_tenant');
  }
}
async function ownSearch(config, token, actor, label) {
  const r = await request(config,
    searchPath(actor.organizationId, actor.marker), { token });
  assertRows(r, {
    mustContain: actor.documentId, label: label + '_own_retrieval',
  });
}

/** Isolated-staging-only, explicitly human-authorized workspace session bind.
 * Uses the existing production-reviewed membership/active-org RPC with the
 * caller's exact fresh Auth token. NEVER service_role, anon or another tenant.
 * This is a real binding-table write; do not call it in read-only mode.
 */
async function bindTestSession(config, token, actor, label) {
  const r=await request(config,'/rest/v1/rpc/bind_current_tenant_session',{
    method:'POST',token,json:{p_organization_id:actor.organizationId},
  });
  if(r.status!==200||r.data!==actor.organizationId)
    throw new Error('kb_staging_'+label+'_session_binding_unverified');
}

/** Fail closed if the strict live Auth session is not bound to its own tenant.
 * A missing KB-06B RPC, policy denial, or absent session binding is NOT a pass.
 * Cross-tenant and revoked-session access must return null or a 401/403.
 */
async function ownConsentActor(config,token,actor,label) {
  const r=await request(config,consentActorPath(actor.organizationId),{token});
  if(r.status!==200||r.data!==actor.userId)
    throw new Error('kb_staging_'+label+'_consent_actor_own_session_unverified');
}
async function deniedConsentActor(config,token,organizationId,label) {
  const r=await request(config,consentActorPath(organizationId),{token});
  if(r.status===401||r.status===403||(r.status===200&&r.data===null))return;
  throw new Error('kb_staging_'+label+'_consent_actor_cross_tenant_or_revocation_leak');
}
async function anonymousConsentActor(config,organizationId,label) {
  const r=await request(config,consentActorPath(organizationId));
  // KB-06B explicitly REVOKES function EXECUTE from anon.
  // Missing SQL is a 404, NOT proof of denied access.
  if(r.status!==401&&r.status!==403)
    throw new Error('kb_staging_'+label+'_consent_actor_anon_permission_not_denied');
}

/** Network actions occur only when explicitly invoked after full preflight.
 * An optional, explicitly selected KB-06F extension checks the signed-session
 * actor RPC with two genuine owner/admin staging accounts. No consent grant,
 * source content, evidence or mutation is requested.
 */
export async function runKbStagingReadOnlyAcceptance(
  config,{checkConsentActor=false,bindTestSessions=false}={}
) {
  if(typeof checkConsentActor!=='boolean' || typeof bindTestSessions!=='boolean')
    fail('invalid_consent_actor_option');
  if(bindTestSessions && (!checkConsentActor ||
      !config || config.allowSessionBinding!==true))
    fail('independent_session_binding_approval_missing');
  // No network operation can start on an arbitrary or mutable caller object.
  if (!config || !VALIDATED_CONFIGS.has(config) ||
    !Object.isFrozen(config) || !Object.isFrozen(config.a) ||
    !Object.isFrozen(config.b) ||
    config.apiUrl !== 'https://' + config.ref + '.supabase.co' ||
    FORBIDDEN_PROJECT_REFS.includes(config.ref)) {
    fail('unvalidated_runtime_configuration');
  }
  // Keep issued access tokens only in process memory for finally-cleanup.
  // None is logged, persisted, returned or sent to a different project.
  const issuedTokens=[];
  let verificationError=null;
  let passed=null;
  let actorTokens=null;
  try {
    const registerIssuedToken=token=>issuedTokens.push(token);
    const authA=await login(config,config.a,'a',registerIssuedToken);
    const authB=await login(config,config.b,'b',registerIssuedToken);
    if(authA.sessionId===authB.sessionId){
      throw new Error('kb_staging_duplicate_auth_sessions');
    }
    const tokenA=authA.token;
    const tokenB=authB.token;

    if(bindTestSessions){
      // EXACT newly minted Auth sessions. Binding to any other org fails via
      // the database membership/active org check. Never weaken strict actor.
      await bindTestSession(config,tokenA,config.a,'a');
      await bindTestSession(config,tokenB,config.b,'b');
    }

    await ownDoc(config,tokenA,config.a,'a');
    await ownDoc(config,tokenB,config.b,'b');
    await ownSearch(config,tokenA,config.a,'a');
    await ownSearch(config,tokenB,config.b,'b');

    // Positive own-session results prevent vacuous success on an uninstalled
    // RPC or a staging tenant without a correctly bound owner/admin session.
    if(checkConsentActor){
      await ownConsentActor(config,tokenA,config.a,'a');
      await ownConsentActor(config,tokenB,config.b,'b');
      await deniedConsentActor(config,tokenA,config.b.organizationId,'a_to_b');
      await deniedConsentActor(config,tokenB,config.a.organizationId,'b_to_a');
      await anonymousConsentActor(config,config.a.organizationId,'anon_to_a');
      await anonymousConsentActor(config,config.b.organizationId,'anon_to_b');
      actorTokens={a:tokenA,b:tokenB};
    }

    await deniedDoc(config,tokenA,config.b.documentId,'a_to_b_document');
    await deniedDoc(config,tokenB,config.a.documentId,'b_to_a_document');
    await deniedSearch(config,tokenA,config.b.organizationId,
      config.b.marker,config.b.documentId,'a_to_b_retrieval');
    await deniedSearch(config,tokenB,config.a.organizationId,
      config.a.marker,config.a.documentId,'b_to_a_retrieval');
    await deniedDoc(config,null,config.a.documentId,'anon_to_a_document');
    await deniedDoc(config,null,config.b.documentId,'anon_to_b_document');
    await deniedSearch(config,null,config.a.organizationId,
      config.a.marker,config.a.documentId,'anon_to_a_retrieval');
    await deniedSearch(config,null,config.b.organizationId,
      config.b.marker,config.b.documentId,'anon_to_b_retrieval');

    passed={
      stage:bindTestSessions?'KB06H':checkConsentActor?'KB06F':'KB05D',
      result:bindTestSessions
        ?'passed_staging_session_binding_and_read_only_knowledge_consent_checks'
        :checkConsentActor?'passed_read_only_knowledge_and_consent_actor_checks'
        :'passed_read_only_staging_retrieval',
      checks:checkConsentActor?20:12,
      consentActorChecks:checkConsentActor?8:0,
      authorizationScope:'two_test_actors_and_anonymous',
      knowledgeWrites:0,consentWrites:0,
      stagingSessionBindingWrites:bindTestSessions?2:0,
      stagingAuthLogins:2,
      independentStagingAcceptanceVerified:false,
      authorizesCrawlOrRelease:false,
    };
  }catch(e){
    verificationError=e;
  }

  let revocationAcknowledged=0;
  let cleanupFailed=false;
  // Attempt cleanup for EVERY newly issued token, even after test failure.
  // Never default to global logout, never reuse a token on another project.
  for(const token of [...new Set(issuedTokens)].reverse()){
    try{
      await revokeOnlyThisTestSession(config,token);
      revocationAcknowledged++;
    }catch{
      cleanupFailed=true;
    }
  }
  if(cleanupFailed){
    // A failed cleanup is NOT silently ignored even when tests passed.
    // Manual staging account/session recovery is then required.
    throw new Error('kb_staging_auth_session_cleanup_incomplete');
  }
  if(verificationError)throw verificationError;
  if(checkConsentActor){
    if(!actorTokens||revocationAcknowledged!==2)
      throw new Error('kb_staging_consent_actor_missing_revoke_receipts');
    // Stale bearer tokens remain cryptographically valid until expiry.
    // The KB-06B helper must ALSO refuse them after session-local logout.
    await deniedConsentActor(config,actorTokens.a,config.a.organizationId,'a_after_logout');
    await deniedConsentActor(config,actorTokens.b,config.b.organizationId,'b_after_logout');
  }
  return {...passed,localSessionRevocationsAcknowledged:revocationAcknowledged,
    authLogoutScope:'local',accessTokensMaySurviveUntilJwtExpiry:true};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 ||
      !['--run-readonly','--run-readonly-consent-actor',
        '--run-bound-consent-actor'].includes(process.argv[2])) {
    throw new Error('kb_staging_explicit_run_readonly_flag_required');
  }
  const config = validateKbStagingEnvironment(process.env);
  try {
    const result = await runKbStagingReadOnlyAcceptance(config,{
      checkConsentActor:process.argv[2]!== '--run-readonly',
      bindTestSessions:process.argv[2]==='--run-bound-consent-actor',
    });
    console.log(JSON.stringify(result));
  } catch (err) {
    // Never print raw API responses, tokens, emails, source quotes or URLs.
    const label = err instanceof Error && err.message.startsWith('kb_staging_')
      ? err.message : 'kb_staging_request_failed';
    console.error(label);
    process.exitCode = 1;
  }
}
