/**
 * KB-05E: read-only JWT claim consistency check for a REAL staging Auth
 * session. Decoding here is NOT signature verification; the caller MUST have
 * already received an authoritative 200 response from this project's
 * /auth/v1/user using this exact access token.
 *
 * No network, storage, key management, signing or authorization decisions.
 * Even successful claims do not prove a tenant_session_bindings DB record.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEGMENT=/^[A-Za-z0-9_-]+$/;

function deny(reason){
  throw new Error('kb_staging_jwt_'+reason);
}
function decodePart(value){
  if(typeof value!=='string'||value.length<2||value.length>16000||
    !SEGMENT.test(value))deny('malformed_encoding');
  try{
    const json=Buffer.from(value,'base64url').toString('utf8');
    const obj=JSON.parse(json);
    if(!obj||typeof obj!=='object'||Array.isArray(obj))deny('malformed_json');
    return obj;
  }catch{
    deny('malformed_json');
  }
}

/**
 * Call only after /auth/v1/user has validated the SAME bearer token.
 * Expected values come from the protected staging config, not user claims.
 */
export function inspectValidatedStagingJwtClaims(
  token,{userId,apiUrl,nowMs=Date.now()}={}
){
  if(typeof token!=='string'||token.length<50||token.length>16000||
     typeof userId!=='string'||!UUID.test(userId)||
     typeof apiUrl!=='string'||!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(apiUrl)||
     !Number.isSafeInteger(nowMs)||nowMs<=0){
    deny('invalid_context');
  }
  const parts=token.split('.');
  if(parts.length!==3||!SEGMENT.test(parts[2])||parts[2].length<8){
    deny('malformed_token');
  }
  const header=decodePart(parts[0]);
  const claims=decodePart(parts[1]);
  if(!['HS256','RS256','ES256'].includes(header.alg)||
     (header.typ!==undefined&&header.typ!=='JWT')){
    deny('unsupported_header');
  }
  if(claims.sub!==userId||claims.role!=='authenticated'||
     claims.iss!==apiUrl+'/auth/v1'||
     !(claims.aud==='authenticated'||
       (Array.isArray(claims.aud)&&claims.aud.includes('authenticated')))){
    deny('identity_or_issuer_mismatch');
  }
  if(typeof claims.session_id!=='string'||!UUID.test(claims.session_id)){
    deny('missing_bound_session_claim');
  }
  // 90-second minimum remaining validity and 60-second clock-skew allowance.
  const seconds=Math.floor(nowMs/1000);
  if(!Number.isSafeInteger(claims.iat)||claims.iat>seconds+60||
     claims.iat<seconds-86400||
     !Number.isSafeInteger(claims.exp)||claims.exp<=seconds+90||
     claims.exp<=claims.iat||
     (claims.nbf!==undefined&&
      (!Number.isSafeInteger(claims.nbf)||claims.nbf>seconds+60))){
    deny('expired_or_invalid_lifetime');
  }
  return Object.freeze({
    userId:claims.sub,
    sessionId:claims.session_id.toLowerCase(),
    tokenExpiresAt:claims.exp,
    issuerMatched:true,
    audienceMatched:true,
    roleMatched:true,
    // Decoded claims alone do not grant database privileges.
    databaseTenantSessionBindingVerified:false,
  });
}
