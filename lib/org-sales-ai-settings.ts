import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { type OrgLinkSettings } from "@/lib/dm-links";

/** One business's Sales AI switches, plan and link domain (organization_sales_ai_settings). */
export type OrgSalesAiSettings = OrgLinkSettings & {
  organizationId: string;
  plan: "standard" | "premium";
  autopilotEnabled: boolean;
  autopilotDailyNewLeads: number;
  autopilotPilotStart: string | null;
  dmLinksEnabled: boolean;
};

const DEFAULTS = (organizationId: string): OrgSalesAiSettings => ({
  organizationId, plan: "standard", autopilotEnabled: false, autopilotDailyNewLeads: 20,
  autopilotPilotStart: null, dmLinksEnabled: false, websiteHosts: [], linkDomain: null, linkDomainVerified: false,
});

function fromRow(row: Record<string, unknown>): OrgSalesAiSettings {
  return {
    organizationId: String(row.organization_id),
    plan: row.plan === "premium" ? "premium" : "standard",
    autopilotEnabled: row.autopilot_enabled === true,
    autopilotDailyNewLeads: Number(row.autopilot_daily_new_leads ?? 20),
    autopilotPilotStart: (row.autopilot_pilot_start as string | null) ?? null,
    dmLinksEnabled: row.dm_links_enabled === true,
    websiteHosts: Array.isArray(row.website_hosts) ? (row.website_hosts as string[]).map((h) => String(h).toLowerCase()) : [],
    linkDomain: row.plan === "premium" && typeof row.link_domain === "string" ? row.link_domain : null,
    linkDomainVerified: row.plan === "premium" && Boolean(row.link_domain_verified_at),
  };
}

const COLUMNS = "organization_id, plan, autopilot_enabled, autopilot_daily_new_leads, autopilot_pilot_start, dm_links_enabled, website_hosts, link_domain, link_domain_verified_at";

/** Settings for one business; a business without a row gets everything switched off. */
export async function getOrgSalesAiSettings(client: SupabaseClient, organizationId: string): Promise<OrgSalesAiSettings> {
  const { data } = await client.from("organization_sales_ai_settings").select(COLUMNS).eq("organization_id", organizationId).maybeSingle();
  return data ? fromRow(data as Record<string, unknown>) : DEFAULTS(organizationId);
}

/** Businesses with Autopilot switched on (service-role client). */
export async function listAutopilotBusinesses(admin: SupabaseClient): Promise<Map<string, OrgSalesAiSettings>> {
  const { data, error } = await admin.from("organization_sales_ai_settings").select(COLUMNS).eq("autopilot_enabled", true);
  if (error) throw new Error(`Autopilot settings could not be loaded: ${error.message}`);
  return new Map((data ?? []).map((row) => { const s = fromRow(row as Record<string, unknown>); return [s.organizationId, s]; }));
}

/** The business whose branded link domain this is (verified, premium), if any. */
export async function findBusinessByLinkDomain(admin: SupabaseClient, host: string): Promise<OrgSalesAiSettings | null> {
  const { data } = await admin.from("organization_sales_ai_settings").select(COLUMNS).eq("link_domain", host.toLowerCase()).maybeSingle();
  return data ? fromRow(data as Record<string, unknown>) : null;
}
