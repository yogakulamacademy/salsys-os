import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import { useMockData } from "@/lib/config";
import type { LeadOverview } from "@/types/crm";

export type LeadsTableEvidence = {
  priorityScore: number | null;
  priorityBand: string | null;
  lastContactAt: string | null;
  lastContactKind: "Inbound" | "Outbound" | "Contact" | null;
};

type ScoreRow = {
  lead_id: string;
  priority_score: number | string | null;
  priority_band: string | null;
  last_contacted_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
};

function contactEvent(row: ScoreRow, lead: LeadOverview): Pick<LeadsTableEvidence, "lastContactAt" | "lastContactKind"> {
  const candidates = [
    { value: row.last_contacted_at ?? lead.lastContactedAt, kind: "Contact" as const },
    { value: row.last_inbound_at, kind: "Inbound" as const },
    { value: row.last_outbound_at, kind: "Outbound" as const },
  ]
    .map(({ value, kind }) => ({
      timestamp: value ? Date.parse(value) : NaN,
      value,
      kind,
    }))
    .filter(item => item.value && Number.isFinite(item.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp);
  if (!candidates.length) return { lastContactAt: null, lastContactKind: null };
  return { lastContactAt: String(candidates[0].value), lastContactKind: candidates[0].kind };
}

/**
 * Reuses the same canonical Sales Intelligence priority score as Lead Inspector.
 * View is security_invoker and queried with the active authenticated tenant.
 * Fails closed: missing/denied/failed reads are unavailable, never score zero.
 *
 * "Last activity" in the table is explicitly limited to verified contact
 * timestamps (inbound/outbound/contact), not a claim about all CRM events.
 */
export async function getLeadsTableEvidence(leads: LeadOverview[]): Promise<Record<string, LeadsTableEvidence>> {
  if (useMockData || !leads.length) return {};
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return {};
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const { data, error } = await supabase
      .from("v_lead_sales_intelligence")
      .select("lead_id,priority_score,priority_band,last_contacted_at,last_inbound_at,last_outbound_at")
      .eq("organization_id", organizationId)
      .in("lead_id", leads.map(lead => lead.id));
    if (error) return {};

    const byId = new Map(leads.map(lead => [lead.id, lead]));
    const result: Record<string, LeadsTableEvidence> = {};
    for (const row of (data ?? []) as ScoreRow[]) {
      const lead = byId.get(row.lead_id);
      if (!lead) continue;
      const raw = row.priority_score;
      const score = raw == null || raw === "" ? null : Number(raw);
      const contact = contactEvent(row, lead);
      result[lead.id] = {
        priorityScore: score != null && Number.isFinite(score) ? score : null,
        priorityBand: row.priority_band || null,
        ...contact,
      };
    }
    return result;
  } catch {
    return {};
  }
}
