const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers.cjs');

const policy = load('lib/ai/read-only-tool-gate-v1.ts', {
  'server-only': {},
  'node:crypto': crypto,
});

const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '10000000-0000-4000-8000-000000000002';
const ACTOR_A = '20000000-0000-4000-8000-000000000001';
const ACTOR_B = '20000000-0000-4000-8000-000000000002';
const SESSION_A = '30000000-0000-4000-8000-000000000001';
const SESSION_B = '30000000-0000-4000-8000-000000000002';
const LEAD_A = '40000000-0000-4000-8000-000000000001';
const LEAD_B = '40000000-0000-4000-8000-000000000002';

const request = (overrides={}) => ({
  toolId:'crm.course.list', organizationId:ORG_A, leadId:null, query:null,
  ...overrides,
});
const identity = (overrides={}) => ({
  organizationId:ORG_A, actorId:ACTOR_A, sessionId:SESSION_A,
  boundOrganizationId:ORG_A, role:'admin',
  sessionActive:true, membershipActive:true, organizationActive:true,
  ...overrides,
});
const harness = (options={}) => {
  const calls={auth:0,resource:0,audit:[],inputs:[]};
  const principal=options.principal??identity();
  const deps={
    async getCurrentPrincipal(){
      calls.auth++;
      if(options.authThrows)throw Error('private auth failed with sensitive diagnostics');
      return calls.auth===1 ? principal : (Object.hasOwn(options,'secondPrincipal') ? options.secondPrincipal : principal);
    },
    async checkCurrentResourceAccess(context,proposal){
      calls.resource++;
      calls.inputs.push({context,proposal});
      if(options.resourceThrows)throw Error('private database detail');
      if(typeof options.onResource==='function')options.onResource(context,proposal);
      // Synthetic DB authorization: only one specifically permitted lead;
      // never trust the proposal's claimed org/actor as authorization.
      if(proposal.toolId==='crm.lead.read'&&proposal.leadId!==LEAD_A)return false;
      return options.granted??true;
    },
    async appendAudit(event){
      calls.audit.push(event);
      if(options.auditThrows)throw Error('private audit store failure');
      return options.auditAccepted??true;
    },
  };
  return {calls,deps};
};

