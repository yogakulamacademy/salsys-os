'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { useMockData } from '@/lib/config';
import { requireCurrentOrganizationId } from '@/lib/workspace';

const allowedAdjustmentTypes = [
  'scholarship',
  'discount',
  'fee_waiver',
  'price_change',
  'contract_correction',
  'other',
] as const;

type ContractAdjustmentType = (typeof allowedAdjustmentTypes)[number];

type ContractAdjustmentResult = {
  ok?: boolean;
  overpayment_review_required?: boolean;
  cash_changed?: boolean;
};

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function leadUrl(leadId: string, key: 'notice' | 'error', value: string) {
  return `/leads/${encodeURIComponent(leadId)}?${key}=${encodeURIComponent(value)}`;
}

export async function applyEnrollmentContractAdjustmentAction(
  leadId: string,
  formData: FormData,
) {
  const enrollmentId = textValue(formData, 'enrollment_id');
  const adjustmentType = textValue(formData, 'adjustment_type');
  const rawNewTotal = textValue(formData, 'new_total_value');
  const reason = textValue(formData, 'reason');
  const idempotencyKey = textValue(formData, 'idempotency_key');

  if (!enrollmentId) {
    redirect(leadUrl(leadId, 'error', 'A canonical enrollment is required before adjusting contract value.'));
  }

  if (!allowedAdjustmentTypes.includes(adjustmentType as ContractAdjustmentType)) {
    redirect(leadUrl(leadId, 'error', 'Choose a valid contract adjustment type.'));
  }

  const newTotal = rawNewTotal === null ? Number.NaN : Number(rawNewTotal);
  if (!Number.isFinite(newTotal) || newTotal < 0) {
    redirect(leadUrl(leadId, 'error', 'Enter a valid new agreed contract value.'));
  }

  if (!reason || reason.length > 1000) {
    redirect(leadUrl(leadId, 'error', 'Add an approval reason of up to 1000 characters.'));
  }

  if (!idempotencyKey || idempotencyKey.length > 240) {
    redirect(leadUrl(leadId, 'error', 'This adjustment request is missing a valid request key. Refresh and try again.'));
  }

  if (useMockData) {
    redirect(leadUrl(leadId, 'notice', 'mock-contract-adjustment'));
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(leadUrl(leadId, 'error', 'Your session has expired. Please sign in again.'));
  }

  let organizationId: string;
  try {
    organizationId = await requireCurrentOrganizationId(supabase, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve the active organization.';
    redirect(leadUrl(leadId, 'error', message));
  }

  const enrollmentResult = await supabase
    .from('enrollments')
    .select('id, lead_id, organization_id')
    .eq('id', enrollmentId)
    .eq('lead_id', leadId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (enrollmentResult.error) {
    redirect(leadUrl(leadId, 'error', enrollmentResult.error.message));
  }

  if (!enrollmentResult.data) {
    redirect(leadUrl(leadId, 'error', 'The selected enrollment does not belong to this lead and organization.'));
  }

  const { data, error } = await supabase.rpc('apply_enrollment_contract_adjustment_v1', {
    p_organization_id: organizationId,
    p_enrollment_id: enrollmentId,
    p_adjustment_type: adjustmentType,
    p_new_total_value: newTotal,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
    p_metadata: {
      source: 'lead_detail_contract_value',
      lead_id: leadId,
    },
  });

  if (error) {
    redirect(leadUrl(leadId, 'error', error.message));
  }

  const result = (data ?? {}) as ContractAdjustmentResult;
  if (result.ok !== true || result.cash_changed === true) {
    redirect(leadUrl(leadId, 'error', 'The contract adjustment did not complete safely. No cash action was requested.'));
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/admissions');
  revalidatePath('/revenue');
  revalidatePath('/revenue/forecast');

  redirect(
    leadUrl(
      leadId,
      'notice',
      result.overpayment_review_required
        ? 'contract-adjusted-overpayment'
        : 'contract-adjusted',
    ),
  );
}
