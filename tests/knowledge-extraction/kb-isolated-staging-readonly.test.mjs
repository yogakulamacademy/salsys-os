import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXECUTION_PHRASE,
  SESSION_BINDING_APPROVAL_PHRASE,
  SESSION_BINDING_ENVIRONMENT_READY,
  FORBIDDEN_PROJECT_REFS,
  validateKbStagingEnvironment,
  documentPath,
  searchPath,
  consentActorPath,
  runKbStagingReadOnlyAcceptance,
} from '../../scripts/verify-kb-isolated-staging-readonly.mjs';

const A = {
  email:'qa-a@fixture.invalid',password:'synthetic-secret-A-only',
  userId:'10000000-0000-4000-8000-000000000001',
  org:'20000000-0000-4000-8000-000000000001',
  doc:'30000000-0000-4000-8000-000000000001',
  marker:'kbfixtureaalphatoken0001',
};
const B = {
  email:'qa-b@fixture.invalid',password:'synthetic-secret-B-only',
  userId:'10000000-0000-4000-8000-000000000002',
  org:'20000000-0000-4000-8000-000000000002',
  doc:'30000000-0000-4000-8000-000000000002',
  marker:'kbfixturebbetatoken0002',
};

const SESSION_A='40000000-0000-4000-8000-000000000001';
const SESSION_B='40000000-0000-4000-8000-000000000002';
const ISSUER='https://kb05dstagingfixturea.supabase.co/auth/v1';
function fakeVerifiedJwt(actor, sessionId){
  const now=Math.floor(Date.now()/1000);
  const encoded=part=>Buffer.from(JSON.stringify(part)).toString('base64url');
  return [
    encoded({alg:'HS256',typ:'JWT'}),
    encoded({sub:actor.userId,role:'authenticated',aud:'authenticated',
      iss:ISSUER,session_id:sessionId,iat:now,exp:now+3600}),
    Buffer.from('synthetic-test-signature').toString('base64url'),
  ].join('.');
}

const baseEnv=()=>({
  SALSYS_KB_STAGING_RUN_APPROVAL:EXECUTION_PHRASE,
  SALSYS_KB_STAGING_ENVIRONMENT_READY:'OWNER_APPROVED_KB_TEST_ENVIRONMENT',
  SALSYS_KB_STAGING_APPROVED_COMMIT:'a'.repeat(40),
  SALSYS_KB_STAGING_CHECKOUT_SHA:'a'.repeat(40),
  SALSYS_KB_STAGING_GITHUB_SHA:'a'.repeat(40),
  SALSYS_KB_STAGING_REVIEWED_REF:'refs/heads/feature/kb05f-review-test',
  SALSYS_KB_STAGING_GITHUB_REF:'refs/heads/feature/kb05f-review-test',
  OPERATOR_STAGING_PROJECT_REF:'kb05dstagingfixturea',

  SALSYS_KB_STAGING_PROJECT_REF:'kb05dstagingfixturea',
  SALSYS_KB_STAGING_API_URL:'https://kb05dstagingfixturea.supabase.co',
  SALSYS_KB_STAGING_ANON_KEY:'synthetic-public-api-key-for-test-only',
  SALSYS_KB_STAGING_A_EMAIL:A.email,
  SALSYS_KB_STAGING_A_PASSWORD:A.password,
  SALSYS_KB_STAGING_A_USER_ID:A.userId,
  SALSYS_KB_STAGING_A_ORG_ID:A.org,
  SALSYS_KB_STAGING_A_DOCUMENT_ID:A.doc,
  SALSYS_KB_STAGING_A_MARKER:A.marker,
  SALSYS_KB_STAGING_B_EMAIL:B.email,
  SALSYS_KB_STAGING_B_PASSWORD:B.password,
  SALSYS_KB_STAGING_B_USER_ID:B.userId,
  SALSYS_KB_STAGING_B_ORG_ID:B.org,
  SALSYS_KB_STAGING_B_DOCUMENT_ID:B.doc,
  SALSYS_KB_STAGING_B_MARKER:B.marker,
});
const expectBlocked=(env,pattern)=>assert.throws(
  ()=>validateKbStagingEnvironment(env),pattern);

