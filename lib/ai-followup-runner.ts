import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  FOLLOWUP_CONFIRM_SCHEMA,
  detectFollowup,
  followupConfirmPrompt,
  type FollowupKind,
} from "@/lib/followup-detection";

// Sales AI Job 4: scan recent inbound lead messages for follow-up requests and
// create a follow-up task for the lead owner. Nothing is sent to the lead.

const LOOKBACK_HOURS = 6;
const MAX_MESSAGES = 300;
const MAX_CLAUDE_CALLS = 40;

type MessageRow = {
  id: string;
  organization_id: string;
  lead_id: string;
  body: string | null;
  created_at: string;
  received_at: string | null;
  sender_type: string;
  conversation_id: string;
  conversations: { channel: string | null } | { channel: string | null }[] | null;
};

type LeadRow = { id: string; timezone: string | null; current_contact_channel: string | null };

export type FollowupRunSummary = {
  scanned: number;
  candidates: number;
  created: number;
  skipped: number;
  rejectedByClaude: number;
  errors: number;
  claudeUsed: boolean;
};

export function followupDetectionEnabledFor(organizationId: string) {
  if (process.env.AI_FOLLOWUP_DETECTION_ENABLED !== "true") return false;
  const allow = (process.env.AI_FOLLOWUP_DETECTION_ORG_IDS || "").split(",").map((v) => v.trim()).filter(Boolean);
  return allow.length === 0 || allow.includes(organizationId);
}

async function confirmWithClaude(body: string, previousOutbound: string | null): Promise<{ ok: boolean; isFollowup: boolean; kind: FollowupKind | "none"; reason: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_HAIKU_MODEL?.trim() || process.env.ANTHROPIC_COPILOT_MODEL?.trim();
  if (!apiKey || !model) return { ok: false, isFollowup: false, kind: "none", reason: "Claude not configured" };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      system: "You classify one customer message for a yoga academy's sales team. Answer only with the JSON the schema asks for.",
      messages: [{ role: "user", content: followupConfirmPrompt(body, previousOutbound) }],
      output_config: { format: { type: "json_schema", schema: FOLLOWUP_CONFIRM_SCHEMA } },
    }),
    cache: "no-store",
  });
  if (!response.ok) return { ok: false, isFollowup: false, kind: "none", reason: `Claude HTTP ${response.status}` };
  const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = payload.content?.find((block) => typeof block.text === "string")?.text ?? "";
  try {
    const parsed = JSON.parse(text) as { is_followup_request?: boolean; kind?: string; reason?: string };
    const kinds = ["requested_time", "will_get_back", "not_now", "call_request", "none"];
    return {
      ok: true,
      isFollowup: parsed.is_followup_request === true,
      kind: (kinds.includes(String(parsed.kind)) ? parsed.kind : "none") as FollowupKind | "none",
      reason: String(parsed.reason ?? "").slice(0, 280),
    };
  } catch {
    return { ok: false, isFollowup: false, kind: "none", reason: "Unreadable Claude answer" };
  }
}

export async function runFollowupDetection(admin: SupabaseClient, now = new Date()): Promise<FollowupRunSummary> {
  const summary: FollowupRunSummary = { scanned: 0, candidates: 0, created: 0, skipped: 0, rejectedByClaude: 0, errors: 0, claudeUsed: false };
  const since = new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000).toISOString();

  const { data: rows, error } = await admin
    .from("messages")
    .select("id, organization_id, lead_id, body, created_at, received_at, sender_type, conversation_id, conversations(channel)")
    .eq("direction", "inbound")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);
  if (error) throw new Error(`Unable to read recent messages: ${error.message}`);

  const messages = ((rows ?? []) as MessageRow[]).reverse().filter((m) => m.sender_type === "lead" && followupDetectionEnabledFor(m.organization_id));
  summary.scanned = messages.length;
  if (!messages.length) return summary;

  // Skip messages already judged.
  const { data: seenRows, error: seenError } = await admin
    .from("ai_followup_detections")
    .select("message_id")
    .in("message_id", messages.map((m) => m.id));
  if (seenError) throw new Error(`Unable to read earlier detections: ${seenError.message}`);
  const seen = new Set((seenRows ?? []).map((r: { message_id: string }) => r.message_id));

  // Only the lead's latest inbound message counts; an older "I'll let you know" was overtaken.
  const latestByLead = new Map<string, string>();
  for (const m of messages) latestByLead.set(m.lead_id, m.id);

  const pending = messages.filter((m) => !seen.has(m.id) && latestByLead.get(m.lead_id) === m.id);
  if (!pending.length) return summary;

  const { data: leadRows } = await admin
    .from("leads")
    .select("id, timezone, current_contact_channel")
    .in("id", [...new Set(pending.map((m) => m.lead_id))]);
  const leads = new Map(((leadRows ?? []) as LeadRow[]).map((l) => [l.id, l]));

  let claudeCalls = 0;
  for (const message of pending) {
    const lead = leads.get(message.lead_id);
    const conv = Array.isArray(message.conversations) ? message.conversations[0] : message.conversations;
    const channel = conv?.channel ?? lead?.current_contact_channel ?? null;
    const at = new Date(message.received_at || message.created_at);
    const detection = detectFollowup({ body: message.body ?? "", now: at, timeZone: lead?.timezone, channel });
    if (!detection.isFollowup) continue; // not a candidate: nothing stored, nothing sent to Claude
    summary.candidates += 1;

    // A due time already in the past (scan ran late) moves to 2 hours from now.
    const dueAt = detection.dueAt.getTime() < now.getTime() + 15 * 60_000 ? new Date(now.getTime() + 2 * 3_600_000) : detection.dueAt;

    let decidedBy: "rules" | "claude" = "rules";
    let reason: string | null = null;
    if (claudeCalls < MAX_CLAUDE_CALLS) {
      claudeCalls += 1;
      const { data: previous } = await admin
        .from("messages")
        .select("body")
        .eq("conversation_id", message.conversation_id)
        .eq("direction", "outbound")
        .lt("created_at", message.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const verdict = await confirmWithClaude(message.body ?? "", (previous as { body?: string } | null)?.body ?? null).catch(() => null);
      if (verdict?.ok) {
        summary.claudeUsed = true;
        decidedBy = "claude";
        reason = verdict.reason || null;
        if (!verdict.isFollowup) {
          summary.rejectedByClaude += 1;
          const { error: insertError } = await admin.from("ai_followup_detections").insert({
            organization_id: message.organization_id, lead_id: message.lead_id, message_id: message.id,
            outcome: "not_followup", kind: detection.kind, method: detection.method, phrase: detection.phrase,
            due_at: dueAt.toISOString(), decided_by: "claude", reason,
          });
          if (insertError && insertError.code !== "23505") summary.errors += 1;
          continue;
        }
      }
    }

    const { data, error: rpcError } = await admin.rpc("create_ai_followup_task_v1", {
      p_message_id: message.id,
      p_title: detection.title,
      p_due_at: dueAt.toISOString(),
      p_kind: detection.kind,
      p_method: detection.method,
      p_phrase: detection.phrase,
      p_decided_by: decidedBy,
      p_reason: reason,
    });
    if (rpcError) {
      summary.errors += 1;
      console.error("AI follow-up creation failed", { messageId: message.id, message: rpcError.message });
      continue;
    }
    const outcome = (data as { outcome?: string } | null)?.outcome;
    if (outcome === "created") summary.created += 1;
    else summary.skipped += 1;
  }
  return summary;
}