test('AI-09B is strictly source-only, disabled and not imported by Co-Pilot or Knowledge',()=>{
  const own=fs.readFileSync(path.resolve('lib/ai/read-only-tool-gate-v1.ts'),'utf8');
  assert.equal(policy.READ_ONLY_TOOL_GATE_RUNTIME_WIRED,false);
  assert.doesNotMatch(own,/\bfetch\s*\(|\bcreateClient\s*\(|\bcreateAdminClient\s*\(|\bexecuteTool\s*\(/);
  const copilot=fs.readFileSync(path.resolve('app/conversations/copilot-actions.ts'),'utf8');
  const knowledge=fs.readFileSync(path.resolve('app/settings/knowledge/actions.ts'),'utf8');
  assert.doesNotMatch(copilot,/read-only-tool-gate-v1/);
  assert.doesNotMatch(knowledge,/read-only-tool-gate-v1/);
  const blob=fs.readFileSync(path.resolve('app/settings/knowledge/actions.ts'));
  assert.equal(crypto.createHash('sha1').update('blob '+blob.length+'\0').update(blob).digest('hex'),
    '30a6ac02c91baefaf440fb979bf6cae94dbd031b');
});

test('adversarial request getters/proxies/prototypes deny before Auth but still emit a minimal audit',async()=>{
  const getter=request();
  Object.defineProperty(getter,'toolId',{enumerable:true,get(){throw Error('private accessor data');}});
  const throwingProxy=new Proxy(request(),{ownKeys(){throw Error('private proxy error');}});
  const badPrototype=Object.assign(Object.create({admin:true}),request());
  const symbolProperty=request();
  symbolProperty[Symbol('privileged')]=true;
  const nonEnumerable=request();
  Object.defineProperty(nonEnumerable,'hidden',{value:'actor override',enumerable:false});

  for(const proposal of [getter,throwingProxy,badPrototype,symbolProperty,nonEnumerable]){
    const h=harness();
    const result=await policy.reviewReadOnlyToolGate(proposal,h.deps);
    assert.equal(result.ok,false);
    assert.equal(result.reason,'invalid_tool_request');
    assert.equal(result.mayExecute,false);
    assert.equal(h.calls.auth,0);
    assert.equal(h.calls.resource,0);
    assert.equal(h.calls.audit.length,1);
    assert.equal(h.calls.audit[0].decision,'denied');
    assert.equal(h.calls.audit[0].toolId,null);
    assert.equal(h.calls.audit[0].actorId,null);
    assert.doesNotMatch(JSON.stringify(result),/private accessor data|private proxy error/);
    assert.doesNotMatch(JSON.stringify(h.calls.audit),/private accessor data|private proxy error/);
  }
});

test('untrusted principal getters, hostile proxy and custom role coercion cannot bypass denial audit',async()=>{
  const accessor=identity();
  Object.defineProperty(accessor,'sessionActive',{enumerable:true,get(){throw Error('sensitive session detail');}});
  const proxy=new Proxy(identity(),{getPrototypeOf(){throw Error('private trap detail');}});
  let coercions=0;
  const maliciousRole=identity({role:{toString(){coercions++;throw Error('role coercion called');}}});
  const prototypePrincipal=Object.assign(Object.create({tenantGrant:true}),identity());

  for(const principal of [accessor,proxy,maliciousRole,prototypePrincipal]){
    const h=harness({principal});
    const result=await policy.reviewReadOnlyToolGate(request(),h.deps);
    assert.equal(result.ok,false);
    assert.equal(result.reason,'unauthenticated_or_unbound');
    assert.equal(result.mayExecute,false);
    assert.equal(h.calls.auth,1);
    assert.equal(h.calls.resource,0);
    assert.equal(h.calls.audit.length,1);
    assert.equal(h.calls.audit[0].decision,'denied');
    assert.equal(h.calls.audit[0].actorId,null);
    assert.doesNotMatch(JSON.stringify(result),/sensitive session detail|role coercion called/);
  }
  assert.equal(coercions,0,'untrusted role objects must not execute coercion methods');
});

test('request and principal snapshots are detached from mutable caller-owned inputs',async()=>{
  const original=request();
  const principal=identity();
  const h=harness({principal,onResource(_context,proposal){
    original.organizationId=ORG_B;
    original.toolId='crm.lead.read';
    principal.organizationId=ORG_B;
    principal.role='viewer';
    assert.equal(proposal.organizationId,ORG_A);
    assert.equal(proposal.toolId,'crm.course.list');
    assert.equal(Object.isFrozen(proposal),true);
  }});
  const result=await policy.reviewReadOnlyToolGate(original,h.deps);
  assert.equal(result.ok,false,'changed current principal must trigger identity recheck denial');
  assert.equal(result.reason,'identity_changed');
  assert.equal(result.mayExecute,false);
  assert.equal(h.calls.audit.length,1);
  assert.equal(h.calls.audit[0].decision,'denied');
  assert.equal(h.calls.audit[0].organizationId,ORG_A);
});

test('audited course read is a review proposal, never a tool execution or data response',async()=>{
  const h=harness();
  const result=await policy.reviewReadOnlyToolGate(request(),h.deps);
  assert.equal(result.ok,true);
  assert.equal(result.decision,'review_eligible');
  assert.equal(result.mayExecute,false);
  assert.equal(result.executionStatus,'not_wired');
  assert.equal(result.toolId,'crm.course.list');
  assert.equal(result.organizationId,ORG_A);
  assert.equal(Object.hasOwn(result,'data'),false);
  assert.equal(Object.hasOwn(result,'invoke'),false);
  assert.equal(h.calls.auth,2);
  assert.equal(h.calls.resource,1);
  assert.equal(h.calls.audit.length,1);
  assert.equal(h.calls.audit[0].decision,'review_eligible');
  assert.equal(h.calls.audit[0].actorId,ACTOR_A);
  assert.match(result.traceId,/^[0-9a-f-]{36}$/);
  assert.equal(Object.isFrozen(h.calls.audit[0]),true);
  assert.equal(Object.isFrozen(result),true);
});

test('knowledge query is bounded and never appears in the audit or output',async()=>{
  const h=harness();
  const phrase='Synthetic course fee without any customer PII';
  const result=await policy.reviewReadOnlyToolGate(request({
    toolId:'knowledge.approved.search',query:phrase,
  }),h.deps);
  assert.equal(result.ok,true);
  assert.equal(result.mayExecute,false);
  assert.equal(JSON.stringify(h.calls.audit).includes(phrase),false);
  assert.equal(JSON.stringify(result).includes(phrase),false);
  assert.equal(h.calls.inputs[0].proposal.query,phrase);
  assert.equal(Object.isFrozen(h.calls.inputs[0].proposal),true);
});

test('lead proposals require a separately authorized exact lead scope',async()=>{
  const h=harness();
  const allowed=await policy.reviewReadOnlyToolGate(request({
    toolId:'crm.lead.read',leadId:LEAD_A,
  }),h.deps);
  assert.equal(allowed.ok,true);
  assert.equal(allowed.leadId,LEAD_A);
  assert.equal(allowed.mayExecute,false);
  const other=await policy.reviewReadOnlyToolGate(request({
    toolId:'crm.lead.read',leadId:LEAD_B,
  }),h.deps);
  assert.equal(other.ok,false);
  assert.equal(other.reason,'resource_denied');
  assert.equal(h.calls.audit.length,2);
  assert.equal(h.calls.audit[1].leadId,LEAD_B);
});

test('model-defined actor, role, session, permission, endpoint or tool callback is denied without looking up Auth',async()=>{
  const invalid=[
    {...request(),actorId:ACTOR_A},
    {...request(),role:'owner'},
    {...request(),sessionVerified:true},
    {...request(),permissions:['all']},
    {...request(),endpoint:'https://attacker.invalid'},
    {...request(),callback:'sendWhatsApp'},
    {...request(),sql:'select * from leads'},
    {...request(),method:'POST'},
    {...request(),approved:true},
  ];
  for(const proposal of invalid){
    const h=harness();
    const result=await policy.reviewReadOnlyToolGate(proposal,h.deps);
    assert.equal(result.ok,false,JSON.stringify(proposal));
    assert.equal(result.reason,'invalid_tool_request');
    assert.equal(h.calls.auth,0);
    assert.equal(h.calls.resource,0);
    assert.deepEqual(h.calls.audit.map(x=>x.decision),['denied']);
    assert.equal(h.calls.audit[0].actorId,null);
  }
});

test('unknown, mutating or arbitrary MCP tool IDs all fail before permission checks',async()=>{
  for(const toolId of [
    'crm.lead.update','crm.payment.refund','whatsapp.send','system.shell.exec',
    'mcp://agent/tool','crm.course.list;drop table leads','','__proto__',
  ]){
    const h=harness();
    const result=await policy.reviewReadOnlyToolGate(request({toolId}),h.deps);
    assert.equal(result.ok,false,toolId);
    assert.equal(h.calls.auth,0);
    assert.equal(h.calls.resource,0);
    assert.equal(h.calls.audit[0].toolId,null);
  }
});

test('search terms reject control characters, whitespace smuggling and oversized payloads',async()=>{
  for(const query of ['','a',' first','last ','a\nb','a\0b','x'.repeat(161),'a'.repeat(130)+'😊'.repeat(20)]){
    const h=harness();
    const result=await policy.reviewReadOnlyToolGate(request({
      toolId:'knowledge.approved.search',query,
    }),h.deps);
    assert.equal(result.ok,false,JSON.stringify(query));
    assert.equal(h.calls.auth,0);
  }
});

test('course/lead tools reject unexpected query and mixed lead scopes',async()=>{
  for(const proposal of [
    request({leadId:LEAD_A}),
    request({query:'course'}),
    request({toolId:'crm.lead.read',leadId:null}),
    request({toolId:'crm.lead.read',leadId:'not-a-uuid'}),
    request({toolId:'crm.lead.read',leadId:LEAD_A,query:'all'}),
    request({toolId:'knowledge.approved.search',leadId:LEAD_A,query:'known'}),
    request({organizationId:'no-tenant'}),
    {toolId:'crm.course.list',organizationId:ORG_A,leadId:null},
  ]){
    const h=harness();
    assert.equal((await policy.reviewReadOnlyToolGate(proposal,h.deps)).ok,false);
    assert.equal(h.calls.resource,0);
  }
});

test('request-supplied organization is only a hint and never changes authenticated tenant',async()=>{
  const h=harness();
  const result=await policy.reviewReadOnlyToolGate(request({organizationId:ORG_B}),h.deps);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'wrong_tenant');
  assert.equal(h.calls.resource,0);
  assert.equal(h.calls.auth,1);
  assert.equal(h.calls.audit[0].organizationId,ORG_A);
});

test('revoked session, inactive membership, or inactive organization fail before resource access',async()=>{
  for(const patch of [
    {sessionActive:false},{membershipActive:false},{organizationActive:false},
    {boundOrganizationId:ORG_B},{sessionId:null},
    {actorId:'invalid'},{role:'stranger'},
    {untrustedRole:'owner'},
  ]){
    const h=harness({principal:identity(patch)});
    const result=await policy.reviewReadOnlyToolGate(request(),h.deps);
    assert.equal(result.ok,false,JSON.stringify(patch));
    assert.equal(result.reason,'unauthenticated_or_unbound');
    assert.equal(h.calls.resource,0);
  }
});

test('member and viewer cannot even become read-review eligible in v1',async()=>{
  for(const role of ['member','viewer']){
    const h=harness({principal:identity({role})});
    const result=await policy.reviewReadOnlyToolGate(request(),h.deps);
    assert.equal(result.ok,false);
    assert.equal(result.reason,'role_not_eligible');
    assert.equal(h.calls.resource,0);
    assert.equal(h.calls.audit[0].decision,'denied');
  }
});

test('per-resource denial cannot be overridden by owner role',async()=>{
  const h=harness({principal:identity({role:'owner'}),granted:false});
  const result=await policy.reviewReadOnlyToolGate(request(),h.deps);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'resource_denied');
  assert.equal(h.calls.auth,1);
  assert.equal(h.calls.audit[0].decision,'denied');
});

test('identity rotation or session revocation during resource check is denied',async()=>{
  for(const secondPrincipal of [
    identity({sessionId:SESSION_B}),
    identity({actorId:ACTOR_B}),
    identity({organizationId:ORG_B,boundOrganizationId:ORG_B}),
    identity({role:'member'}),
    identity({sessionActive:false}),
    identity({membershipActive:false}),
    identity({organizationActive:false}),
    null,
  ]){
    const h=harness({secondPrincipal});
    const result=await policy.reviewReadOnlyToolGate(request(),h.deps);
    assert.equal(result.ok,false,JSON.stringify(secondPrincipal));
    assert.equal(result.reason,'identity_changed');
    assert.equal(h.calls.auth,2);
    assert.equal(h.calls.resource,1);
    assert.equal(h.calls.audit[0].decision,'denied');
  }
});

test('Auth and grant provider exceptions deny without exposing private errors',async()=>{
  for(const options of [{authThrows:true},{resourceThrows:true}]){
    const h=harness(options);
    const result=await policy.reviewReadOnlyToolGate(request(),h.deps);
    assert.equal(result.ok,false);
    assert.equal(result.reason,'verification_unavailable');
    assert.doesNotMatch(JSON.stringify(result),/private database|private auth/);
    assert.equal(h.calls.audit[0].decision,'denied');
  }
});

test('a refused, failed or unavailable audit writer always fails closed',async()=>{
  for(const options of [{auditAccepted:false},{auditAccepted:undefined},{auditThrows:true}]){
    // undefined is made explicit below so no implicit success on a truthy value.
    const h=harness(options);
    if(Object.hasOwn(options,'auditAccepted')&&options.auditAccepted===undefined){
      h.deps.appendAudit=async event=>{h.calls.audit.push(event);return undefined;};
    }
    const result=await policy.reviewReadOnlyToolGate(request(),h.deps);
    assert.equal(result.ok,false);
    assert.equal(result.reason,'audit_unavailable');
    assert.equal(result.mayExecute,false);
    assert.equal(h.calls.audit.length,1);
  }
});

test('simultaneous attempts each create a unique redacted audit trace',async()=>{
  const h=harness();
  const [a,b]=await Promise.all([
    policy.reviewReadOnlyToolGate(request(),h.deps),
    policy.reviewReadOnlyToolGate(request(),h.deps),
  ]);
  assert.equal(a.ok,true);
  assert.equal(b.ok,true);
  assert.notEqual(a.traceId,b.traceId);
  assert.equal(h.calls.audit.length,2);
  assert.ok(h.calls.audit.every(x=>Object.keys(x).length===8));
});

test('environment switch never enables any read tool or tool registry',async()=>{
  const prior=process.env.SALSYS_READONLY_TOOLS_ENABLED;
  try{
    process.env.SALSYS_READONLY_TOOLS_ENABLED='true';
    const h=harness();
    const result=await policy.reviewReadOnlyToolGate(request(),h.deps);
    assert.equal(policy.READ_ONLY_TOOL_GATE_RUNTIME_WIRED,false);
    assert.equal(result.executionStatus,'not_wired');
    assert.equal(result.mayExecute,false);
    assert.equal(Object.hasOwn(result,'execute'),false);
  }finally{
    if(prior===undefined)delete process.env.SALSYS_READONLY_TOOLS_ENABLED;
    else process.env.SALSYS_READONLY_TOOLS_ENABLED=prior;
  }
});