test('explicit protected execution phrase and exact staging host are mandatory',()=>{
  const e=baseEnv();delete e.SALSYS_KB_STAGING_RUN_APPROVAL;
  expectBlocked(e,/manual_approval_missing|missing_SALSYS_KB_STAGING_RUN_APPROVAL/);
  const wrong=baseEnv();wrong.SALSYS_KB_STAGING_RUN_APPROVAL='no';
  expectBlocked(wrong,/manual_approval_missing/);
  for(const url of [
    'http://kb05dstagingfixturea.supabase.co',
    'https://kb05dstagingfixturea.supabase.co:443',
    'https://kb05dstagingfixturea.supabase.co/',
    'https://kb05dstagingfixturea.supabase.co/path',
    'https://attacker.example.com',
    'https://kb05dstagingfixturea.supabase.co@evil.example',
  ]){
    const env=baseEnv();env.SALSYS_KB_STAGING_API_URL=url;
    expectBlocked(env,/project_url_mismatch/);
  }
  for(const ref of FORBIDDEN_PROJECT_REFS){
    const env=baseEnv();env.SALSYS_KB_STAGING_PROJECT_REF=ref;
    // Satisfy the *new* operator-ref gate first so the denylist is tested
    // independently; both checks must continue to deny unsafe targets.
    env.OPERATOR_STAGING_PROJECT_REF=ref;
    env.SALSYS_KB_STAGING_API_URL='https://'+ref+'.supabase.co';
    expectBlocked(env,/project_not_dedicated_staging/);
  }
});
test('fixture identities must be distinct, exact and syntactically safe',()=>{
  const e=baseEnv();assert.equal(validateKbStagingEnvironment(e).a.userId,A.userId);
  const e1=baseEnv();e1.SALSYS_KB_STAGING_B_ORG_ID=A.org;
  expectBlocked(e1,/fixtures_not_distinct/);
  const e2=baseEnv();e2.SALSYS_KB_STAGING_B_EMAIL=A.email.toUpperCase();
  expectBlocked(e2,/fixtures_not_distinct/);
  const e3=baseEnv();e3.SALSYS_KB_STAGING_A_MARKER='not-a-valid-search marker';
  expectBlocked(e3,/invalid_marker_A/);
  const e4=baseEnv();e4.SALSYS_KB_STAGING_A_PASSWORD='short';
  expectBlocked(e4,/invalid_.*PASSWORD/);
  const e5=baseEnv();e5.SALSYS_KB_STAGING_B_USER_ID='fake';
  expectBlocked(e5,/invalid_.*USER_ID/);
});
test('query URL construction is bounded to exact read-only knowledge paths',()=>{
  const doc=documentPath(A.doc);
  const search=searchPath(A.org,A.marker);
  assert.ok(doc.startsWith('/rest/v1/knowledge_documents?'));
  assert.ok(search.startsWith('/rest/v1/rpc/search_organization_knowledge_v1?'));
  assert.equal(new URLSearchParams(doc.split('?')[1]).get('select'),
    'id,organization_id,status');
  assert.equal(new URLSearchParams(search.split('?')[1]).get('p_limit'),'6');
  assert.throws(()=>documentPath('bad'),/invalid_document_id/);
  assert.throws(()=>searchPath(A.org,'bad input'),/invalid_retrieval_arguments/);
  assert.equal(consentActorPath(A.org),
    '/rest/v1/rpc/kb_discovery_consent_actor_v1?p_org='+A.org);
  assert.throws(()=>consentActorPath('https://production.example.com/'),
    /invalid_consent_actor_organization_id/);
});
function mockedResponse(status,body){
  return {status, async json(){return body;}};
}
function installSyntheticFetch({
  leak=false,missingPositive=false,badUser=false,duplicateSession=false,
  logoutFailure=false,secondLoginFails=false,badAuthUser=false,
  consentActorCrossTenantLeak=false,consentActorMissingPositive=false,
  consentActorRevokedStillAllowed=false,consentActorAnonAllowed=false,
  consentActorMalformed=false,
  enforceSessionBinding=false,bindFailure=false,badBindingResult=false,
}={}){
  const calls=[];
  const revokedTokens=new Set();
  const boundTokens=new Map();
  const tokenA=fakeVerifiedJwt(A,SESSION_A);
  const tokenB=fakeVerifiedJwt(B,duplicateSession?SESSION_A:SESSION_B);
  const original=globalThis.fetch;
  globalThis.fetch=async (url,init)=>{
    assert.ok(url.startsWith('https://kb05dstagingfixturea.supabase.co/'));
    assert.equal(init.redirect,'error');
    const u=new URL(url);const pathname=u.pathname;
    const method=init.method;
    calls.push({method,path:pathname,url});
    if(pathname==='/auth/v1/token'){
      assert.equal(method,'POST');
      const body=JSON.parse(init.body);
      const actor=body.email===A.email?A:B;
      assert.ok([A.email,B.email].includes(body.email));
      assert.equal(body.password,actor.password);
      if(secondLoginFails&&actor===B)return mockedResponse(401,{error:'unauthorized'});
      return mockedResponse(200,{
        access_token:body.email===A.email?tokenA:tokenB,
        user:{id:badUser?'90000000-0000-4000-8000-000000000001':actor.userId},
      });
    }
    if(pathname==='/auth/v1/logout'){
      assert.equal(method,'POST');
      assert.equal(u.searchParams.get('scope'),'local');
      assert.equal(init.headers.Authorization?.startsWith('Bearer '),true);
      assert.equal(init.body,undefined);
      if(!logoutFailure)revokedTokens.add(init.headers.Authorization?.slice(7));
      return mockedResponse(logoutFailure?503:204,null);
    }
    assert.equal(method,'GET');
    const token=init.headers.Authorization?.replace('Bearer ','')??'anon';
    const actor=token===tokenA?A:token===tokenB?B:null;
    if(pathname==='/auth/v1/user')return mockedResponse(200,{
      id:badAuthUser?'90000000-0000-4000-8000-000000000001':actor?.userId,
    });
    if(pathname==='/rest/v1/rpc/bind_current_tenant_session'){
      assert.equal(method,'POST');
      assert.ok(actor,'Auth token must belong to one of the two staging fixtures');
      assert.equal(init.headers.Authorization,'Bearer '+token);
      const body=JSON.parse(init.body);
      assert.deepEqual(Object.keys(body),['p_organization_id']);
      assert.equal(body.p_organization_id,actor.org);
      if(bindFailure&&actor===B)return mockedResponse(403,{message:'Membership binding refused'});
      boundTokens.set(token,actor.org);
      return mockedResponse(200,badBindingResult?'wrong organization':actor.org);
    }
    if(pathname==='/rest/v1/rpc/kb_discovery_consent_actor_v1'){
      assert.equal(method,'GET');
      const targetOrg=u.searchParams.get('p_org');
      assert.ok(targetOrg===A.org||targetOrg===B.org);
      if(!actor) return consentActorAnonAllowed
        ?mockedResponse(200,A.userId):mockedResponse(403,{message:'No execute privilege'});
      if(consentActorMalformed)return mockedResponse(200,{userId:actor.userId});
      if(revokedTokens.has(token)&&!consentActorRevokedStillAllowed)
        return mockedResponse(200,null);
      if(enforceSessionBinding&&boundTokens.get(token)!==targetOrg)
        return mockedResponse(200,null);
      if(actor.org===targetOrg&&!consentActorMissingPositive)
        return mockedResponse(200,actor.userId);
      if(actor===A&&consentActorCrossTenantLeak)
        return mockedResponse(200,A.userId);
      return mockedResponse(200,null);
    }
    if(pathname==='/rest/v1/knowledge_documents'){
      const id=u.searchParams.get('id')?.slice(3);
      if(actor&&actor.doc===id&&!missingPositive)
        return mockedResponse(200,[{id,organization_id:actor.org,status:'approved'}]);
      if(leak&&actor===A&&id===B.doc)
        return mockedResponse(200,[{id,organization_id:B.org,status:'approved'}]);
      return mockedResponse(200,[]);
    }
    if(pathname==='/rest/v1/rpc/search_organization_knowledge_v1'){
      const org=u.searchParams.get('p_organization_id');
      const marker=u.searchParams.get('p_query');
      if(actor && actor.org===org && actor.marker===marker && !missingPositive)
        return mockedResponse(200,[{document_id:actor.doc}]);
      return mockedResponse(200,[]);
    }
    throw Error('unexpected_request');
  };
  return {calls,restore:()=>{globalThis.fetch=original;}};
}

