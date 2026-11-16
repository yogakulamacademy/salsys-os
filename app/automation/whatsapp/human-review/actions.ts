'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdminWorkspaceAccess } from '@/lib/route-access';
import { createClient } from '@/lib/supabase/server';

const RETURN_TO = '/automation/whatsapp/human-review';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

async function context() {
  if (process.env.SALSYS_DESKCOMM_HANDOFF_ACTIONS !== 'true' ||
      process.env.SALSYS_DESKCOMM_INBOUND_SHADOW !== 'true') {
    return null;
  }
  const workspace = await requireAdminWorkspaceAccess();
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { workspace, supabase, user };
}

function responseUrl(status: string) {
  return `${RETURN_TO}?status=${encodeURIComponent(status)}`;
}

/** Only a deliberate owner/admin click can create an assigned handoff. */
export async function claimDeskcommHumanReviewAction(form: FormData) {
  const ctx = await context();
  if (!ctx) redirect(responseUrl('disabled'));
  const rawEventId = String(form.get('raw_event_id') ?? '').trim();
  if (!UUID.test(rawEventId)) redirect(responseUrl('invalid'));
  const { data, error } = await ctx.supabase.rpc('open_verified_whatsapp_human_handoff_v1', {
    p_organization_id: ctx.workspace.organizationId,
    p_raw_event_id: rawEventId,
    p_assigned_to: ctx.user.id,
  });
  const result = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown> : {};
  if (error || result.ok !== true) redirect(responseUrl('unavailable'));
  revalidatePath(RETURN_TO);
  revalidatePath('/follow-ups');
  redirect(responseUrl(result.created === true ? 'assigned' : 'already_assigned'));
}

/**
 * Closing does not resume AI, un-cancel jobs, or authorize sending.
 * A later AI resumption requires a separately authorized new workflow.
 */
export async function closeDeskcommHumanReviewAction(form: FormData) {
  const ctx = await context();
  if (!ctx) redirect(responseUrl('disabled'));
  const handoffId = String(form.get('handoff_id') ?? '').trim();
  const resolution = String(form.get('resolution') ?? '');
  if (!UUID.test(handoffId) ||
      !['resolved_by_staff', 'dismissed_after_review'].includes(resolution)) {
    redirect(responseUrl('invalid'));
  }
  const { data, error } = await ctx.supabase.rpc('close_verified_whatsapp_human_handoff_v1', {
    p_organization_id: ctx.workspace.organizationId,
    p_handoff_id: handoffId,
    p_resolution: resolution,
  });
  const result = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown> : {};
  if (error || result.ok !== true) redirect(responseUrl('unavailable'));
  revalidatePath(RETURN_TO);
  revalidatePath('/follow-ups');
  redirect(responseUrl('closed'));
}

/**
 * Explicitly clear an already-closed human review hold. This never resumes,
 * reschedules or replays previously interrupted automation work.
 */
export async function releaseDeskcommHumanReviewHoldAction(form: FormData) {
  const ctx = await context();
  if (!ctx) redirect(responseUrl('disabled'));
  const handoffId = String(form.get('handoff_id') ?? '').trim();
  if (!UUID.test(handoffId)) redirect(responseUrl('invalid'));
  const { data, error } = await ctx.supabase.rpc(
    'release_verified_whatsapp_handoff_ai_hold_v1',
    {
      p_organization_id: ctx.workspace.organizationId,
      p_handoff_id: handoffId,
    },
  );
  const result = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown> : {};
  if (error || result.ok !== true) redirect(responseUrl('unavailable'));
  revalidatePath(RETURN_TO);
  redirect(responseUrl('hold_released'));
}
