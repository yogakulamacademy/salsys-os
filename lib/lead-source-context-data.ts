import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getInstagramRuntimeForOrganization } from "@/lib/integrations/instagram-connection";
import {
  courseFromText,
  matchCaptionByPrefix,
  parseInstagramSourceEvent,
  readStoredShareBody,
  type CourseRef,
  type LeadSourceContext,
  type ShareSource,
  type StoryReplySource,
} from "@/lib/lead-source-context";

const CAPTION_TIMEOUT_MS = 3000;

function apiVersion() {
  const v = process.env.INSTAGRAM_API_VERSION?.trim() || "v26.0";
  return /^v\d+\.\d+$/.test(v) ? v : "v26.0";
}

/** Caption of a post/reel on our own Instagram account; null if it is not ours or unavailable. */
async function fetchOwnMediaCaption(organizationId: string, accountId: string, mediaId: string): Promise<string | null> {
  try {
    const runtime = await getInstagramRuntimeForOrganization(organizationId, accountId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CAPTION_TIMEOUT_MS);
    const res = await fetch(
      `https://graph.instagram.com/${apiVersion()}/${encodeURIComponent(mediaId)}?fields=caption,permalink`,
      { headers: { Authorization: `Bearer ${runtime.accessToken}` }, cache: "no-store", signal: controller.signal },
    ).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const body = (await res.json()) as { caption?: string };
    return typeof body.caption === "string" && body.caption.trim() ? body.caption.trim().slice(0, 600) : null;
  } catch {
    return null;
  }
}

// Our own recent post captions, cached per account for 30 minutes so opening
// conversations does not call Instagram every time.
const OWN_CAPTIONS_TTL_MS = 30 * 60_000;
const ownCaptionsCache = new Map<string, { at: number; captions: string[] }>();

async function fetchOwnRecentCaptions(organizationId: string, accountId: string): Promise<string[]> {
  const key = `${organizationId}:${accountId}`;
  const hit = ownCaptionsCache.get(key);
  if (hit && Date.now() - hit.at < OWN_CAPTIONS_TTL_MS) return hit.captions;
  try {
    const runtime = await getInstagramRuntimeForOrganization(organizationId, accountId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CAPTION_TIMEOUT_MS);
    const res = await fetch(
      `https://graph.instagram.com/${apiVersion()}/${encodeURIComponent(runtime.accountId)}/media?fields=caption&limit=100`,
      { headers: { Authorization: `Bearer ${runtime.accessToken}` }, cache: "no-store", signal: controller.signal },
    ).finally(() => clearTimeout(timer));
    if (!res.ok) return hit?.captions ?? [];
    const body = (await res.json()) as { data?: Array<{ caption?: string }> };
    const captions = (body.data ?? []).map((m) => (typeof m.caption === "string" ? m.caption.trim() : "")).filter(Boolean);
    ownCaptionsCache.set(key, { at: Date.now(), captions });
    return captions;
  } catch {
    return hit?.captions ?? [];
  }
}

/**
 * Where an Instagram lead came from (ad) and what their latest message shares.
 * Uses the admin client: callers must already have checked access to the lead.
 */
export async function getLeadSourceContext(
  admin: SupabaseClient,
  organizationId: string,
  leadId: string,
  courses: CourseRef[],
): Promise<LeadSourceContext> {
  const empty: LeadSourceContext = { ad: null, latestShare: null };
  const { data: msgRows } = await admin
    .from("messages")
    .select("external_message_id, body, direction, created_at")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: true })
    .limit(200);
  const messages = (msgRows ?? []) as Array<{ external_message_id: string | null; body: string | null; created_at: string }>;
  if (!messages.length) return empty;

  const mids = messages.map((m) => m.external_message_id).filter((v): v is string => Boolean(v));
  const events = new Map<string, { payload: unknown }>();
  if (mids.length) {
    const { data: rawRows } = await admin
      .from("raw_events")
      .select("external_message_id, payload")
      .eq("organization_id", organizationId)
      .eq("source_system", "instagram")
      .in("external_message_id", mids.slice(-200));
    for (const r of (rawRows ?? []) as Array<{ external_message_id: string; payload: unknown }>) events.set(r.external_message_id, { payload: r.payload });
  }

  const ctx: LeadSourceContext = { ad: null, latestShare: null };

  // First ad referral in the thread = the ad that brought them in.
  for (const m of messages) {
    const parsed = m.external_message_id ? parseInstagramSourceEvent(events.get(m.external_message_id)?.payload) : null;
    if (parsed?.kind === "ad") {
      let course = courseFromText(parsed.title, courses);
      let caption: string | null = null;
      // The ad title is cut short; the full post caption usually names the course.
      const accountId = (events.get(m.external_message_id!)?.payload as { recipient?: { id?: string } } | undefined)?.recipient?.id;
      if (accountId && parsed.title) {
        caption = matchCaptionByPrefix(parsed.title, await fetchOwnRecentCaptions(organizationId, accountId));
        if (caption && !course) course = courseFromText(caption, courses);
      }
      ctx.ad = { ...parsed, course, caption: caption ? caption.slice(0, 600) : null };
      break;
    }
  }

  // The latest inbound message: is it a share, and can we read it?
  const latest = messages[messages.length - 1];
  const stored = readStoredShareBody(latest.body);
  const latestPayload = latest.external_message_id ? events.get(latest.external_message_id)?.payload : undefined;
  const parsedLatest = parseInstagramSourceEvent(latestPayload);
  if (stored.isShare || parsedLatest?.kind === "share" || parsedLatest?.kind === "story_reply") {
    const base: ShareSource | StoryReplySource =
      parsedLatest && parsedLatest.kind !== "ad"
        ? parsedLatest
        : { kind: "share", mediaType: "post", url: null, mediaId: null, caption: null };
    let caption = stored.caption ?? base.caption;
    if (!caption && base.mediaId) {
      const accountId = (latestPayload as { recipient?: { id?: string } } | undefined)?.recipient?.id;
      if (accountId) caption = await fetchOwnMediaCaption(organizationId, accountId, base.mediaId);
    }
    ctx.latestShare = { ...base, caption, readable: Boolean(caption), course: courseFromText(caption, courses) };
  }
  return ctx;
}

/** For the Inbox: checks the signed-in user can access the lead, then reads its source. */
export async function getLeadSourceForInbox(leadId: string, organizationId: string | null): Promise<LeadSourceContext | null> {
  if (!organizationId) return null;
  const { createClient } = await import("@/lib/supabase/server");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_access_lead", { p_lead_id: leadId });
  if (allowed !== true) return null;
  const admin = createAdminClient();
  const { data: courseRows } = await admin
    .from("courses")
    .select("id, name, code, category")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .limit(60);
  return getLeadSourceContext(admin, organizationId, leadId, (courseRows ?? []) as CourseRef[]);
}
