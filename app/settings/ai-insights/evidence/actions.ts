'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { savePilotEvidenceDraft } from '@/lib/ai/pilot-evidence-drafts';

/**
 * Owner-initiated save of non-sensitive reference IDs ONLY.
 * This is not a pilot signoff or activation action.
 */
export async function savePilotEvidenceDraftAction(formData: FormData): Promise<void> {
  await savePilotEvidenceDraft({
    privacy_ref: formData.get('privacy_ref'),
    retention_ref: formData.get('retention_ref'),
    provider_budget_ref: formData.get('provider_budget_ref'),
    quality_review_ref: formData.get('quality_review_ref'),
  });
  revalidatePath('/settings/ai-insights/evidence');
  redirect('/settings/ai-insights/evidence?saved=1');
}
