import "server-only";

import { createClient } from "@/lib/supabase/server";

export type LeadScoreContext = {
  engagementScore: number | null;
  paymentStarts7d: number | null;
  nextFollowupAt: string | null;
  wonLeadsInOrg: number;
  followupRequested: "will_get_back" | "not_now" | "requested_time" | "call_request" | null;
};

/** Extra evidence for the lead score, read with the user's own permissions. Missing pieces stay null. */
export async function getLeadScoreContext(leadId: string, organizationId: string | null): Promise<LeadScoreContext> {
  const supabase = await createClient();
  const [intel, won, detection] = await Promise.all([
    supabase
      .from("v_lead_sales_intelligence")
      .select("engagement_score, payment_starts_7d, next_followup_at")
      .eq("lead_id", leadId)
      .maybeSingle(),
    organizationId
      ? supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .in("current_stage", ["enrolled", "closed_won"])
      : Promise.resolve({ count: 0, error: null }),
    // Table arrives with the Job 4 migration; until then this simply returns nothing.
    supabase
      .from("ai_followup_detections")
      .select("kind, outcome")
      .eq("lead_id", leadId)
      .in("outcome", ["created", "skipped_existing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const row = (intel.data ?? null) as { engagement_score?: number | string | null; payment_starts_7d?: number | null; next_followup_at?: string | null } | null;
  const kind = (detection.data as { kind?: string } | null)?.kind ?? null;
  const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    engagementScore: num(row?.engagement_score),
    paymentStarts7d: num(row?.payment_starts_7d),
    nextFollowupAt: row?.next_followup_at ?? null,
    wonLeadsInOrg: (won as { count?: number | null }).count ?? 0,
    followupRequested: (["will_get_back", "not_now", "requested_time", "call_request"] as const).find((k) => k === kind) ?? null,
  };
}
