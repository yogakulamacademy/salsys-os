import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import { useMockData } from "@/lib/config";
import { normalizeCountry } from "@/lib/home-command-center";
import { saysTheyPaid } from "@/lib/home-story";
import type { LeadOverview } from "@/types/crm";

export type LeadsTableEvidence = {
  priorityScore: number | null;
  priorityBand: string | null;
  lastContactAt: string | null;
  lastContactKind: "Inbound" | "Outbound" | "Contact" | null;
  /** The lead wrote last and has no reply yet (ISO time of their message). */
  waitingSince: string | null;
  /** Their last message, short (for the next-step hint). */
  lastInboundText: string | null;
  /** They wrote that they paid or enrolled, and nothing is recorded. */
  saysPaid: boolean;
  /** Estimated value from the course price, in its own currency. */
  value: number | null;
  currency: string | null;
  /** Country: the lead's own entry, normalised, else worked out from clues. */
  country: string | null;
  countryInferred: boolean;
};

type ScoreRow = {
  lead_id: string;
  priority_score: number | string | null;
  priority_band: string | null;
  last_contacted_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  paid_rows: number | null;
};

function contactEvent(row: ScoreRow | undefined, lead: LeadOverview): Pick<LeadsTableEvidence, "lastContactAt" | "lastContactKind"> {
  const candidates = [
    { value: row?.last_contacted_at ?? lead.lastContactedAt, kind: "Contact" as const },
    { value: row?.last_inbound_at, kind: "Inbound" as const },
    { value: row?.last_outbound_at, kind: "Outbound" as const },
  ]
    .map(({ value, kind }) => ({ timestamp: value ? Date.parse(value) : NaN, value, kind }))
    .filter((item) => item.value && Number.isFinite(item.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp);
  if (!candidates.length) return { lastContactAt: null, lastContactKind: null };
  return { lastContactAt: String(candidates[0].value), lastContactKind: candidates[0].kind };
}

/**
 * Score, last contact, waiting-for-reply, value and location for the leads on
 * the current page. The lead ids come from the Leads read model, which already
 * limits what this user may see; these extra facts are then read with the
 * service client for exactly those ids in the user's business (the sales
 * intelligence view reads tables the signed-in role cannot, so under the user
 * client it always failed and the Score and Last activity columns were blank).
 * Fails closed: anything unreadable shows as unknown, never zero.
 */
export async function getLeadsTableEvidence(leads: LeadOverview[]): Promise<Record<string, LeadsTableEvidence>> {
  if (useMockData || !leads.length) return {};
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return {};
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const ids = leads.map((lead) => lead.id);
    const admin = createAdminClient();

    const [intel, facts, inbound, pays] = await Promise.all([
      admin.from("v_lead_sales_intelligence")
        .select("lead_id,priority_score,priority_band,last_contacted_at,last_inbound_at,last_outbound_at,paid_rows")
        .eq("organization_id", organizationId).in("lead_id", ids),
      admin.from("leads").select("id, country, potential_value, potential_currency, location:metadata->location")
        .eq("organization_id", organizationId).in("id", ids),
      admin.from("messages").select("lead_id, body, created_at")
        .eq("organization_id", organizationId).in("lead_id", ids).eq("direction", "inbound")
        .order("created_at", { ascending: false }).limit(400),
      admin.from("enrollments").select("lead_id").eq("organization_id", organizationId).in("lead_id", ids),
    ]);

    const intelBy = new Map(((intel.data ?? []) as ScoreRow[]).map((r) => [r.lead_id, r]));
    const factsBy = new Map(((facts.data ?? []) as Array<{ id: string; country: string | null; potential_value: number | string | null; potential_currency: string | null; location: { country?: string } | null }>).map((r) => [r.id, r]));
    const latestInbound = new Map<string, string>();
    for (const m of (inbound.data ?? []) as Array<{ lead_id: string; body: string | null }>) {
      if (!latestInbound.has(m.lead_id) && m.body?.trim()) latestInbound.set(m.lead_id, m.body);
    }
    const enrolled = new Set(((pays.data ?? []) as Array<{ lead_id: string }>).map((r) => r.lead_id));

    const result: Record<string, LeadsTableEvidence> = {};
    for (const lead of leads) {
      const row = intelBy.get(lead.id);
      const fact = factsBy.get(lead.id);
      const raw = row?.priority_score;
      const score = raw == null || raw === "" ? null : Number(raw);
      const inAt = row?.last_inbound_at ? Date.parse(row.last_inbound_at) : NaN;
      const outAt = row?.last_outbound_at ? Date.parse(row.last_outbound_at) : NaN;
      const waiting = Number.isFinite(inAt) && (!Number.isFinite(outAt) || inAt > outAt);
      const lastText = latestInbound.get(lead.id) ?? null;
      const stated = normalizeCountry(fact?.country ?? lead.country ?? null);
      const inferred = !stated && fact?.location?.country ? normalizeCountry(fact.location.country) : null;
      const value = fact?.potential_value == null ? null : Number(fact.potential_value);
      result[lead.id] = {
        priorityScore: score != null && Number.isFinite(score) ? score : null,
        priorityBand: row?.priority_band || null,
        ...contactEvent(row, lead),
        waitingSince: waiting ? row!.last_inbound_at : null,
        lastInboundText: lastText ? lastText.replace(/\s+/g, " ").slice(0, 80) : null,
        saysPaid: saysTheyPaid(lastText) && !Number(row?.paid_rows ?? 0) && !enrolled.has(lead.id) && !["enrolled", "closed_won"].includes(String(lead.stage)),
        value: value != null && Number.isFinite(value) ? value : null,
        currency: fact?.potential_currency ?? null,
        country: stated ?? inferred,
        countryInferred: !stated && Boolean(inferred),
      };
    }
    return result;
  } catch {
    return {};
  }
}
