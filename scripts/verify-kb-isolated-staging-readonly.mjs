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

export const EXECUTION_PHRASE = 'I_APPROVE_READ_ONLY_KB_STAGING';
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
  const config = Object.freeze({
    ref, apiUrl, anonKey,
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
    '/auth/v1/user',
    '/rest/v1/knowledge_documents?',
    '/rest/v1/rpc/search_organization_knowledge_v1?',
  ];
  if (!allowed.some(prefix => path.startsWith(prefix)) || path.includes('://')) {
    fail('disallowed_request_path');
  }
  if (method !== 'GET' && (method !== 'POST' ||
    path !== '/auth/v1/token?grant_type=password')) {
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

async function login(config, actor, label) {
  // Auth session creation is staging-only; no knowledge row is modified.
  const resp = await request(config, '/auth/v1/token?grant_type=password', {
    method: 'POST', json: { email: actor.email, password: actor.password },
  });
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
/**
 * Verify the entire positive response, not merely the presence of one
 * permitted row. An own-tenant result mixed with an unauthorized result
 * is a data-isolation failure, even when the expected row is present.
 */
async function ownDoc(config, token, actor, label) {
  const r = await request(config, documentPath(actor.documentId), { token });
  if (r.status !== 200 || !Array.isArray(r.data)) {
    throw new Error('kb_staging_' + label + '_own_document_unexpected_status_or_body');
  }
  if (r.data.length !== 1) {
    throw new Error('kb_staging_' + label + '_own_document_unexpected_row_count');
  }
  const row = r.data[0];
  if (!row || row.id !== actor.documentId ||
    row.organization_id !== actor.organizationId ||
    row.status !== 'approved') {
    throw new Error('kb_staging_' + label + '_own_document_wrong_scope_or_status');
  }
}
async function ownSearch(config, token, actor, label) {
  const r = await request(config,
    searchPath(actor.organizationId, actor.marker), { token });
  if (r.status !== 200 || !Array.isArray(r.data)) {
    throw new Error('kb_staging_' + label + '_own_retrieval_unexpected_status_or_body');
  }
  // The actual STABLE search RPC returns document_id and content but no
  // organization_id; these uniquely seeded marker fixtures must only
  // match the approved document for that tenant.
  if (r.data.length === 0) {
    throw new Error('kb_staging_' + label + '_own_retrieval_missing_positive_fixture');
  }
  if (r.data.length > 6 || r.data.some(row =>
    !row || row.document_id !== actor.documentId ||
    typeof row.content !== 'string' || !row.content.trim())) {
    throw new Error('kb_staging_' + label + '_own_retrieval_unexpected_or_leaked_rows');
  }
  if (!r.data.some(row =>
    row.content.toLowerCase().includes(actor.marker.toLowerCase()))) {
    throw new Error('kb_staging_' + label + '_own_retrieval_marker_not_grounded');
  }
}

/** Network actions occur only when explicitly invoked after full preflight. */
export async function runKbStagingReadOnlyAcceptance(config) {
  // No network operation can start on an arbitrary or mutable caller object.
  if (!config || !VALIDATED_CONFIGS.has(config) ||
    !Object.isFrozen(config) || !Object.isFrozen(config.a) ||
    !Object.isFrozen(config.b) ||
    config.apiUrl !== 'https://' + config.ref + '.supabase.co' ||
    FORBIDDEN_PROJECT_REFS.includes(config.ref)) {
    fail('unvalidated_runtime_configuration');
  }
  const authA = await login(config, config.a, 'a');
  const authB = await login(config, config.b, 'b');
  if (authA.sessionId === authB.sessionId) {
    throw new Error('kb_staging_duplicate_auth_sessions');
  }
  const tokenA = authA.token;
  const tokenB = authB.token;

  await ownDoc(config, tokenA, config.a, 'a');
  await ownDoc(config, tokenB, config.b, 'b');
  await ownSearch(config, tokenA, config.a, 'a');
  await ownSearch(config, tokenB, config.b, 'b');

  await deniedDoc(config, tokenA, config.b.documentId, 'a_to_b_document');
  await deniedDoc(config, tokenB, config.a.documentId, 'b_to_a_document');
  await deniedSearch(config, tokenA, config.b.organizationId,
    config.b.marker, config.b.documentId, 'a_to_b_retrieval');
  await deniedSearch(config, tokenB, config.a.organizationId,
    config.a.marker, config.a.documentId, 'b_to_a_retrieval');
  await deniedDoc(config, null, config.a.documentId, 'anon_to_a_document');
  await deniedDoc(config, null, config.b.documentId, 'anon_to_b_document');
  await deniedSearch(config, null, config.a.organizationId,
    config.a.marker, config.a.documentId, 'anon_to_a_retrieval');
  await deniedSearch(config, null, config.b.organizationId,
    config.b.marker, config.b.documentId, 'anon_to_b_retrieval');

  // Only the count is printed; no JWT, credential, customer content or body.
  return { stage: 'KB05D', result: 'passed_read_only_staging_retrieval',
    checks: 12, authorizationScope: 'two_test_actors_and_anonymous',
    knowledgeWrites: 0, stagingAuthLogins: 2 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--run-readonly') {
    throw new Error('kb_staging_explicit_run_readonly_flag_required');
  }
  const config = validateKbStagingEnvironment(process.env);
  try {
    const result = await runKbStagingReadOnlyAcceptance(config);
    console.log(JSON.stringify(result));
  } catch (err) {
    // Never print raw API responses, tokens, emails, source quotes or URLs.
    const label = err instanceof Error && err.message.startsWith('kb_staging_')
      ? err.message : 'kb_staging_request_failed';
    console.error(label);
    process.exitCode = 1;
  }
}