test('mocked two-tenant acceptance uses ONLY auth session POSTs and data GETs',async()=>{
  const fake=installSyntheticFetch();
  try{
    const result=await runKbStagingReadOnlyAcceptance(
      validateKbStagingEnvironment(baseEnv()));
    assert.equal(result.result,'passed_read_only_staging_retrieval');
    assert.equal(result.checks,12);
    assert.equal(result.knowledgeWrites,0);
    assert.equal(result.localSessionRevocationsAcknowledged,2);
    assert.equal(result.authLogoutScope,'local');
    assert.equal(result.accessTokensMaySurviveUntilJwtExpiry,true);
    assert.equal(fake.calls.filter(x=>x.method==='POST').length,4);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/token').length,2);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
    assert.ok(fake.calls.filter(x=>x.method==='POST').every(x=>
      ['/auth/v1/token','/auth/v1/logout'].includes(x.path)));
    assert.ok(fake.calls.filter(x=>x.path==='/auth/v1/logout').every(x=>
      new URL(x.url).searchParams.get('scope')==='local'));
    assert.ok(fake.calls.filter(x=>x.method==='GET').every(x=>
      ['/auth/v1/user','/rest/v1/knowledge_documents',
        '/rest/v1/rpc/search_organization_knowledge_v1'].includes(x.path)));
  }finally{fake.restore();}
});

