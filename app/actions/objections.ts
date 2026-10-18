'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export const leadObjectionCategories = [
  'price',
  'timing',
  'trust',
  'schedule',
  'location',
  'accommodation',
  'certification',
  'health',
  'travel',
  'payment',
  'family',
  'work',
  'other',
] as const;

export type LeadObjectionCategory = (typeof leadObjectionCategories)[number];

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

async function getBoundLead(leadId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Authentication required.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id,organization_id')
    .eq('id', leadId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !lead) {
    throw new Error('Lead is not available in the current workspace.');
  }

  return { supabase, user, organizationId };
}

export async function recordLeadObjectionAction(leadId: string, formData: FormData) {
  const category = textValue(formData, 'category');
  const note = textValue(formData, 'note');

  if (!category || !leadObjectionCategories.includes(category as LeadObjectionCategory)) {
    redirect(`/leads/${leadId}/objections?error=${encodeURIComponent('Choose a valid objection category.')}`);
  }

  try {
    const { supabase, user, organizationId } = await getBoundLead(leadId);

    const { error } = await supabase.from('lead_objection_signals').insert({
      organization_id: organizationId,
      lead_id: leadId,
      category,
      status: 'active',
      evidence_kind: 'human',
      note,
      created_by: user.id,
    });

    if (error) throw error;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to record objection.';
    redirect(`/leads/${leadId}/objections?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/leads/${leadId}/objections`);
  revalidatePath('/sales-intelligence');
  redirect(`/leads/${leadId}/objections?notice=${encodeURIComponent('Objection recorded.')}`);
}

export async function resolveLeadObjectionAction(leadId: string, objectionId: string) {
  try {
    const { supabase, user, organizationId } = await getBoundLead(leadId);

    const { error } = await supabase
      .from('lead_objection_signals')
      .update({
        status: 'resolved',
        resolved_by: user.id,
      })
      .eq('id', objectionId)
      .eq('lead_id', leadId)
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    if (error) throw error;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve objection.';
    redirect(`/leads/${leadId}/objections?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/leads/${leadId}/objections`);
  revalidatePath('/sales-intelligence');
  redirect(`/leads/${leadId}/objections?notice=${encodeURIComponent('Objection resolved.')}`);
}
