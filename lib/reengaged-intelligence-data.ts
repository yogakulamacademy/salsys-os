import "server-only";

import type { InterestProfile } from "@/lib/interest-profile";
import { getInterestProfilesForLeads } from "@/lib/interest-profile-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type ReEngagedIntelligence = {
  profiles: Map<string, InterestProfile>;
  personByLead: Map<string, string>;
  coverage: { linked: number; total: number } | null;
};

const EMPTY: ReEngagedIntelligence = { profiles: new Map(), personByLead: new Map(), coverage: null };

/**
 * Interest profiles, Customer 360 links and tracking coverage for the leads on
 * the Re-engaged page. leadIds come from the user's own (row-level secured)
 * Re-engaged read, so the user can already see them. Never throws.
 */
export async function getReEngagedIntelligence(leadIds: string[]): Promise<ReEngagedIntelligence> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return EMPTY;
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const admin = createAdminClient();
    const ids = [...new Set(leadIds)].slice(0, 300);

    const [profiles, persons, totalLeads, linkedA, linkedB] = await Promise.all([
      getInterestProfilesForLeads(admin, organizationId, ids),
      ids.length
        ? admin.from("person_leads").select("person_id, lead_id").eq("organization_id", organizationId).in("lead_id", ids.slice(0, 150))
        : Promise.resolve({ data: [] as { person_id: string; lead_id: string }[] }),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).neq("status", "archived"),
      admin.from("visitor_identity_links").select("lead_id").eq("organization_id", organizationId).not("lead_id", "is", null).limit(5000),
      admin.from("web_sessions").select("lead_id").eq("organization_id", organizationId).not("lead_id", "is", null).limit(5000),
    ]);

    const personByLead = new Map<string, string>();
    for (const row of (persons.data ?? []) as { person_id: string; lead_id: string }[]) personByLead.set(row.lead_id, row.person_id);

    const linked = new Set([...(linkedA.data ?? []), ...(linkedB.data ?? [])].map((r) => String((r as { lead_id: string }).lead_id))).size;
    const total = totalLeads.count ?? 0;

    return { profiles, personByLead, coverage: total ? { linked: Math.min(linked, total), total } : null };
  } catch {
    return EMPTY;
  }
}
