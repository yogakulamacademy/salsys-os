import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildInterestProfile, type CoursePage, type InterestProfile, type ProfileEvent, type ProfileMessage, type ProfileSession,
} from "@/lib/interest-profile";

const WINDOW_DAYS = 90;
const MAX_EVENTS = 3000;

function pathFromUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try { return new URL(value).pathname.toLowerCase(); } catch { return null; }
}

/** Course pages from each course's website links, so a page view can be named as a course. */
export function coursePagesFrom(courses: { id: string; name: string | null; metadata: unknown }[]): CoursePage[] {
  const pages: CoursePage[] = [];
  for (const c of courses) {
    const md = (c.metadata ?? {}) as Record<string, unknown>;
    for (const key of ["website_url", "website_url_kerala", "website_url_mysore", "website_url_online"]) {
      const path = pathFromUrl(md[key]);
      if (path && path !== "/") pages.push({ courseId: c.id, courseName: c.name ?? "Course", path });
    }
  }
  return pages;
}

/**
 * Interest profile for the given leads of one business (all leads of one person).
 * Every read is scoped to organizationId; callers must have already checked the
 * user can see these leads. Returns null when it can't be read (never throws).
 */
export async function getInterestProfile(
  admin: SupabaseClient,
  organizationId: string,
  leadIds: string[],
): Promise<InterestProfile | null> {
  if (!leadIds.length) return null;
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    const [links, leadSessions, messages, courses] = await Promise.all([
      admin.from("visitor_identity_links").select("anonymous_visitor_id").eq("organization_id", organizationId).in("lead_id", leadIds).limit(200),
      admin.from("web_sessions").select("anonymous_visitor_id").eq("organization_id", organizationId).in("lead_id", leadIds).limit(500),
      admin.from("messages").select("direction, body, created_at").eq("organization_id", organizationId).in("lead_id", leadIds)
        .order("created_at", { ascending: false }).limit(400),
      admin.from("courses").select("id, name, metadata").eq("organization_id", organizationId).eq("active", true).limit(120),
    ]);

    const visitorIds = [...new Set([
      ...(links.data ?? []).map((r) => r.anonymous_visitor_id as string | null),
      ...(leadSessions.data ?? []).map((r) => r.anonymous_visitor_id as string | null),
    ].filter((v): v is string => Boolean(v)))].slice(0, 100);

    let events: ProfileEvent[] = [];
    let sessions: ProfileSession[] = [];
    if (visitorIds.length) {
      const [ev, ss] = await Promise.all([
        admin.from("raw_events").select("source_event_type, occurred_at, payload")
          .eq("organization_id", organizationId).in("anonymous_visitor_id", visitorIds)
          .like("source_event_type", "web.%").gte("occurred_at", since)
          .order("occurred_at", { ascending: false }).limit(MAX_EVENTS),
        admin.from("web_sessions").select("started_at, landing_page, source, geo_country")
          .eq("organization_id", organizationId).in("anonymous_visitor_id", visitorIds)
          .gte("started_at", since).order("started_at", { ascending: false }).limit(300),
      ]);
      events = (ev.data ?? []).map((r) => ({
        name: String(r.source_event_type),
        at: String(r.occurred_at),
        props: (r.payload ?? null) as Record<string, unknown> | null,
      }));
      sessions = (ss.data ?? []).map((r) => ({
        startedAt: String(r.started_at),
        landingPage: (r.landing_page as string | null) ?? null,
        source: (r.source as string | null) ?? null,
        country: (r.geo_country as string | null) ?? null,
      }));
    }

    const msgs: ProfileMessage[] = (messages.data ?? [])
      .filter((m) => m.direction === "inbound" || m.direction === "outbound")
      .map((m) => ({ direction: m.direction as "inbound" | "outbound", at: String(m.created_at), body: (m.body as string | null) ?? null }));

    return buildInterestProfile({
      events,
      sessions,
      messages: msgs,
      coursePages: coursePagesFrom((courses.data ?? []) as { id: string; name: string | null; metadata: unknown }[]),
    });
  } catch {
    return null;
  }
}

