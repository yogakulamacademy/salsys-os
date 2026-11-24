const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('inbound gate distinguishes explicit denial from lookup failure', async () => {
  const oldAccess=process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED;
  const oldSignup=process.env.SALSYS_PUBLIC_SIGNUP_ENABLED;
  try {
    const { commercialInboundAllowed }=load('lib/commercial/inbound-access.ts',{'server-only':{}});
    process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED='true';
    process.env.SALSYS_PUBLIC_SIGNUP_ENABLED='false';
    for(const channel of ['whatsapp','instagram']) {
      let result={data:true,error:null};
      const admin={rpc:async(name,args)=>{
        assert.equal(name,'signup_integration_allowed_v1');
        assert.deepEqual(args,{p_organization_id:ORG,p_code:channel});
        return result;
      }};
      assert.equal(await commercialInboundAllowed(admin,ORG,channel),true);
      result={data:false,error:null};
      assert.equal(await commercialInboundAllowed(admin,ORG,channel),false);
      result={data:null,error:null};
      await assert.rejects(commercialInboundAllowed(admin,ORG,channel),/authorization unavailable/);
      result={data:true,error:{message:'Synthetic outage'}};
      await assert.rejects(commercialInboundAllowed(admin,ORG,channel),/authorization unavailable/);
    }
    process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED='false';
    process.env.SALSYS_PUBLIC_SIGNUP_ENABLED='true';
    await assert.rejects(commercialInboundAllowed({},ORG,'whatsapp'),/authorization unavailable/);
    process.env.SALSYS_PUBLIC_SIGNUP_ENABLED='false';
    assert.equal(await commercialInboundAllowed({},ORG,'whatsapp'),true);
  } finally {
    for(const [key,value] of [['SALSYS_COMMERCIAL_ACCESS_ENABLED',oldAccess],['SALSYS_PUBLIC_SIGNUP_ENABLED',oldSignup]]) {
      if(value===undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
});

test('operational CSV transfer intersects role, session, commercial scope and PII permission', async () => {
  const oldAccess=process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED;
  const oldSignup=process.env.SALSYS_PUBLIC_SIGNUP_ENABLED;
  try {
    process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED='true';
    process.env.SALSYS_PUBLIC_SIGNUP_ENABLED='false';
    let scope=true, role='owner', pii=true, currentOrg=ORG, calls=0;
    const policy=load('lib/leads-transfer-policy.ts');
    const { getLeadsTransferPermissions }=load('lib/leads-transfer-permissions.ts',{
      'server-only':{},
      '@/lib/leads-transfer-policy':policy,
      '@/lib/commercial/signup-plan':{
        getCurrentSignupPlan:async()=>{calls++;return {workspaceCodes:scope?['sales']:['admin']}},
        signupPlanAllowsWorkspace:(plan,code)=>plan.workspaceCodes.includes(code),
      },
    });
    const db={rpc:async name=>{
      if(name==='get_current_workspace_context_v1') return {data:{organization_id:currentOrg,role,workspace_codes:['sales']},error:null};
      if(name==='can_view_lead_pii') return {data:pii,error:null};
      throw Error('unexpected RPC');
    }};
    const denied={canExport:false,canImport:false,canExportContacts:false};
    assert.deepEqual(await getLeadsTransferPermissions(db,USER,ORG),{canExport:true,canImport:true,canExportContacts:true});
    scope=false;
    assert.deepEqual(await getLeadsTransferPermissions(db,USER,ORG),denied);
    scope=true;pii=false;
    assert.deepEqual(await getLeadsTransferPermissions(db,USER,ORG),{canExport:true,canImport:false,canExportContacts:false});
    const before=calls;
    currentOrg=USER;
    assert.deepEqual(await getLeadsTransferPermissions(db,USER,ORG),denied);
    assert.equal(calls,before);
    currentOrg=ORG;
    process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED='false';
    process.env.SALSYS_PUBLIC_SIGNUP_ENABLED='true';
    assert.deepEqual(await getLeadsTransferPermissions(db,USER,ORG),denied);
  } finally {
    for(const [key,value] of [['SALSYS_COMMERCIAL_ACCESS_ENABLED',oldAccess],['SALSYS_PUBLIC_SIGNUP_ENABLED',oldSignup]]) {
      if(value===undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
});
