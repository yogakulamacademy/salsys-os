'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function safeReturnPath(value: string | null) {
  if (!value || value.startsWith('//')) return '/leads';

  const allowed = ['/leads', '/pipeline', '/team-performance'];
  if (allowed.some((prefix) => value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}?`))) {
    return value;
  }

  return '/leads';
}

function withMessage(path: string, key: 'notice' | 'error', value: string) {
  const url = new URL(path, 'https://crm.local');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function revalidateLeadAssignment(leadId: string) {
  revalidatePath('/dashboard');
  revalidatePath('/admissions');
  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/pipeline');
  revalidatePath('/conversations');
  revalidatePath('/follow-ups');
  revalidatePath('/team-performance');
}

export async function assignLeadOwnerAction(formData: FormData) {
  const leadId = textValue(formData, 'lead_id');
  const ownerRaw = textValue(formData, 'owner_user_id');
  const returnTo = safeReturnPath(textValue(formData, 'return_to'));

  if (!leadId) {
    redirect(withMessage(returnTo, 'error', 'Lead is required.'));
  }

  const ownerUserId = !ownerRaw || ownerRaw === 'unassigned' ? null : ownerRaw;
  const supabase = await createClient();
  const { error } = await supabase.rpc('assign_lead_owner', {
    p_lead_id: leadId,
    p_owner_user_id: ownerUserId,
    p_sync_open_work: true,
  });

  if (error) {
    redirect(withMessage(returnTo, 'error', error.message));
  }

  revalidateLeadAssignment(leadId);
  redirect(withMessage(returnTo, 'notice', ownerUserId ? 'owner-updated' : 'owner-unassigned'));
}
