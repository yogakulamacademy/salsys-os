import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { useMockData } from '@/lib/config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PLAN_CODES = ['free','basic','growth','pro'] as const;
export type PlanCode = typeof PLAN_CODES[number];
export type PlanSnapshot = {
  display_name: string; amount_minor: number; setup_min_minor: number;
  setup_max_minor: number; setup_optional: boolean; tax_treatment: 'inclusive'|'exclusive';
  named_users: number; lead_records: number; workspace_codes: string[]; integration_codes: string[];
};
export type PlanRequest = {
  id:string; plan_code:PlanCode; expected_plan_version:number; snapshot:PlanSnapshot;
  snapshot_sha256:string; rationale:string; author_user_id:string;
  reviewer_user_id:string|null; status:'draft'|'under_review'|'reviewed_for_design'|'rejected';
  revision:number; created_at:string;
};
export type PlanReviewState = { actorId:string; may_author:boolean; may_review:boolean; may_publish:boolean;
  authorized_request_ids:string[]; published_request_ids:string[]; publicationEnabled:boolean;
  requests:PlanRequest[]; versions:Partial<Record<PlanCode,number>> };

export async function requirePlanAdminActor(): Promise<string> {
  const platform = process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID?.trim() ?? '';
  if (useMockData || process.env.SALSYS_PLAN_ADMIN_ENABLED !== 'true' || !UUID.test(platform)) {
    throw new Error('Commercial administration unavailable.');
  }
  const session = await createClient();
  const { data:{user},error } = await session.auth.getUser();
  if (error || !user?.id || user.is_anonymous || !user.email_confirmed_at) throw new Error('Access denied.');
  // No cookie-selected fallback, client-supplied actor, or role from user metadata.
  const current = await session.rpc('get_current_workspace_context_v1');
  const context = current.data;
  if (current.error || !context || (context.active_organization_id ?? context.organization_id) !== platform ||
      context.organization_slug !== 'salsysos' || !['owner','admin'].includes(context.role)) throw new Error('Access denied.');
  const [profile,member,org] = await Promise.all([
    session.from('profiles').select('active').eq('id',user.id).maybeSingle(),
    session.from('organization_members').select('role,active').eq('organization_id',platform).eq('user_id',user.id).maybeSingle(),
    session.from('organizations').select('id,slug,status').eq('id',platform).maybeSingle(),
  ]);
  if (profile.error || profile.data?.active !== true || member.error || member.data?.active !== true ||
      member.data?.role !== context.role || org.error || org.data?.id !== platform ||
      org.data?.slug !== 'salsysos' || org.data?.status !== 'active') throw new Error('Access denied.');
  return user.id;
}

export async function readPlanReviewState(): Promise<PlanReviewState> {
  const actorId = await requirePlanAdminActor();
  const {data,error} = await createAdminClient().rpc('commercial_read_plan_requests_v1',{p_actor:actorId});
  if (error || !data || typeof data.may_author !== 'boolean' || typeof data.may_review !== 'boolean' ||
      typeof data.may_publish !== 'boolean' || (!data.may_author && !data.may_review && !data.may_publish) || !Array.isArray(data.requests) ||
      !Array.isArray(data.authorized_request_ids) || !Array.isArray(data.published_request_ids) ||
      !data.versions || typeof data.versions !== 'object' || Array.isArray(data.versions)) throw new Error('Commercial review unavailable.');
  return {...data,actorId,publicationEnabled:process.env.SALSYS_PLAN_PUBLICATION_ENABLED === 'true'};
}

export async function createPlanProposal(code:PlanCode, expected:number, snapshot:PlanSnapshot, rationale:string) {
  const actorId = await requirePlanAdminActor();
  const {data,error} = await createAdminClient().rpc('commercial_create_plan_request_v1',{
    p_actor:actorId,p_code:code,p_expected:expected,p_snapshot:snapshot,p_rationale:rationale,
  });
  if(error || typeof data !== 'string' || !UUID.test(data)) throw new Error('Proposal could not be saved.');
  return data;
}

export async function transitionPlanProposal(id:string,revision:number,digest:string,action:'submit'|'review'|'reject',reason:string) {
  if(!UUID.test(id) || !Number.isInteger(revision) || revision<1 || revision>2 || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid proposal reference.');
  const actorId = await requirePlanAdminActor();
  const {data,error} = await createAdminClient().rpc('commercial_transition_plan_request_v1',{
    p_actor:actorId,p_request:id,p_revision:revision,p_digest:digest,p_action:action,p_reason:reason,
  });
  if(error || data!==true) throw new Error('Review could not be saved. Refresh the proposal.');
}

export async function publishInitialPlan(id:string,revision:number,digest:string) {
  if(process.env.SALSYS_PLAN_PUBLICATION_ENABLED !== 'true') throw Error('Publication unavailable.');
  if(!UUID.test(id)||revision!==3||! /^[a-f0-9]{64}$/.test(digest)) throw Error('Invalid proposal reference.');
  const actorId=await requirePlanAdminActor();
  const {data,error}=await createAdminClient().rpc('commercial_publish_initial_plan_v1',{
    p_actor:actorId,p_request:id,p_revision:revision,p_digest:digest,
  });
  if(error||typeof data!=='string'||!UUID.test(data)) throw Error('Publication not authorized or unavailable.');
  return data;
}
