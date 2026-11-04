'use server';

import {
  submitLeadInsightFeedback,
  type FeedbackResult,
  type FeedbackSubmission,
} from '@/lib/ai/lead-insight-feedback';

/** Staff-only feedback command; all authorization is server-side. */
export async function submitLeadInsightFeedbackAction(
  input: FeedbackSubmission,
): Promise<FeedbackResult> {
  return submitLeadInsightFeedback(input);
}
