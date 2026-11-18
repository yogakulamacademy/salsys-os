import { NextResponse } from "next/server";

import { HANDOVER_LABELS, type HandoverReason } from "@/lib/autopilot-live";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Bell feed: leads the AI handed to the team that nobody has picked up yet (RLS-scoped). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ alerts: [] }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { data, error } = await supabase.from("ai_autopilot_leads")
    .select("lead_id, handover_reason, handed_over_at, leads(display_name)")
    .eq("status", "handed_over").is("acknowledged_at", null)
    .order("handed_over_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ alerts: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  const alerts = (data ?? []).map((row) => {
    const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
    const reason = row.handover_reason as HandoverReason | null;
    return {
      leadId: row.lead_id,
      name: (lead as { display_name?: string } | null)?.display_name || "Instagram lead",
      reason: reason ? HANDOVER_LABELS[reason] ?? reason : "Needs a person",
      at: row.handed_over_at,
    };
  });
  return NextResponse.json({ alerts }, { headers: { "Cache-Control": "no-store" } });
}
