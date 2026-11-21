import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { openedByScanner } from "@/lib/dm-links";
import { normalizeCountry } from "@/lib/home-command-center";
import { isAdStarter } from "@/lib/lead-stages";
import {
  bestLocation, countryFromPhone, phoneInText, LOCATION_CONFIDENCE, LOCATION_SCHEMA, locationSystemPrompt, parseLocationAnswer,
  teamQuotedRupeesOnly, type LeadLocation, type LocationClue,
} from "@/lib/lead-location";

// Fills leads.metadata.location every 10 minutes from all clues (see lib/lead-location.ts).

async function askClaude(lines: string[]): Promise<LocationClue | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_HAIKU_MODEL?.trim() || process.env.ANTHROPIC_COPILOT_MODEL?.trim();
  if (!apiKey || !model) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 150, system: locationSystemPrompt(),
      messages: [{ role: "user", content: `The student's messages (oldest first):\n${lines.map((l) => `- ${l}`).join("\n")}\n\nWhere does the student live?` }],
      output_config: { format: { type: "json_schema", schema: LOCATION_SCHEMA } },
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { content?: Array<{ text?: string }> };
  return parseLocationAnswer(payload.content?.find((b) => typeof b.text === "string")?.text ?? "");
}

export async function locateLead(admin: SupabaseClient, leadId: string, now: Date): Promise<LeadLocation | null> {
  const { data: lead } = await admin.from("leads").select("id, country, geo_country, geo_city, metadata").eq("id", leadId).maybeSingle();
  if (!lead) return null;
  const meta = (lead.metadata ?? {}) as Record<string, unknown>;

  const [{ data: sessions }, { data: links }, { data: phones }, { data: msgs }] = await Promise.all([
    admin.from("web_sessions").select("geo_country, geo_city").eq("lead_id", leadId).not("geo_country", "is", null).limit(1),
    admin.from("dm_tracked_links").select("visit_country, sent_at, first_opened_at").eq("lead_id", leadId).not("visit_country", "is", null).limit(5),
    admin.from("lead_contacts").select("value").eq("lead_id", leadId).in("contact_type", ["phone", "whatsapp"]).limit(3),
    admin.from("messages").select("body, direction, created_at").eq("lead_id", leadId).order("created_at", { ascending: true }).limit(200),
  ]);

  const clues: LocationClue[] = [];
  if (lead.country) clues.push({ source: "stated", country: String(lead.country) });
  if (lead.geo_country) clues.push({ source: "website", country: String(lead.geo_country), city: lead.geo_city ?? null });
  const s = (sessions ?? [])[0] as { geo_country?: string; geo_city?: string } | undefined;
  if (s?.geo_country) clues.push({ source: "website", country: s.geo_country, city: s.geo_city ?? null });
  // Instagram's scanner "opens" links seconds after sending: not the lead.
  const l = ((links ?? []) as Array<{ visit_country?: string; sent_at?: string | null; first_opened_at?: string | null }>)
    .find((x) => !openedByScanner(x.sent_at, x.first_opened_at));
  if (l?.visit_country) clues.push({ source: "link_visit", country: l.visit_country });
  for (const p of phones ?? []) {
    const c = countryFromPhone((p as { value?: string }).value);
    if (c) { clues.push({ source: "phone", country: c }); break; }
  }
  const messages = (msgs ?? []) as Array<{ body: string | null; direction: string; created_at: string }>;
  // A number they typed in a message (e.g. their WhatsApp number) tells us the country.
  if (!clues.some((c) => c.source === "phone")) {
    for (const m of [...messages].reverse()) {
      if (m.direction !== "inbound") continue;
      const typedPhone = phoneInText(m.body);
      const c = typedPhone ? countryFromPhone(typedPhone) : null;
      if (c) { clues.push({ source: "phone", country: c }); break; }
    }
  }
  if (teamQuotedRupeesOnly(messages.filter((m) => m.direction === "outbound").map((m) => m.body))) {
    clues.push({ source: "team_quote", country: "India", evidence: "Team quoted rupee prices" });
  }

  // Ask the AI only when nothing as strong as the lead's own words is known,
  // and only about what the lead typed (not ad buttons or shared posts).
  const typed = messages
    .filter((m) => m.direction === "inbound" && m.body?.trim() && !isAdStarter(m.body) && !/^(Shared an Instagram|\[Instagram )/i.test(m.body))
    .map((m) => (m.body ?? "").replace(/\s+/g, " ").slice(0, 300));
  const current = bestLocation(clues, normalizeCountry);
  const lastTyped = messages.filter((m) => m.direction === "inbound").at(-1)?.created_at ?? null;
  const scannedAt = typeof meta.location_scanned_at === "string" ? meta.location_scanned_at : null;
  const newText = lastTyped && (!scannedAt || Date.parse(lastTyped) > Date.parse(scannedAt));
  if (typed.length && newText && (!current || current.confidence < LOCATION_CONFIDENCE.conversation)) {
    const ai = await askClaude(typed.slice(-15)).catch(() => null);
    if (ai) clues.push(ai);
  } else if (meta.location && typeof meta.location === "object") {
    // Keep an earlier AI finding when nothing new was said.
    const prev = meta.location as LeadLocation;
    if (prev.source === "conversation" || prev.source === "language") clues.push({ source: prev.source, country: prev.country, city: prev.city, evidence: prev.evidence });
  }

  const best = bestLocation(clues, normalizeCountry);
  await admin.from("leads").update({
    metadata: { ...meta, location: best, location_scanned_at: now.toISOString() },
  }).eq("id", leadId);
  return best;
}

/** Leads with new messages in the last 30 minutes, plus a batch never located. */
export async function runLocationScan(admin: SupabaseClient, now = new Date(), backfill = 120) {
  const since = new Date(now.getTime() - 30 * 60_000).toISOString();
  const [{ data: recent }, { data: unscanned }] = await Promise.all([
    admin.from("messages").select("lead_id").gte("created_at", since).not("lead_id", "is", null).limit(500),
    admin.from("leads").select("id").is("metadata->>location_scanned_at", null).neq("status", "archived")
      .order("created_at", { ascending: false }).limit(backfill),
  ]);
  const ids = [...new Set([...(recent ?? []).map((m: { lead_id: string | null }) => String(m.lead_id)), ...(unscanned ?? []).map((r: { id: string }) => String(r.id))])].filter((id) => id && id !== "null");
  let scanned = 0; let located = 0; let errors = 0;
  const bySource: Record<string, number> = {};
  for (const id of ids) {
    try {
      const loc = await locateLead(admin, id, now);
      scanned += 1;
      if (loc) { located += 1; bySource[loc.source] = (bySource[loc.source] ?? 0) + 1; }
    } catch (err) {
      errors += 1;
      console.error("Location scan failed", { leadId: id, error: err instanceof Error ? err.message : "unknown" });
    }
  }
  return { scanned, located, bySource, errors };
}
