'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { useMockData } from '@/lib/config';
import type { LeadStage } from '@/types/crm';

const allowedStages: LeadStage[] = [
  'new',
  'contacted',
  'engaged',
  'qualified',
  'high_intent',
  'payment_pending',
  'enrolled',
  'nurture',
  'not_now',
  'lost',
  'unqualified',
  'duplicate',
];

export type PipelineStageResult =
  | { ok: true; mock?: boolean }
  | { ok: false; error: string };

export async function movePipelineLeadStage(
  leadId: string,
  newStage: LeadStage
): Promise<PipelineStageResult> {
  if (!leadId) {
    return { ok: false, error: 'Lead ID is required.' };
  }

  if (!allowedStages.includes(newStage)) {
    return { ok: false, error: 'Invalid pipeline stage.' };
  }

  if (useMockData) {
    return { ok: true, mock: true };
  }

  const supabase = await createClient();

  const { data: claims, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claims?.claims?.sub) {
    return {
      ok: false,
      error: 'Your session could not be verified. Please sign in again.',
    };
  }

  const { error } = await supabase.rpc('set_lead_stage', {
    p_lead_id: leadId,
    p_new_stage: newStage,
    p_changed_by_type: 'human',
    p_changed_by_id: claims.claims.sub,
    p_reason: 'Moved via pipeline drag and drop',
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/pipeline');
  revalidatePath('/dashboard');
  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/admissions');
  revalidatePath('/funnel');
  revalidatePath('/revenue');

  return { ok: true };
}
