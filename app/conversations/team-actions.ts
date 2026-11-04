'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import type { LeadStage } from '@/types/crm';

const IST_OFFSET_MS = 330 * 60 * 1000;

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function conversationHref(leadId: string, key: 'notice' | 'error', value: string) {
  return `/conversations?lead=${encodeURIComponent(leadId)}&${key}=${encodeURIComponent(value)}`;
}

export async function assignConversationOwnerAction(
  leadId: string,
  formData: FormData,
) {
  if (useMockData) {
    redirect(conversationHref(leadId, 'notice', 'owner-updated'));
  }

  const ownerUserId = textValue(formData, 'owner_user_id');
  const supabase = await createClient();
  const { error } = await supabase.rpc('assign_lead_owner', {
    p_lead_id: leadId,
    p_owner_user_id: ownerUserId,
    p_sync_open_work: true,
  });

  if (error) {
    redirect(conversationHref(leadId, 'error', error.message));
  }

  revalidateConversationSurfaces(leadId);
  redirect(conversationHref(leadId, 'notice', 'owner-updated'));
}

export async function snoozeConversationAction(
  leadId: string,
  formData: FormData,
) {
  if (useMockData) {
    redirect(conversationHref(leadId, 'notice', 'conversation-snoozed'));
  }

  const mode = textValue(formData, 'snooze_for') ?? '1h';
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(conversationHref(leadId, 'error', 'Your session has expired. Please sign in again.'));
  }

  if (mode === 'clear') {
    const { error } = await supabase
      .from('lead_inbox_snoozes')
      .delete()
      .eq('user_id', user.id)
      .eq('lead_id', leadId);

    if (error) {
      redirect(conversationHref(leadId, 'error', error.message));
    }

    revalidatePath('/conversations');
    redirect(conversationHref(leadId, 'notice', 'conversation-unsnoozed'));
  }

  const snoozedUntil = resolveSnoozeUntil(mode);
  const { error } = await supabase.from('lead_inbox_snoozes').upsert(
    {
      user_id: user.id,
      lead_id: leadId,
      snoozed_until: snoozedUntil.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,lead_id' },
  );

  if (error) {
    redirect(conversationHref(leadId, 'error', error.message));
  }

  revalidatePath('/conversations');
  redirect(conversationHref(leadId, 'notice', 'conversation-snoozed'));
}


/** Resolves the inbox queue only. Open CRM tasks are not altered. */
export async function setConversationDoneAction(leadId: string, formData: FormData) {
  if (useMockData) {
    redirect(conversationHref(leadId,'error','Demo mode: inbox resolution is not persisted.'));
  }
  const operation = textValue(formData,'operation') === 'reopen' ? 'reopen' : 'done';
  const supabase = await createClient();
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError || !user) redirect(conversationHref(leadId,'error','Please sign in to update inbox status.'));
  const organizationId = await requireCurrentOrganizationId(supabase,user.id);
  const {data:canWork,error:workError} = await supabase.rpc('can_resolve_inbox_lead_v1',{p_lead_id:leadId});
  if(workError || canWork !== true) redirect(conversationHref(leadId,'error','You do not have permission to resolve this conversation.'));
  if(operation==='reopen'){
    const {error}=await supabase.from('lead_inbox_resolutions_v1').delete()
      .eq('organization_id',organizationId).eq('lead_id',leadId);
    if(error) redirect(conversationHref(leadId,'error',error.message));
  } else {
    const {error}=await supabase.from('lead_inbox_resolutions_v1').upsert({
      lead_id:leadId, organization_id:organizationId, resolved_by:user.id,
      resolved_at:new Date().toISOString(),
    },{onConflict:'lead_id'});
    if(error) redirect(conversationHref(leadId,'error',error.message));
  }
  revalidateConversationSurfaces(leadId);
  redirect(conversationHref(leadId,'notice',operation==='done'?'conversation-done':'conversation-reopened'));
}

const inboxStages:LeadStage[]=['new','contacted','engaged','qualified','high_intent',
  'payment_pending','enrolled','nurture','not_now','lost','unqualified','duplicate'];

export async function changeInboxLeadStageAction(leadId: string,formData: FormData) {
  if(useMockData) redirect(conversationHref(leadId,'error','Demo mode: stage changes are not persisted.'));
  const stage=textValue(formData,'stage');
  if(!stage || !inboxStages.includes(stage as LeadStage))
    redirect(conversationHref(leadId,'error','Please select a valid stage.'));
  const supabase=await createClient();
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user) redirect(conversationHref(leadId,'error','Please sign in to update this lead.'));
  await requireCurrentOrganizationId(supabase,user.id);
  const {data:canWork,error:permissionError}=await supabase.rpc('can_work_lead',{p_lead_id:leadId});
  if(permissionError||canWork!==true) redirect(conversationHref(leadId,'error','You do not have permission to update this stage.'));
  const {error}=await supabase.rpc('set_lead_stage',{
    p_lead_id:leadId,p_new_stage:stage,p_changed_by_type:'human',
    p_changed_by_id:user.id,p_reason:'Changed in conversation workspace',
  });
  if(error) redirect(conversationHref(leadId,'error',error.message));
  revalidateConversationSurfaces(leadId);
  revalidatePath('/pipeline');
  revalidatePath('/dashboard');
  redirect(conversationHref(leadId,'notice','inbox-stage-updated'));
}

function resolveSnoozeUntil(mode: string) {
  const now = new Date();

  if (mode === '4h') {
    return new Date(now.getTime() + 4 * 60 * 60 * 1000);
  }

  if (mode === 'tomorrow') {
    return nextIndiaMorning(now, 1);
  }

  if (mode === 'week') {
    return nextIndiaMorning(now, 7);
  }

  return new Date(now.getTime() + 60 * 60 * 1000);
}

function nextIndiaMorning(now: Date, daysAhead: number) {
  const indiaNow = new Date(now.getTime() + IST_OFFSET_MS);
  const targetUtcMs =
    Date.UTC(
      indiaNow.getUTCFullYear(),
      indiaNow.getUTCMonth(),
      indiaNow.getUTCDate() + daysAhead,
      9,
      0,
      0,
      0,
    ) - IST_OFFSET_MS;

  return new Date(targetUtcMs);
}

function revalidateConversationSurfaces(leadId: string) {
  revalidatePath('/conversations');
  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/admissions');
  revalidatePath('/team-performance');
  revalidatePath('/crm');
}