test('mocked cross-tenant data leakage fails rather than being counted as denial',async()=>{
  const fake=installSyntheticFetch({leak:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv())),
      /cross_tenant_leak/,
    );
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
  }finally{fake.restore();}
});
test('missing positive fixture fails, preventing vacuous isolation success',async()=>{
  const fake=installSyntheticFetch({missingPositive:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv())),
      /missing_positive_fixture/,
    );
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
  }finally{fake.restore();}
});
test('wrong authenticated staging account fails before knowledge reads',async()=>{
  const fake=installSyntheticFetch({badUser:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv())),
      /authentication_or_identity_failed/,
    );
    assert.equal(fake.calls.filter(x=>x.path.startsWith('/rest/v1/')).length,0);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,1);
  }finally{fake.restore();}
});


test('imported runner cannot bypass preflight with a forged URL or mutable config',async()=>{
  const approved=validateKbStagingEnvironment(baseEnv());
  assert.equal(Object.isFrozen(approved),true);
  assert.equal(Object.isFrozen(approved.a),true);
  assert.equal(Object.isFrozen(approved.b),true);
  let requests=0;
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{requests++;throw Error('never_call_external_network');};
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance({
        ...approved,apiUrl:'https://unapproved.example.com',
      }),
      /unvalidated_runtime_configuration/,
    );
    await assert.rejects(
      runKbStagingReadOnlyAcceptance({
        ...approved,a:{...approved.a},
      }),
      /unvalidated_runtime_configuration/,
    );
    assert.equal(requests,0);
  }finally{globalThis.fetch=original;}
});


