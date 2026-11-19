import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { courseFromText, type CourseRef } from "@/lib/lead-source-context";
import {
  choosePrimary, estimateValue, isFeeOrDateQuestion, locationFromText, marketFor, mergeInterest,
  type InterestRow, type InterestSource, type PriceRow,
} from "@/lib/lead-interests";

type Sign = { courseId: string; source: InterestSource; at: string; location: string | null };

const ONLINE_CODES = /^(ONLINE-|FACE-YOGA|KIDS-YOGA|NUTRITION)/;

function courseLocation(code: string | null | undefined, hint: string | null): string | null {
  if (code && ONLINE_CODES.test(code)) return "online";
  return hint;
}

/** All signs of interest for one lead, from its whole history. */
export async function collectLeadSigns(admin: SupabaseClient, leadId: string, courses: Array<CourseRef & { id: string }>): Promise<Sign[]> {
  const byCode = new Map(courses.filter((c) => c.code).map((c) => [String(c.code), c]));
  const signs: Sign[] = [];
  const [{ data: lead }, { data: ingests }, { data: inbound }, { data: links }] = await Promise.all([
    admin.from("leads").select("id, organization_id, interested_course_id, preferred_location, updated_at, created_at").eq("id", leadId).maybeSingle(),
    admin.from("lead_ingest_events").select("received_at, metadata").eq("lead_id", leadId).order("received_at", { ascending: true }).limit(50),
    admin.from("messages").select("body, created_at").eq("lead_id", leadId).eq("direction", "inbound").order("created_at", { ascending: true }).limit(300),
    admin.from("dm_tracked_links").select("course_id, first_opened_at, destination_url").eq("lead_id", leadId).not("first_opened_at", "is", null),
  ]);
  if (!lead) return signs;

  if (lead.interested_course_id) {
    signs.push({ courseId: String(lead.interested_course_id), source: "crm", at: String(lead.created_at), location: lead.preferred_location ?? null });
  }

  for (const e of ingests ?? []) {
    const md = (e.metadata ?? {}) as Record<string, unknown>;
    const at = String(e.received_at);
    const pagePath = typeof md.page_path === "string" ? md.page_path : null;
    const capture = typeof md.course_capture_value === "string" ? md.course_capture_value : null;
    const resolved = typeof md.course_resolved_code === "string" ? byCode.get(md.course_resolved_code) : null;
    const fromCapture = resolved ?? (capture && !/^\s*(yoga teacher training( course)?|general website offer)\s*$/i.test(capture) && !/\bclass(es)?\b/i.test(capture)
      ? courseFromText(capture.replace(/[-_/]+/g, " "), courses) : null);
    if (fromCapture?.id) {
      signs.push({ courseId: fromCapture.id, source: "form", at, location: courseLocation(fromCapture.code, locationFromText(capture) ?? locationFromText(pagePath)) });
    }
    const fromPage = pagePath && /\/courses\//.test(pagePath) ? courseFromText(pagePath.replace(/[-_/]+/g, " "), courses) : null;
    if (fromPage?.id && fromPage.id !== fromCapture?.id) {
      signs.push({ courseId: fromPage.id, source: "form_page", at, location: courseLocation(fromPage.code, locationFromText(pagePath)) });
    }
  }

  for (const m of inbound ?? []) {
    const body = String(m.body ?? "");
    if (!body || /^(Shared an Instagram|\[Instagram )/i.test(body)) continue;
    const hit = courseFromText(body, courses);
    if (!hit?.id) continue;
    signs.push({ courseId: hit.id, source: isFeeOrDateQuestion(body) ? "fee_question" : "message", at: String(m.created_at), location: courseLocation(hit.code, locationFromText(body)) });
  }

  for (const l of links ?? []) {
    if (!l.course_id) continue;
    const course = courses.find((c) => c.id === l.course_id);
    signs.push({ courseId: String(l.course_id), source: "tracked_link", at: String(l.first_opened_at), location: courseLocation(course?.code, locationFromText(l.destination_url)) });
  }
  return signs;
}

/** Save signs as interests (merging with what is there), then pick the main course and value. */
export async function applyLeadSigns(admin: SupabaseClient, organizationId: string, leadId: string, signs: Sign[], today: string) {
  const { data: existingRows } = await admin.from("lead_course_interests")
    .select("course_id, strength, sources, first_seen_at, last_seen_at, location, status, set_by").eq("lead_id", leadId);
  const existing = new Map((existingRows ?? []).map((r) => [String(r.course_id), r]));

  const merged = new Map<string, ReturnType<typeof mergeInterest>>();
  for (const sign of signs) {
    const prev = merged.get(sign.courseId) ?? (existing.get(sign.courseId)
      ? { strength: Number(existing.get(sign.courseId)!.strength), sources: existing.get(sign.courseId)!.sources as string[],
          lastSeenAt: String(existing.get(sign.courseId)!.last_seen_at), firstSeenAt: String(existing.get(sign.courseId)!.first_seen_at),
          location: (existing.get(sign.courseId)!.location as string | null) ?? null }
      : null);
    merged.set(sign.courseId, mergeInterest(prev, sign));
  }
  for (const [courseId, m] of merged) {
    const prev = existing.get(courseId);
    if (prev && Number(prev.strength) === m.strength && String(prev.last_seen_at) === m.lastSeenAt &&
        JSON.stringify([...(prev.sources as string[])].sort()) === JSON.stringify(m.sources) && (prev.location ?? null) === m.location) continue;
    await admin.from("lead_course_interests").upsert({
      organization_id: organizationId, lead_id: leadId, course_id: courseId, location: m.location, strength: m.strength,
      sources: m.sources, first_seen_at: m.firstSeenAt, last_seen_at: m.lastSeenAt, updated_at: new Date().toISOString(),
    }, { onConflict: "lead_id,course_id" });
  }
  await recomputeLead(admin, organizationId, leadId, today);
}

/** Main course and estimated value for the lead, from its interests and the business's prices. */
export async function recomputeLead(admin: SupabaseClient, organizationId: string, leadId: string, today: string) {
  const [{ data: rows }, { data: lead }, { data: prices }, { data: phone }, { data: link }] = await Promise.all([
    admin.from("lead_course_interests").select("id, course_id, strength, last_seen_at, status, set_by, location, is_primary").eq("lead_id", leadId),
    admin.from("leads").select("id, country, geo_country, interested_course_id, potential_value, potential_currency, potential_value_source").eq("id", leadId).maybeSingle(),
    admin.from("course_prices").select("course_id, location, market, currency, room_type, regular_price, offer_price, valid_until").eq("organization_id", organizationId).eq("active", true),
    admin.from("lead_contacts").select("value").eq("lead_id", leadId).in("contact_type", ["phone", "whatsapp"]).limit(1).maybeSingle(),
    admin.from("dm_tracked_links").select("visit_country").eq("lead_id", leadId).not("visit_country", "is", null).limit(1).maybeSingle(),
  ]);
  if (!lead || !rows?.length) return;
  const priceRows: PriceRow[] = (prices ?? []).map((p) => ({
    courseId: String(p.course_id), location: p.location ?? null, market: p.market, currency: p.currency, roomType: p.room_type ?? null,
    regularPrice: p.regular_price == null ? null : Number(p.regular_price), offerPrice: p.offer_price == null ? null : Number(p.offer_price),
    validUntil: p.valid_until ?? null,
  }));
  const market = marketFor({ country: lead.country, visitCountry: link?.visit_country ?? lead.geo_country, phone: phone?.value });
  const interestRows: InterestRow[] = rows.map((r) => ({
    courseId: String(r.course_id), strength: Number(r.strength), lastSeenAt: String(r.last_seen_at), status: r.status, setBy: r.set_by,
  }));
  const primary = choosePrimary(interestRows);

  for (const r of rows) {
    const est = estimateValue(priceRows, String(r.course_id), r.location ?? null, market, today);
    const isPrimary = primary?.courseId === String(r.course_id);
    await admin.from("lead_course_interests").update({
      is_primary: false, estimated_value: est?.value ?? null, value_currency: est?.currency ?? null,
    }).eq("id", r.id);
    if (isPrimary) r.is_primary = true;
  }
  if (!primary) return;
  await admin.from("lead_course_interests").update({ is_primary: true }).eq("lead_id", leadId).eq("course_id", primary.courseId);

  const primaryRow = rows.find((r) => String(r.course_id) === primary.courseId);
  const est = estimateValue(priceRows, primary.courseId, primaryRow?.location ?? null, market, today);
  const patch: Record<string, unknown> = {};
  if (String(lead.interested_course_id ?? "") !== primary.courseId) patch.interested_course_id = primary.courseId;
  // The team's own value always wins; only estimated values are kept up to date.
  const manualValue = lead.potential_value != null && lead.potential_value_source && !String(lead.potential_value_source).startsWith("course_price");
  if (!manualValue) {
    const source = est ? `course_price:${est.marketUsed}${est.assumed ? ":market_unknown" : ""}` : null;
    if (Number(lead.potential_value ?? NaN) !== (est?.value ?? NaN) || lead.potential_currency !== (est?.currency ?? null) || lead.potential_value_source !== source) {
      patch.potential_value = est?.value ?? null;
      patch.potential_currency = est?.currency ?? null;
      patch.potential_value_source = source;
    }
  }
  if (Object.keys(patch).length) await admin.from("leads").update(patch).eq("id", leadId);
}

/**
 * Every 10 minutes: leads with something new in the last 30 minutes (form,
 * message, link open), plus up to `backfill` leads never scanned before.
 */
export async function runInterestScan(admin: SupabaseClient, now = new Date(), backfill = 150) {
  const since = new Date(now.getTime() - 30 * 60_000).toISOString();
  const today = now.toISOString().slice(0, 10);
  const [{ data: recentMsgs }, { data: recentForms }, { data: recentLinks }, { data: unscanned }] = await Promise.all([
    admin.from("messages").select("lead_id").eq("direction", "inbound").gte("created_at", since).limit(500),
    admin.from("lead_ingest_events").select("lead_id").gte("received_at", since).limit(200),
    admin.from("dm_tracked_links").select("lead_id").gte("first_opened_at", since).limit(200),
    admin.from("leads").select("id").is("metadata->>interests_scanned_at", null).order("created_at", { ascending: false }).limit(backfill),
  ]);
  const ids = [...new Set([...(recentMsgs ?? []), ...(recentForms ?? []), ...(recentLinks ?? []), ...(unscanned ?? []).map((l) => ({ lead_id: l.id }))]
    .map((r) => String(r.lead_id)).filter((id) => id && id !== "null"))];

  const coursesByOrg = new Map<string, Array<CourseRef & { id: string }>>();
  let scanned = 0; let errors = 0;
  for (const leadId of ids) {
    try {
      const { data: lead } = await admin.from("leads").select("id, organization_id, metadata").eq("id", leadId).maybeSingle();
      if (!lead) continue;
      const org = String(lead.organization_id);
      if (!coursesByOrg.has(org)) {
        const { data: courses } = await admin.from("courses").select("id, code, name, category").eq("organization_id", org).eq("active", true).limit(80);
        coursesByOrg.set(org, (courses ?? []).map((c) => ({ id: String(c.id), code: c.code, name: c.name, category: c.category })));
      }
      const signs = await collectLeadSigns(admin, leadId, coursesByOrg.get(org)!);
      if (signs.length) await applyLeadSigns(admin, org, leadId, signs, today);
      await admin.from("leads").update({ metadata: { ...((lead.metadata ?? {}) as Record<string, unknown>), interests_scanned_at: now.toISOString() } }).eq("id", leadId);
      scanned += 1;
    } catch (err) {
      errors += 1;
      console.error("Interest scan failed", { leadId, error: err instanceof Error ? err.message : "unknown" });
    }
  }
  return { scanned, errors };
}
