import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectValidatedStagingJwtClaims,
} from '../../scripts/verify-kb-staging-jwt-claims.mjs';

const PROJECT_URL='https://kb05dstagingfixturea.supabase.co';
const USER='10000000-0000-4000-8000-000000000001';
const SESSION='40000000-0000-4000-8000-000000000001';
const NOW=Date.parse('2026-11-06T16:00:00Z');
const seconds=NOW/1000;
const encode=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
function jwt(override={}){
  const payload={
    iss:PROJECT_URL+'/auth/v1',
    sub:USER,
    aud:'authenticated',
    role:'authenticated',
    session_id:SESSION,
    iat:seconds-5,
    exp:seconds+3600,
    ...override,
  };
  return [encode({alg:'HS256',typ:'JWT'}),encode(payload),
    Buffer.from('test-signature-placeholder').toString('base64url')].join('.');
}
function inspect(token,overrides={}){
  return inspectValidatedStagingJwtClaims(token,{
    userId:USER,apiUrl:PROJECT_URL,nowMs:NOW,...overrides,
  });
}

test('after authoritative Auth user check, claims must match expected project, user, role and fresh session',()=>{
  const r=inspect(jwt());
  assert.deepEqual(r,{
    userId:USER,sessionId:SESSION,tokenExpiresAt:seconds+3600,
    issuerMatched:true,audienceMatched:true,roleMatched:true,
    databaseTenantSessionBindingVerified:false,
  });
  assert.ok(Object.isFrozen(r));
});
test('wrong account or project issuer cannot pass claims inspection',()=>{
  for(const change of [
    {sub:'10000000-0000-4000-8000-000000000009'},
    {iss:'https://different-project.supabase.co/auth/v1'},
    {iss:'http://kb05dstagingfixturea.supabase.co/auth/v1'},
    {role:'service_role'},
    {role:'anon'},
    {aud:'anon'},
    {aud:['anon']},
  ]){
    assert.throws(()=>inspect(jwt(change)),/identity_or_issuer_mismatch/);
  }
  assert.throws(()=>inspect(jwt(),{userId:'bad'}),/invalid_context/);
  assert.throws(()=>inspect(jwt(),{apiUrl:'https://evil.example.com'}),/invalid_context/);
});
test('missing, malformed or mismatched session claim must deny, never fall back to singleton membership',()=>{
  for(const session_id of [undefined,null,'','not-a-uuid',
    '00000000-0000-0000-0000-000000000000']){
    assert.throws(()=>inspect(jwt({session_id})),/missing_bound_session_claim/);
  }
});
test('expired or future-issued tokens fail closed with bounded clock skew',()=>{
  for(const patch of [
    {exp:seconds-1},
    {exp:seconds+90},
    {iat:seconds+61},
    {iat:seconds-86401},
    {iat:seconds+3601,exp:seconds+7200},
    {iat:seconds-5,exp:seconds-10},
    {nbf:seconds+61},
    {iat:'yesterday'},
    {exp:'next week'},
  ]){
    assert.throws(()=>inspect(jwt(patch)),/expired_or_invalid_lifetime/);
  }
});
test('alg none, missing signatures, oversized or malformed JWTs are rejected',()=>{
  assert.throws(()=>inspect('nope'),/invalid_context/);
  assert.throws(()=>inspect('invalid.'.repeat(40)),/malformed_token|malformed_json|invalid_context/);
  const noSig=[encode({alg:'HS256',typ:'JWT'}),
    encode({sub:USER}), 'x'].join('.');
  assert.throws(()=>inspect(noSig),/malformed_token/);
  const none=[encode({alg:'none',typ:'JWT'}),
    encode({sub:USER}), Buffer.from('signature').toString('base64url')].join('.');
  assert.throws(()=>inspect(none),/unsupported_header/);
  const bad=[encode({alg:'HS256',typ:'JWT'}),
    'notvalidjson',Buffer.from('signature').toString('base64url')].join('.');
  assert.throws(()=>inspect(bad),/malformed_json/);
});
test('array audience accepted only with authenticated and no DB rights ever granted',()=>{
  const r=inspect(jwt({aud:['authenticated','another']}));
  assert.equal(r.roleMatched,true);
  assert.equal(r.databaseTenantSessionBindingVerified,false);
});