test('two staging actors cannot reuse the same Auth session ID',async()=>{
  const fake=installSyntheticFetch({duplicateSession:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv())),
      /duplicate_auth_sessions/,
    );
    assert.equal(fake.calls.filter(x=>x.path.startsWith('/rest/v1/')).length,0);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
  }finally{fake.restore();}
});


test('failed second login revokes first session and runs no knowledge queries',async()=>{
  const fake=installSyntheticFetch({secondLoginFails:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv())),
      /authentication_or_identity_failed/,
    );
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/token').length,2);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,1);
    assert.equal(fake.calls.filter(x=>x.path.startsWith('/rest/v1/')).length,0);
  }finally{fake.restore();}
});
test('failure after issuance but before JWT validation revokes the issued session',async()=>{
  const fake=installSyntheticFetch({badAuthUser:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv())),
      /user_session_unverified/,
    );
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,1);
    assert.equal(fake.calls.filter(x=>x.path.startsWith('/rest/v1/')).length,0);
  }finally{fake.restore();}
});
test('logout errors force an overall failure even when all 12 knowledge checks passed',async()=>{
  const fake=installSyntheticFetch({logoutFailure:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv())),
      /auth_session_cleanup_incomplete/,
    );
    // Continue trying to revoke the second issued token after the first fails.
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
    assert.equal(fake.calls.filter(x=>x.path==='/rest/v1/knowledge_documents').length,6);
  }finally{fake.restore();}
});
test('cleanup error is never suppressed even after detected tenant data leakage',async()=>{
  const fake=installSyntheticFetch({leak:true,logoutFailure:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv())),
      /auth_session_cleanup_incomplete/,
    );
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
  }finally{fake.restore();}
});

test('KB-06F live-actor mode requires own tenant, denies other/anonymous/revoked, and never writes knowledge or consent',async()=>{
  const fake=installSyntheticFetch();
  try{
    const result=await runKbStagingReadOnlyAcceptance(
      validateKbStagingEnvironment(baseEnv()),{checkConsentActor:true});
    assert.equal(result.stage,'KB06F');
    assert.equal(result.result,'passed_read_only_knowledge_and_consent_actor_checks');
    assert.equal(result.checks,20);
    assert.equal(result.consentActorChecks,8);
    assert.equal(result.knowledgeWrites,0);
    assert.equal(result.consentWrites,0);
    assert.equal(result.independentStagingAcceptanceVerified,false);
    assert.equal(result.authorizesCrawlOrRelease,false);
    assert.equal(result.localSessionRevocationsAcknowledged,2);
    const calls=fake.calls.filter(x=>x.path==='/rest/v1/rpc/kb_discovery_consent_actor_v1');
    assert.equal(calls.length,8);
    assert.ok(calls.every(x=>x.method==='GET'));
    const writes=fake.calls.filter(x=>x.method==='POST');
    assert.equal(writes.length,4);
    assert.ok(writes.every(x=>['/auth/v1/token','/auth/v1/logout'].includes(x.path)));
    assert.equal(writes.filter(x=>x.path==='/auth/v1/logout').length,2);
    assert.ok(fake.calls.every(x=>!x.url.includes('doaozrkrtgeslddwhclj')));
  }finally{fake.restore();}
});
test('KB-06F rejects cross-tenant consent actor authority and still revokes both sessions',async()=>{
  const fake=installSyntheticFetch({consentActorCrossTenantLeak:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv()),
        {checkConsentActor:true}),/consent_actor_cross_tenant_or_revocation_leak/);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
  }finally{fake.restore();}
});
test('KB-06F missing own session or RPC cannot become an isolation pass',async()=>{
  for(const configuration of [
    {consentActorMissingPositive:true},
    {consentActorMalformed:true},
  ]){
    const fake=installSyntheticFetch(configuration);
    try{
      await assert.rejects(
        runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv()),
          {checkConsentActor:true}),/consent_actor_own_session_unverified/);
      assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
    }finally{fake.restore();}
  }
});
test('KB-06F detects a still-active stale bearer after local logout',async()=>{
  const fake=installSyntheticFetch({consentActorRevokedStillAllowed:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv()),
        {checkConsentActor:true}),/consent_actor_cross_tenant_or_revocation_leak/);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
    assert.equal(fake.calls.filter(x=>x.path==='/rest/v1/rpc/kb_discovery_consent_actor_v1').length,7);
  }finally{fake.restore();}
});
test('KB-06F requires anonymous execute denial, not an empty successful response',async()=>{
  const fake=installSyntheticFetch({consentActorAnonAllowed:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv()),
        {checkConsentActor:true}),/consent_actor_anon_permission_not_denied/);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
  }finally{fake.restore();}
});
test('KB-06F rejected projects and forged preflight never cause network requests',async()=>{
  const genuine=validateKbStagingEnvironment(baseEnv());
  let requests=0;
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{requests++;throw Error('unreachable');};
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance({...genuine},{checkConsentActor:true}),
      /unvalidated_runtime_configuration/);
    assert.equal(requests,0);
    const forbidden=baseEnv();
    forbidden.SALSYS_KB_STAGING_PROJECT_REF=FORBIDDEN_PROJECT_REFS[0];
    forbidden.OPERATOR_STAGING_PROJECT_REF=FORBIDDEN_PROJECT_REFS[0];
    forbidden.SALSYS_KB_STAGING_API_URL='https://'+FORBIDDEN_PROJECT_REFS[0]+'.supabase.co';
    expectBlocked(forbidden,/project_not_dedicated_staging/);
    assert.equal(requests,0);
  }finally{globalThis.fetch=original;}
});

