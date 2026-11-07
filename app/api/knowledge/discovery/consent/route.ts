import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { readBoundedJson } from '@/lib/security/bounded-json-body';
import { isExplicitCrossSiteRequest } from '@/lib/security/fetch-metadata';
import { parseWebsiteSeed } from '@/lib/knowledge-discovery/url-policy';
import { discoveryVerificationHost } from '@/lib/knowledge-discovery/domain-verification';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
const json=(value:object,status=200)=>NextResponse.json(value,{status,headers:noStore});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST=/^[a-f0-9]{64}$/;
const ACK='I authorize read-only website discovery for this domain';

function sameOrigin(request:NextRequest){
  if(isExplicitCrossSiteRequest(request))return false;
  const origin=request.headers.get('origin');
  if(!origin)return request.headers.get('sec-fetch-site')==='same-origin';
  try{return new URL(origin).origin===request.nextUrl.origin;}catch{return false;}
}

async function verifiedAdmin(){
  const supabase=await createClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user||!UUID.test(user.id))return null;
  const organizationId=await requireCurrentOrganizationId(supabase,user.id);
  if(!UUID.test(organizationId??''))return null;
  const management=await supabase.rpc('can_manage_organization',{
    p_organization_id:organizationId,
  });
  if(management.error||management.data!==true)return null;
  return {supabase,organizationId,userId:user.id};
}

/** Read-only current consent and audit. Default-off avoids new tables on main. */
export async function GET(){
  try{
    const ctx=await verifiedAdmin();
    if(!ctx)return json({ok:false,error:'Unauthorized'},403);
    // KB-06D: read-only review is separately gated from grant writes.
    // Do not query unapplied consent tables on Production by default.
    const managementEnabled=
      process.env.KNOWLEDGE_DISCOVERY_CONSENT_MANAGEMENT_ENABLED==='true';
    const readEnabled=
      process.env.KNOWLEDGE_DISCOVERY_CONSENT_READ_ENABLED==='true';
    if(!managementEnabled&&!readEnabled)
      return json({ok:true,managementEnabled:false,readEnabled:false,records:[],audit:[]});
    const records=await ctx.supabase.from('knowledge_discovery_site_consents')
      .select('hostname,purpose,status,policy_version,granted_at,valid_until,withdrawn_at,revision')
      .eq('organization_id',ctx.organizationId).limit(30);
    if(records.error)throw records.error;
    const audit=await ctx.supabase.from('knowledge_discovery_consent_audit')
      .select('hostname,action,revision,occurred_at,policy_version,job_cancellations')
      .eq('organization_id',ctx.organizationId)
      .order('occurred_at',{ascending:false}).limit(50);
    if(audit.error)throw audit.error;
    return json({ok:true,managementEnabled,readEnabled:true,records:records.data??[],audit:audit.data??[]});
  }catch{return json({ok:false,error:'Consent state unavailable'},503);}
}

/**
 * Initial grant is intentionally unavailable without BOTH the server's
 * explicit operator-enabled switch AND the DB's independently reviewed
 * approved-policy registry. No new user can enable either by API call.
 */
export async function POST(request:NextRequest){
  if(!sameOrigin(request))return json({ok:false,error:'Origin rejected'},403);
  if(process.env.KNOWLEDGE_DISCOVERY_CONSENT_MANAGEMENT_ENABLED!=='true')
    return json({ok:false,error:'Consent management disabled'},503);
  const body=await readBoundedJson<{
    policyVersion?:unknown;
    policySha256?:unknown;
    validUntil?:unknown;
    acknowledgement?:unknown;
  }>(request,2048);
  if(!body.ok)return json({ok:false,error:body.error},body.status);
  const {policyVersion,policySha256,validUntil,acknowledgement}=body.value;
  if(typeof policyVersion!=='string'||policyVersion.trim().length<1||
      policyVersion.length>100||typeof policySha256!=='string'||
      !DIGEST.test(policySha256)||typeof validUntil!=='string'||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(validUntil)||
      !Number.isFinite(Date.parse(validUntil))||
      Date.parse(validUntil)<=Date.now()||
      Date.parse(validUntil)>Date.now()+7*24*60*60*1000||
      acknowledgement!==ACK)
    return json({ok:false,error:'Approved policy acknowledgement and bounded expiry required'},400);
  try{
    const ctx=await verifiedAdmin();
    if(!ctx)return json({ok:false,error:'Unauthorized'},403);
    const configured=await ctx.supabase.from('organization_onboarding')
      .select('website_url').eq('organization_id',ctx.organizationId).maybeSingle();
    if(configured.error||typeof configured.data?.website_url!=='string')
      return json({ok:false,error:'Configured website required'},409);
    const site=parseWebsiteSeed(configured.data.website_url);
    if(site.protocol!=='https:')return json({ok:false,error:'HTTPS website required'},400);
    const {data,error}=await ctx.supabase.rpc('grant_knowledge_discovery_consent_v1',{
      p_organization_id:ctx.organizationId,
      p_hostname:discoveryVerificationHost(site.hostname),
      p_policy_version:policyVersion,
      p_policy_sha256:policySha256,
      p_valid_until:validUntil,
      p_acknowledgement:acknowledgement,
    });
    if(error||data?.ok!==true)
      return json({ok:false,error:'Consent grant rejected by database policy'},403);
    return json({ok:true,status:'granted',revision:data.revision},201);
  }catch{return json({ok:false,error:'Consent grant unavailable'},503);}
}

/** Withdrawal remains available even if future grant configuration is OFF. */
export async function DELETE(request:NextRequest){
  if(!sameOrigin(request))return json({ok:false,error:'Origin rejected'},403);
  const body=await readBoundedJson<{hostname?:unknown;expectedRevision?:unknown}>(request,1024);
  if(!body.ok)return json({ok:false,error:body.error},body.status);
  const {hostname,expectedRevision}=body.value;
  if(typeof hostname!=='string'||hostname.length>253||
      !Number.isSafeInteger(expectedRevision)||
      (expectedRevision as number)<1){
    return json({ok:false,error:'Exact hostname and revision required'},400);
  }
  let host:string;
  try{
    const site=parseWebsiteSeed('https://'+hostname+'/');
    host=discoveryVerificationHost(site.hostname);
    if(site.hostname!==hostname||site.protocol!=='https:')
      return json({ok:false,error:'Invalid hostname'},400);
  }catch{return json({ok:false,error:'Invalid hostname'},400);}
  try{
    const ctx=await verifiedAdmin();
    if(!ctx)return json({ok:false,error:'Unauthorized'},403);
    // Use caller-bound Supabase Auth, NOT a service-role admin client.
    const {data,error}=await ctx.supabase.rpc('withdraw_knowledge_discovery_consent_v1',{
      p_organization_id:ctx.organizationId,
      p_hostname:host,
      p_expected_revision:expectedRevision,
    });
    if(error)return json({ok:false,error:'Consent withdrawal rejected'},403);
    if(data?.ok!==true)
      return json({ok:false,error:'Consent unavailable, stale or already withdrawn'},409);
    return json({ok:true,status:'withdrawn',
      revision:data.revision,jobsCancelled:data.jobsCancelled});
  }catch{return json({ok:false,error:'Consent withdrawal unavailable'},503);}
}
