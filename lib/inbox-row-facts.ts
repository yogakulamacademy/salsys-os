import "server-only";

import type { ConversationLeadSummary } from "@/components/conversations-sidebar";
import { saysTheyPaid } from "@/lib/home-story";
import { describeLastMessage, waitKind } from "@/lib/inbox-waiting";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

// What each Inbox row shows (owner-approved design, 20 Nov 2026): the person's
// own last words, the course value, and whether they say they've paid. The
// row ids come from the Inbox read model, which already limits what this user
// may see; these facts are then read with the service client for exactly
// those ids in the user's business (same pattern as the Leads table).
// Fails open: any read problem leaves the rows exactly as they were.
export async function withInboxRowFacts(rows: ConversationLeadSummary[]): Promise<ConversationLeadSummary[]> {
  if (!rows.length) return rows;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return rows;
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const admin = createAdminClient();
    const ids = [...new Set(rows.flatMap((r) => [r.id, ...(r.relatedLeadIds ?? [])]))].slice(0, 300);

    const [facts, msgs, pays, enrs] = await Promise.all([
      admin.from("leads").select("id, potential_value, potential_currency").eq("organization_id", organizationId).in("id", ids),
      admin.from("messages").select("lead_id, body, created_at").eq("organization_id", organizationId)
        .in("lead_id", ids).eq("direction", "inbound").order("created_at", { ascending: false }).limit(Math.min(1000, ids.length * 4)),
      admin.from("payments").select("lead_id").eq("organization_id", organizationId).in("lead_id", ids).in("status", ["pending", "paid"]),
      admin.from("enrollments").select("lead_id").eq("organization_id", organizationId).in("lead_id", ids),
    ]);

    const valueBy = new Map((facts.data ?? []).map((f: { id: string; potential_value: number | string | null; potential_currency: string | null }) => [f.id, f]));
    const lastBy = new Map<string, string>();
    for (const m of (msgs.data ?? []) as Array<{ lead_id: string; body: string | null }>) {
      if (!lastBy.has(m.lead_id) && (m.body ?? "").trim()) lastBy.set(m.lead_id, m.body as string);
    }
    const recorded = new Set([...(pays.data ?? []), ...(enrs.data ?? [])].map((r: { lead_id: string }) => r.lead_id));

    return rows.map((row) => {
      const text = lastBy.get(row.id) ?? null;
      const fact = valueBy.get(row.id);
      const value = fact?.potential_value == null ? null : Number(fact.potential_value);
      const paid = Boolean(text) && saysTheyPaid(text) && !recorded.has(row.id) && !["enrolled", "closed_won"].includes(String(row.stage));
      return {
        ...row,
        lastText: text ? describeLastMessage(text) : null,
        lastKind: waitKind(text, paid),
        value: value != null && Number.isFinite(value) && value > 0 ? value : null,
        currency: fact?.potential_currency ?? null,
      };
    });
  } catch (error) {
    console.warn("[inbox] row facts unavailable", error instanceof Error ? error.message : error);
    return rows;
  }
}