const bindingEnv=()=>{
  const env=baseEnv();
  env.SALSYS_KB_STAGING_BINDING_APPROVAL_PHRASE=SESSION_BINDING_APPROVAL_PHRASE;
  env.SALSYS_KB_STAGING_BINDING_WRITES_READY=SESSION_BINDING_ENVIRONMENT_READY;
  return env;
};

test('KB-06H requires independent operator phrase and environment approval BEFORE network',async()=>{
  for(const variation of [
    Object.assign(baseEnv(),{SALSYS_KB_STAGING_BINDING_APPROVAL_PHRASE:SESSION_BINDING_APPROVAL_PHRASE}),
    Object.assign(baseEnv(),{SALSYS_KB_STAGING_BINDING_WRITES_READY:SESSION_BINDING_ENVIRONMENT_READY}),
    Object.assign(bindingEnv(),{SALSYS_KB_STAGING_BINDING_APPROVAL_PHRASE:'unapproved'}),
    Object.assign(bindingEnv(),{SALSYS_KB_STAGING_BINDING_WRITES_READY:'unapproved'}),
  ]){
    expectBlocked(variation,/independent_session_binding_approval_missing/);
  }
  assert.equal(validateKbStagingEnvironment(baseEnv()).allowSessionBinding,false);
  assert.equal(validateKbStagingEnvironment(bindingEnv()).allowSessionBinding,true);
  let requests=0;
  const original=globalThis.fetch;
  globalThis.fetch=()=>{requests++;throw Error('network prohibited');};
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv()),
        {checkConsentActor:true,bindTestSessions:true}),
      /independent_session_binding_approval_missing/);
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(bindingEnv()),
        {checkConsentActor:false,bindTestSessions:true}),
      /independent_session_binding_approval_missing/);
    await assert.rejects(
      runKbStagingReadOnlyAcceptance({...validateKbStagingEnvironment(bindingEnv())},
        {checkConsentActor:true,bindTestSessions:true}),
      /unvalidated_runtime_configuration/);
    assert.equal(requests,0);
  }finally{globalThis.fetch=original;}
});

