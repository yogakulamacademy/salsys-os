import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeCountry } from "@/lib/home-command-center";
import { visitorsForLeads } from "@/lib/interest-profile-data";
import type { buildPersonTimeline } from "@/lib/person-story";

type TimelineInput = Parameters<typeof buildPersonTimeline>[0];

export type PersonViewData = {
  timeline: Omit<TimelineInput, "payments" | "now">;
  identity: { type: string; verified: boolean; source: string | null }[];
  websiteLinked: boolean;
  channels: string[];
  facts: { location: string | null; month: string | null; mode: string | null; country: string | null; countryLikely: boolean };
  formAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
};

/**
 * Everything the Customer 360 person view shows, for leads the user can
 * already see. Every read is scoped to the business (stage history has no
 * organization column, so it is limited to these leads). Never throws.
 */
export async function getPersonViewData(
  admin: SupabaseClient,
  organizationId: string,
  personId: string,
  leadIds: string[],
  activeLeadId: string,
): Promise<PersonViewData | null> {
  if (!leadIds.length) return null;
  try {
    const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
    const [visitors, stages, messages, forms, identifiers, conversations, lead] = await Promise.all([
      visitorsForLeads(admin, organizationId, leadIds),
      admin.from("lead_stage_history").select("lead_id, from_stage, to_stage, changed_by_type, reason, changed_at")
        .in("lead_id", leadIds).order("changed_at", { ascending: false }).limit(40),
      admin.from("messages").select("direction, body, created_at, ai_generated")
        .eq("organization_id", organizationId).in("lead_id", leadIds).order("created_at", { ascending: false }).limit(300),
      admin.from("lead_ingest_events").select("form_name, metadata, received_at")
        .eq("organization_id", organizationId).in("lead_id", leadIds).order("received_at", { ascending: true }).limit(10),
      admin.from("person_identifiers").select("identifier_type, verified, source_system")
        .eq("organization_id", organizationId).eq("person_id", personId).limit(30),
      admin.from("conversations").select("channel")
        .eq("organization_id", organizationId).in("lead_id", leadIds).limit(20),
      admin.from("leads").select("preferred_location, preferred_month, preferred_mode, country, geo_country, metadata")
        .eq("organization_id", organizationId).eq("id", activeLeadId).maybeSingle(),
    ]);

    let pageViews: TimelineInput["pageViews"] = [];
    let sessions: TimelineInput["sessions"] = [];
    if (visitors.length) {
      const [ev, ss] = await Promise.all([
        admin.from("raw_events").select("occurred_at, payload")
          .eq("organization_id", organizationId).in("anonymous_visitor_id", visitors)
          .eq("source_event_type", "web.page_viewed").gte("occurred_at", since)
          .order("occurred_at", { ascending: false }).limit(500),
        admin.from("web_sessions").select("started_at, source")
          .eq("organization_id", organizationId).in("anonymous_visitor_id", visitors)
          .gte("started_at", since).order("started_at", { ascending: false }).limit(100),
      ]);
      pageViews = (ev.data ?? []).map((r) => {
        const p = (r.payload ?? {}) as Record<string, unknown>;
        return { at: String(r.occurred_at), path: typeof p.pagePath === "string" ? p.pagePath : null };
      });
      sessions = (ss.data ?? []).map((r) => ({ at: String(r.started_at), source: (r.source as string | null) ?? null }));
    }

    const msgRows = ((messages.data ?? []) as { direction: string; body: string | null; created_at: string; ai_generated: boolean | null }[])
      .filter((m) => m.direction === "inbound" || m.direction === "outbound");
    const formRows = (forms.data ?? []) as { form_name: string | null; metadata: Record<string, unknown> | null; received_at: string }[];
    const leadRow = (lead.data ?? null) as { preferred_location: string | null; preferred_month: string | null; preferred_mode: string | null; country: string | null; geo_country: string | null; metadata: Record<string, unknown> | null } | null;
    const stated = normalizeCountry(leadRow?.country ?? null);
    const located = (leadRow?.metadata?.location ?? null) as { country?: string } | null;
    const inferred = stated ? null : normalizeCountry(located?.country ?? leadRow?.geo_country ?? null);
    const lastIn = msgRows.find((m) => m.direction === "inbound");
    const lastOut = msgRows.find((m) => m.direction === "outbound");

    return {
      timeline: {
        stageChanges: ((stages.data ?? []) as { from_stage: string | null; to_stage: string; changed_by_type: string | null; reason: string | null; changed_at: string }[])
          .map((r) => ({ at: r.changed_at, from: r.from_stage, to: r.to_stage, by: r.changed_by_type, reason: r.reason })),
        messages: msgRows.map((m) => ({ at: m.created_at, direction: m.direction as "inbound" | "outbound", body: m.body, aiGenerated: Boolean(m.ai_generated) })),
        forms: formRows.map((f) => {
          const md = f.metadata ?? {};
          const text = [md.message, md.comments, md.enquiry].find((v) => typeof v === "string") as string | undefined;
          return { at: f.received_at, name: f.form_name, message: text ?? null };
        }),
        pageViews,
        sessions,
      },
      identity: ((identifiers.data ?? []) as { identifier_type: string; verified: boolean; source_system: string | null }[])
        .map((r) => ({ type: r.identifier_type, verified: r.verified, source: r.source_system })),
      websiteLinked: visitors.length > 0,
      channels: [...new Set(((conversations.data ?? []) as { channel: string }[]).map((c) => String(c.channel)))],
      facts: {
        location: leadRow?.preferred_location ?? null,
        month: leadRow?.preferred_month ?? null,
        mode: leadRow?.preferred_mode ?? null,
        country: stated ?? inferred,
        countryLikely: !stated && Boolean(inferred),
      },
      formAt: formRows[0]?.received_at ?? null,
      lastInboundAt: lastIn?.created_at ?? null,
      lastOutboundAt: lastOut?.created_at ?? null,
    };
  } catch {
    return null;
  }
}
