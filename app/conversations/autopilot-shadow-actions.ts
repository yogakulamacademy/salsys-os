"use server";

import { generateCopilotReplyAction } from "@/app/conversations/copilot-actions";
import { editRatio, shadowDecision, STOP_LABELS, type ShadowStopReason } from "@/lib/autopilot-shadow";
import { createClient } from "@/lib/supabase/server";

// Sales AI Job 2, phase 1: Autopilot shadow mode for Instagram. The AI drafts;
// a person reviews and sends. Nothing is sent from here.

export type ShadowDraft = {
  ok: true;
  runId: string;
  draft: string | null;
  wouldSend: boolean;
  stopReason: ShadowStopReason | null;
  stopLabel: string | null;
  existing: boolean;
} | { ok: false; error: string; disabled?: boolean };

export async function getShadowDraftAction(leadId: string): Promise<ShadowDraft> {
  if (process.env.AI_AUTOPILOT_SHADOW_ENABLED !== "true") return { ok: false, error: "Autopilot shadow mode is off.", disabled: true };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session has expired. Sign in again." };

  const { data: lead } = await supabase
    .from("leads")
    .select("id, current_stage, current_contact_channel")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.current_contact_channel !== "instagram") return { ok: false, error: "Shadow mode runs on Instagram first.", disabled: true };

  const { data: latest } = await supabase
    .from("messages")
    .select("id, body, direction, created_at, received_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest || latest.direction !== "inbound") return { ok: false, error: "No new message from the lead to answer.", disabled: true };

  // One draft per inbound message: reuse it when the conversation is reopened.
  const { data: existing } = await supabase
    .from("ai_autopilot_runs")
    .select("id, status, draft, would_send, stop_reason")
    .eq("inbound_message_id", latest.id)
    .eq("mode", "shadow")
    .maybeSingle();
  if (existing) {
    const reason = (existing.stop_reason ?? null) as ShadowStopReason | null;
    return {
      ok: true, runId: existing.id, draft: existing.status === "draft_ready" ? existing.draft : null,
      wouldSend: existing.would_send, stopReason: reason, stopLabel: reason ? STOP_LABELS[reason] ?? reason : null, existing: true,
    };
  }

  const at = latest.received_at || latest.created_at;
  const pre = shadowDecision({ latestInbound: latest.body ?? "", latestInboundAt: at, now: new Date(), stage: String(lead.current_stage), routerRisk: null, knowledgeUsed: 1 });
  // A closed Instagram window or a closed lead: nothing a draft could be sent with.
  const skipDraft = pre.stopReason === "window_closed" || pre.stopReason === "closed_stage" || pre.stopReason === "non_text";

  let draft: string | null = null;
  let risk: "low" | "review" | "human_only" | null = null;
  let intent: string | null = null;
  let knowledgeUsed = 0;
  let model: string | null = null;
  let error: string | null = null;
  if (!skipDraft) {
    const result = await generateCopilotReplyAction(leadId);
    if (result.ok) {
      draft = result.draft;
      risk = result.risk;
      intent = result.intent;
      knowledgeUsed = result.knowledgeUsed;
      model = result.model;
    } else {
      error = result.error.slice(0, 480);
    }
  }

  // The lead shared something we cannot see: no draft, a person replies.
  const unreadable = Boolean(error?.startsWith("SHARE_UNREADABLE"));
  if (unreadable) error = null;

  const base = shadowDecision({
    latestInbound: latest.body ?? "", latestInboundAt: at, now: new Date(), stage: String(lead.current_stage),
    routerRisk: risk, knowledgeUsed, draft,
  });
  const decision = unreadable ? { ...base, wouldSend: false, stopReason: "no_context" as const } : base;

  const { data: saved, error: saveError } = await supabase.rpc("record_autopilot_shadow_draft_v1", {
    p_lead_id: leadId,
    p_inbound_message_id: latest.id,
    p_channel: "instagram",
    p_would_send: decision.wouldSend && !error,
    p_stop_reason: decision.stopReason,
    p_topic: decision.topic,
    p_router_risk: risk,
    p_router_intent: intent,
    p_knowledge_used: knowledgeUsed,
    p_model: model,
    p_draft: draft,
    p_error: skipDraft ? null : error,
  });
  if (saveError) return { ok: false, error: "The AI draft could not be saved. Try again." };
  const runId = String((saved as { run_id?: string } | null)?.run_id ?? "");
  return {
    ok: true, runId, draft: error ? null : draft, wouldSend: decision.wouldSend && !error,
    stopReason: decision.stopReason, stopLabel: decision.stopReason ? STOP_LABELS[decision.stopReason] : null, existing: false,
  };
}

export async function recordShadowOutcomeAction(input: { runId: string; draft: string; sentBody: string }) {
  if (!input.runId || !input.draft) return { ok: false as const };
  const supabase = await createClient();
  const ratio = editRatio(input.draft, input.sentBody);
  const { error } = await supabase.rpc("record_autopilot_shadow_outcome_v1", {
    p_run_id: input.runId,
    p_sent_body: input.sentBody.slice(0, 4000),
    p_edit_ratio: Number(ratio.toFixed(4)),
  });
  return error ? { ok: false as const } : { ok: true as const, ratio };
}