const PAGE = 1000;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Read every page of a query (PostgREST returns at most 1000 rows per call). */
async function readAll<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, maxRows: number): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data, error } = await make(from, Math.min(from + PAGE, maxRows) - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/**
 * Interest profiles for a list of leads of one business (e.g. the Re-engaged
 * list), with a fixed number of queries whatever the list size. Callers must
 * pass only leads the user can already see. Never throws: returns an empty map
 * when it can't be read.
 */
export async function getInterestProfilesForLeads(
  admin: SupabaseClient,
  organizationId: string,
  leadIds: string[],
  options: { days?: number } = {},
): Promise<Map<string, InterestProfile>> {
  const result = new Map<string, InterestProfile>();
  const ids = [...new Set(leadIds)].slice(0, 300);
  if (!ids.length) return result;
  try {
    const since = new Date(Date.now() - (options.days ?? 30) * 86_400_000).toISOString();
    const leadChunks = chunks(ids, 100);

    const [linkRows, sessionLeadRows, messageRows, courses] = await Promise.all([
      Promise.all(leadChunks.map((c) => admin.from("visitor_identity_links").select("anonymous_visitor_id, lead_id")
        .eq("organization_id", organizationId).in("lead_id", c).limit(PAGE))).then((r) => r.flatMap((x) => x.data ?? [])),
      Promise.all(leadChunks.map((c) => admin.from("web_sessions").select("anonymous_visitor_id, lead_id")
        .eq("organization_id", organizationId).in("lead_id", c).limit(PAGE))).then((r) => r.flatMap((x) => x.data ?? [])),
      Promise.all(leadChunks.map((c) => readAll<{ lead_id: string; direction: string; body: string | null; created_at: string }>(
        (from, to) => admin.from("messages").select("lead_id, direction, body, created_at")
          .eq("organization_id", organizationId).in("lead_id", c).gte("created_at", since)
          .order("created_at", { ascending: false }).range(from, to),
        4000))).then((r) => r.flat()),
      admin.from("courses").select("id, name, metadata").eq("organization_id", organizationId).eq("active", true).limit(120),
    ]);

    // Which leads each website visitor belongs to.
    const leadsByVisitor = new Map<string, Set<string>>();
    for (const r of [...linkRows, ...sessionLeadRows] as { anonymous_visitor_id: string | null; lead_id: string | null }[]) {
      if (!r.anonymous_visitor_id || !r.lead_id) continue;
      const set = leadsByVisitor.get(r.anonymous_visitor_id) ?? new Set<string>();
      set.add(r.lead_id);
      leadsByVisitor.set(r.anonymous_visitor_id, set);
    }
    const visitorChunks = chunks([...leadsByVisitor.keys()], 100);

    const [eventRows, sessionRows] = await Promise.all([
      Promise.all(visitorChunks.map((c) => readAll<{ anonymous_visitor_id: string; source_event_type: string; occurred_at: string; payload: Record<string, unknown> | null }>(
        (from, to) => admin.from("raw_events").select("anonymous_visitor_id, source_event_type, occurred_at, payload")
          .eq("organization_id", organizationId).in("anonymous_visitor_id", c)
          .like("source_event_type", "web.%").gte("occurred_at", since)
          .order("occurred_at", { ascending: false }).range(from, to),
        8000))).then((r) => r.flat()),
      Promise.all(visitorChunks.map((c) => readAll<{ anonymous_visitor_id: string; started_at: string; landing_page: string | null; source: string | null; geo_country: string | null }>(
        (from, to) => admin.from("web_sessions").select("anonymous_visitor_id, started_at, landing_page, source, geo_country")
          .eq("organization_id", organizationId).in("anonymous_visitor_id", c).gte("started_at", since)
          .order("started_at", { ascending: false }).range(from, to),
        3000))).then((r) => r.flat()),
    ]);

    const events = new Map<string, ProfileEvent[]>();
    const sessions = new Map<string, ProfileSession[]>();
    const messages = new Map<string, ProfileMessage[]>();
    const push = <V,>(m: Map<string, V[]>, k: string, v: V) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

    for (const e of eventRows) {
      for (const leadId of leadsByVisitor.get(e.anonymous_visitor_id) ?? []) {
        push(events, leadId, { name: String(e.source_event_type), at: String(e.occurred_at), props: e.payload ?? null });
      }
    }
    for (const s of sessionRows) {
      for (const leadId of leadsByVisitor.get(s.anonymous_visitor_id) ?? []) {
        push(sessions, leadId, { startedAt: String(s.started_at), landingPage: s.landing_page, source: s.source, country: s.geo_country });
      }
    }
    for (const m of messageRows) {
      if (m.direction !== "inbound" && m.direction !== "outbound") continue;
      push(messages, m.lead_id, { direction: m.direction, at: String(m.created_at), body: m.body });
    }

    const coursePages = coursePagesFrom((courses.data ?? []) as { id: string; name: string | null; metadata: unknown }[]);
    for (const leadId of ids) {
      result.set(leadId, buildInterestProfile({
        events: events.get(leadId) ?? [],
        sessions: sessions.get(leadId) ?? [],
        messages: messages.get(leadId) ?? [],
        coursePages,
      }));
    }
  } catch {
    return new Map();
  }
  return result;
}
