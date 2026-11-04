import 'server-only';

import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import type { LeadContextV1 } from '@/lib/ai/lead-context';
import type { LeadInsightV1 } from '@/lib/ai/lead-insight-validation';

/**
 * Metadata-only, private C3 feedback ledger.
 *
 * No prompt, message body, staff note, AI-generated prose or customer contact
 * data is stored. Raw lead context is used only for an irreversible digest.
 * Both writes are guarded by fresh user/workspace/lead authorization.
 */
export type InsightFeedbackRating =
  | 'accurate' | 'partially_accurate' | 'inaccurate' | 'unsure';
export type InsightFeedbackIssue =
  | 'unsupported_claim' | 'wrong_intent' | 'wrong_objection'
  | 'wrong_next_action' | 'missing_context' | 'outdated_context'
  | 'privacy_concern' | 'other';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_RATINGS = new Set<InsightFeedbackRating>([
  'accurate', 'partially_accurate', 'inaccurate', 'unsure',
]);
const ALLOWED_ISSUES = new Set<InsightFeedbackIssue>([
  'unsupported_claim', 'wrong_intent', 'wrong_objection',
  'wrong_next_action', 'missing_context', 'outdated_context',
  'privacy_concern', 'other',
]);

type AuthorizedReviewer = {
  id: string;
  organizationId: string;
  session: Awaited<ReturnType<typeof createClient>>;
};

async function identifyReviewer(): Promise<AuthorizedReviewer | null> {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user?.id) return null;
  const organizationId = await requireCurrentOrganizationId(session, user.id);
  if (!organizationId) return null;
  return { id: user.id, organizationId, session };
}

async function canReviewLead(
  reviewer: AuthorizedReviewer,
  leadId: string,
): Promise<boolean> {
  const { data, error } = await reviewer.session.rpc('can_work_lead', {
    p_lead_id: leadId,
  });
  return !error && data === true;
}

function digestContext(context: LeadContextV1): string {
  const { generatedAt: _generatedAt, ...input } = context;
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function citedRefs(insight: LeadInsightV1): string[] {
  return [...new Set([
    ...insight.summary.evidenceRefs,
    ...insight.intent.evidenceRefs,
    ...insight.interests.flatMap(x => x.evidenceRefs),
    ...insight.objections.flatMap(x => x.evidenceRefs),
    ...insight.nextAction.evidenceRefs,
  ])].slice(0, 60);
}

/**
 * Called only after evidence validation and a successful C2 access recheck.
 * If feedback is not enabled, preserve the original read-only C2 behavior.
 * If enabled, failure to create an attributable receipt fails the operation.
 */
export async function recordLeadInsightRun(
  context: LeadContextV1,
  insight: LeadInsightV1,
  model: string,
): Promise<string | null> {
  if (process.env.AI_LEAD_INSIGHTS_FEEDBACK_ENABLED !== 'true') return null;
  if (context.audience !== 'staff_insight' || !context.staffOnly ||
      !UUID_RE.test(context.lead.id) || !UUID_RE.test(context.lead.organizationId)) {
    throw new Error('Unauthorized or malformed insight context.');
  }

  const reviewer = await identifyReviewer();
  if (!reviewer ||
      reviewer.organizationId !== context.lead.organizationId ||
      !(await canReviewLead(reviewer, context.lead.id))) {
    throw new Error('Lead access changed before receipt creation.');
  }

  const { data, error } = await createAdminClient()
    .from('ai_lead_insight_runs')
    .insert({
      organization_id: reviewer.organizationId,
      lead_id: context.lead.id,
      requested_by: reviewer.id,
      model_name: model.slice(0, 120),
      context_sha256: digestContext(context),
      insight_status: insight.status,
      intent_level: insight.intent.level,
      next_action_kind: insight.nextAction.kind,
      evidence_refs: citedRefs(insight),
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    // Do not expose database details, model output or source text.
    throw new Error('The AI review receipt could not be recorded.');
  }
  return String(data.id);
}

export type FeedbackSubmission = {
  runId: string;
  rating: InsightFeedbackRating;
  issueCodes: InsightFeedbackIssue[];
};

export type FeedbackResult =
  | { ok: true; reviewId: string }
  | { ok: false; error: string };

/**
 * One append-only review per staff user per insight receipt. No client-supplied
 * organization, lead or reviewer IDs are accepted.
 */
export async function submitLeadInsightFeedback(
  input: FeedbackSubmission,
): Promise<FeedbackResult> {
  if (process.env.AI_LEAD_INSIGHTS_FEEDBACK_ENABLED !== 'true') {
    return { ok: false, error: 'AI insight feedback is not enabled.' };
  }
  if (!input || typeof input !== 'object' ||
      typeof input.runId !== 'string' || !UUID_RE.test(input.runId) ||
      !ALLOWED_RATINGS.has(input.rating) ||
      !Array.isArray(input.issueCodes) || input.issueCodes.length > 5 ||
      input.issueCodes.some(x => !ALLOWED_ISSUES.has(x)) ||
      new Set(input.issueCodes).size !== input.issueCodes.length) {
    return { ok: false, error: 'Invalid AI feedback selection.' };
  }
  if (input.rating === 'accurate' && input.issueCodes.length > 0) {
    return { ok: false, error: 'Accurate feedback cannot include error reasons.' };
  }
  if (input.rating === 'inaccurate' && input.issueCodes.length === 0) {
    return { ok: false, error: 'Select at least one reason for an inaccurate result.' };
  }

  let reviewer: AuthorizedReviewer | null = null;
  try {
    reviewer = await identifyReviewer();
  } catch {
    return { ok: false, error: 'Your workspace cannot be verified.' };
  }
  if (!reviewer) return { ok: false, error: 'Sign in to review AI insights.' };

  const admin = createAdminClient();
  const { data: run, error: readError } = await admin
    .from('ai_lead_insight_runs')
    .select('id,lead_id,organization_id')
    .eq('id', input.runId)
    .eq('organization_id', reviewer.organizationId)
    .maybeSingle();

  // Uniform denial: do not disclose whether another tenant's run exists.
  if (readError || !run?.lead_id ||
      !(await canReviewLead(reviewer, String(run.lead_id)))) {
    return { ok: false, error: 'This AI review is unavailable or you do not have access.' };
  }

  const { data, error } = await admin.from('ai_lead_insight_reviews')
    .insert({
      organization_id: reviewer.organizationId,
      lead_id: run.lead_id,
      run_id: run.id,
      reviewed_by: reviewer.id,
      rating: input.rating,
      issue_codes: input.issueCodes,
    })
    .select('id')
    .single();

  if (error?.code === '23505') {
    return { ok: false, error: 'You have already reviewed this AI insight.' };
  }
  if (error || !data?.id) {
    return { ok: false, error: 'AI feedback could not be saved.' };
  }

  return { ok: true, reviewId: String(data.id) };
}
