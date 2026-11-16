import "server-only";

import {
  draftOffer,
  scoreOfferConfidence,
  type OfferConfidence,
  type OfferContext,
  type OfferDraft,
  type OfferMessage,
} from "@/lib/offer-suggestion";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type OfferPrice = { amount: number; currency: string; batchLabel: string; source: "batch" } | null;

export type LatestOfferDecision = {
  id: string;
  status: "approved" | "declined";
  courseLabel: string | null;
  currency: string | null;
  basePrice: number | null;
  offerPrice: number | null;
  discountPercent: number;
  depositText: string | null;
  validUntil: string | null;
  decidedAt: string;
  outcome: "enrolled" | "not_enrolled" | null;
} | null;

export type LeadOfferSuggestion = {
  confidence: OfferConfidence;
  draft: OfferDraft | null;
  price: OfferPrice;
  courseLabel: string | null;
  latest: LatestOfferDecision;
  learnedEnrolments: number;
};

type TacticKey = "offer" | "urgency" | "part_payment" | "social_proof";

function rateFromDetail(detail: string): { with: number; without: number } | null {
  const match = /(\d+)% enrolled when the team did this.*?vs (\d+)% when not/i.exec(detail);
  return match ? { with: Number(match[1]) / 100, without: Number(match[2]) / 100 } : null;
}

/**
 * Builds the AI offer suggestion for one lead in the current organization.
 * Read-only: nothing is stored until a person approves or declines.
 */
export async function getLeadOfferSuggestion(input: {
  leadId: string;
  messages: OfferMessage[];
  channel: string | null;
  interestedCourseId?: string | null;
  courseName?: string | null;
  waitingSince?: string | null;
  replyWindowOpen?: boolean | null;
}): Promise<LeadOfferSuggestion | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const today = new Date().toISOString().slice(0, 10);

  const [batchResult, playbookResult, latestResult, runResult] = await Promise.all([
    input.interestedCourseId
      ? supabase
          .from("course_batches")
          .select("start_date, location, mode, currency, price_shared, price_course_only, price_private")
          .eq("organization_id", organizationId)
          .eq("course_id", input.interestedCourseId)
          .eq("active", true)
          .gte("start_date", today)
          .order("start_date", { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("v_conversation_learning_playbook")
      .select("insight_key, detail")
      .eq("organization_id", organizationId)
      .eq("kind", "outcome_driver"),
    supabase
      .from("lead_offer_proposals")
      .select("id, status, course_label, currency, base_price, offer_price, discount_percent, deposit_text, valid_until, decided_at, outcome")
      .eq("organization_id", organizationId)
      .eq("lead_id", input.leadId)
      .order("decided_at", { ascending: false })
      .limit(1),
    supabase
      .from("conversation_learning_runs")
      .select("won_conversations")
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .order("won_conversations", { ascending: false })
      .limit(1),
  ]);

  // Price only from a real batch price; never invented.
  type BatchRow = { start_date: string; location: string | null; mode: string | null; currency: string | null; price_shared: number | null; price_course_only: number | null; price_private: number | null };
  const batch = ((batchResult.data ?? []) as BatchRow[]).find((b) => (b.price_shared ?? b.price_course_only ?? b.price_private) && b.currency);
  const price: OfferPrice = batch
    ? {
        amount: Number(batch.price_shared ?? batch.price_course_only ?? batch.price_private),
        currency: String(batch.currency).toUpperCase(),
        batchLabel: `${batch.location || batch.mode || "Batch"} · starts ${batch.start_date}`,
        source: "batch",
      }
    : null;

  const learnedTactics: OfferContext["learnedTactics"] = {};
  for (const row of (playbookResult.data ?? []) as Array<{ insight_key: string; detail: string }>) {
    const key = row.insight_key.replace(/^tactic_/, "") as TacticKey;
    const rate = rateFromDetail(row.detail);
    if (rate && ["offer", "urgency", "part_payment", "social_proof"].includes(key)) learnedTactics[key] = rate;
  }
  const learnedEnrolments = Number((runResult.data?.[0] as { won_conversations?: number } | undefined)?.won_conversations ?? 0);

  const waitingMinutes = input.waitingSince ? Math.max(0, (Date.now() - new Date(input.waitingSince).getTime()) / 60000) : null;
  const context: OfferContext = {
    messages: input.messages,
    channel: input.channel,
    courseKnown: Boolean(input.interestedCourseId),
    waitingMinutes,
    replyWindowOpen: input.replyWindowOpen ?? null,
    learnedEnrolments,
    learnedTactics,
  };
  const confidence = scoreOfferConfidence(context);
  const draft = draftOffer(context, confidence);

  type LatestRow = { id: string; status: "approved" | "declined"; course_label: string | null; currency: string | null; base_price: number | null; offer_price: number | null; discount_percent: number; deposit_text: string | null; valid_until: string | null; decided_at: string; outcome: "enrolled" | "not_enrolled" | null };
  const row = (latestResult.data?.[0] ?? null) as LatestRow | null;
  const latest: LatestOfferDecision = row
    ? {
        id: row.id, status: row.status, courseLabel: row.course_label, currency: row.currency,
        basePrice: row.base_price === null ? null : Number(row.base_price),
        offerPrice: row.offer_price === null ? null : Number(row.offer_price),
        discountPercent: row.discount_percent, depositText: row.deposit_text, validUntil: row.valid_until,
        decidedAt: row.decided_at, outcome: row.outcome,
      }
    : null;

  return { confidence, draft, price, courseLabel: input.courseName || null, latest, learnedEnrolments };
}
