import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export const OPEN_STAGES = ["new", "contacted", "engaged", "qualified", "high_intent", "payment_pending", "enrolled"] as const;
const ALL_STAGES = [...OPEN_STAGES, "closed_won", "not_now", "lost"] as const;

export type LeadStageCounts = Record<(typeof ALL_STAGES)[number], number>;

/**
 * Leads per stage, read with the user's own client so they only count leads
 * they can see. Null when it can't be read (the page then hides the strip).
 */
export async function getLeadStageCounts(): Promise<LeadStageCounts | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const results = await Promise.all(ALL_STAGES.map((stage) =>
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("current_stage", stage)));
    if (results.some((r) => r.error)) return null;
    return Object.fromEntries(ALL_STAGES.map((stage, i) => [stage, results[i].count ?? 0])) as LeadStageCounts;
  } catch {
    return null;
  }
}
