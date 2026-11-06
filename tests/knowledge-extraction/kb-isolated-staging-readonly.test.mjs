import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXECUTION_PHRASE,
  FORBIDDEN_PROJECT_REFS,
  validateKbStagingEnvironment,
  documentPath,
  searchPath,
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
const baseEnv=()=>({
  SALSYS_KB_STAGING_RUN_APPROVAL:EXECUTION_PHRASE,
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
});
function mockedResponse(status,body){
  return {status, async json(){return body;}};
}
function installSyntheticFetch({leak=false,missingPositive=false,badUser=false}={}){
  const calls=[];
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
      return mockedResponse(200,{
        access_token:body.email===A.email?'synthetic-a-token':'synthetic-b-token',
        user:{id:badUser?'90000000-0000-4000-8000-000000000001':actor.userId},
      });
    }
    assert.equal(method,'GET');
    const token=init.headers.Authorization?.replace('Bearer ','')??'anon';
    const actor=token==='synthetic-a-token'?A:token==='synthetic-b-token'?B:null;
    if(pathname==='/auth/v1/user')return mockedResponse(200,{
      id:actor?.userId,
    });
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
    assert.equal(fake.calls.filter(x=>x.method==='POST').length,2);
    assert.ok(fake.calls.filter(x=>x.method==='POST').every(
      x=>x.path==='/auth/v1/token'));
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
  }finally{fake.restore();}
});
test('missing positive fixture fails, preventing vacuous isolation success',async()=>{
  const fake=installSyntheticFetch({missingPositive:true});
  try{
    await assert.rejects(
      runKbStagingReadOnlyAcceptance(validateKbStagingEnvironment(baseEnv())),
      /missing_positive_fixture/,
    );
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