test('KB-06H bound mode uses only two authenticated membership-checked staging RPC writes',async()=>{
  const fake=installSyntheticFetch({enforceSessionBinding:true});
  try{
    const result=await runKbStagingReadOnlyAcceptance(
      validateKbStagingEnvironment(bindingEnv()),
      {checkConsentActor:true,bindTestSessions:true});
    assert.equal(result.stage,'KB06H');
    assert.equal(result.result,
      'passed_staging_session_binding_and_read_only_knowledge_consent_checks');
    assert.equal(result.checks,20);
    assert.equal(result.consentActorChecks,8);
    assert.equal(result.stagingSessionBindingWrites,2);
    assert.equal(result.knowledgeWrites,0);
    assert.equal(result.consentWrites,0);
    assert.equal(result.independentStagingAcceptanceVerified,false);
    assert.equal(result.authorizesCrawlOrRelease,false);
    assert.equal(result.localSessionRevocationsAcknowledged,2);
    const binds=fake.calls.filter(x=>x.path==='/rest/v1/rpc/bind_current_tenant_session');
    assert.equal(binds.length,2);
    assert.ok(binds.every(x=>x.method==='POST'));
    assert.ok(fake.calls.filter(x=>x.method==='POST').every(x=>[
      '/auth/v1/token','/auth/v1/logout','/rest/v1/rpc/bind_current_tenant_session',
    ].includes(x.path)));
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
    assert.equal(fake.calls.filter(x=>
      x.path==='/rest/v1/rpc/kb_discovery_consent_actor_v1').length,8);
  }finally{fake.restore();}
});

test('KB-06H strict actor really fails without binding, even with fresh valid JWT',async()=>{
  const fake=installSyntheticFetch({enforceSessionBinding:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv()),
        {checkConsentActor:true}),
      /consent_actor_own_session_unverified/);
    assert.equal(fake.calls.filter(x=>
      x.path==='/rest/v1/rpc/bind_current_tenant_session').length,0);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
  }finally{fake.restore();}
});

test('KB-06H failure during second tenant binding revokes both test Auth sessions',async()=>{
  const fake=installSyntheticFetch({enforceSessionBinding:true,bindFailure:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(bindingEnv()),
        {checkConsentActor:true,bindTestSessions:true}),
      /session_binding_unverified/);
    assert.equal(fake.calls.filter(x=>
      x.path==='/rest/v1/rpc/bind_current_tenant_session').length,2);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
    assert.equal(fake.calls.filter(x=>x.path==='/rest/v1/knowledge_documents').length,0);
  }finally{fake.restore();}
});

test('KB-06H refuses malformed session bind receipt and still signs out',async()=>{
  const fake=installSyntheticFetch({enforceSessionBinding:true,badBindingResult:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(bindingEnv()),
        {checkConsentActor:true,bindTestSessions:true}),
      /session_binding_unverified/);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
  }finally{fake.restore();}
});

test('KB-06H revocation leak fails after successful session binds',async()=>{
  const fake=installSyntheticFetch({
    enforceSessionBinding:true,consentActorRevokedStillAllowed:true,
  });
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(bindingEnv()),
        {checkConsentActor:true,bindTestSessions:true}),
      /consent_actor_cross_tenant_or_revocation_leak/);
    assert.equal(fake.calls.filter(x=>x.path==='/auth/v1/logout').length,2);
  }finally{fake.restore();}
});

test('KB-06H original read-only mode remains free of any session binding writes',async()=>{
  const fake=installSyntheticFetch();
  try{
    const result=await runKbStagingReadOnlyAcceptance(
      validateKbStagingEnvironment(bindingEnv()),
      {checkConsentActor:false,bindTestSessions:false});
    assert.equal(result.stage,'KB05D');
    assert.equal(result.stagingSessionBindingWrites,0);
    assert.equal(fake.calls.some(x=>
      x.path==='/rest/v1/rpc/bind_current_tenant_session'),false);
  }finally{fake.restore();}
});
