import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ShadowSummary = { drafts: number; sent: number; goodShare: number | null; wouldSendShare: number | null };

/** Shadow-mode results for the Inbox header. Returns null until the table exists or has drafts. */
export async function getShadowSummary(organizationId: string | null): Promise<ShadowSummary | null> {
  if (!organizationId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_autopilot_shadow_summary")
    .select("drafts, sent, sent_as_is, sent_small_edit, would_send")
    .eq("organization_id", organizationId)
    .eq("channel", "instagram")
    .maybeSingle();
  if (error || !data) return null;
  const n = (v: unknown) => Number(v ?? 0);
  const sent = n(data.sent);
  const drafts = n(data.drafts);
  return {
    drafts,
    sent,
    goodShare: sent ? (n(data.sent_as_is) + n(data.sent_small_edit)) / sent : null,
    wouldSendShare: drafts ? n(data.would_send) / drafts : null,
  };
}
