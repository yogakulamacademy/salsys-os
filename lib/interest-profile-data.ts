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
