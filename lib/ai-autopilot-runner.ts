import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { draftCopilotReply, type CopilotReplyResult } from "@/lib/copilot-core";
import { getInstagramRuntimeForOrganization } from "@/lib/integrations/instagram-connection";
import {
  ASSESS_SCHEMA, assessSystemPrompt, assessUserPrompt, CLOSED_STAGES, eligibleNewLead, HANDOVER_LABELS,
  istDayStart, liveHardStop, nudgeDue, parseAssessment, sendDecision, windowOpen,
  type Assessment, type HandoverReason,
} from "@/lib/autopilot-live";

const MAX_LEADS_PER_RUN = 8;
const MAX_FOLLOWUP_DRAFTS_PER_RUN = 6;
const FOLLOWUP_SOURCE = "ai_followup_detection_v1";

type Summary = {
  considered: number; sent: number; enrolled: number; handedOver: number; paused: number;
  skipped: number; nudges: number; followupDrafts: number; followupsSent: number; errors: number;
};

type Ctx = { admin: SupabaseClient; now: Date; summary: Summary };

function dailyCap() {
  const n = Number(process.env.AI_AUTOPILOT_DAILY_NEW_LEADS ?? "20");
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 200) : 20;
}

async function assess(contextText: string, latestInbound: string, draft: string, kind: "reply" | "followup"): Promise<Assessment | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_SONNET_MODEL?.trim() || process.env.ANTHROPIC_HAIKU_MODEL?.trim();
  if (!apiKey || !model) return null;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 300, system: assessSystemPrompt(),
      messages: [{ role: "user", content: assessUserPrompt({ contextText, latestInbound, draft, kind }) }],
      output_config: { format: { type: "json_schema", schema: ASSESS_SCHEMA } },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { content?: Array<{ text?: string }> };
  try { return parseAssessment(JSON.parse(payload.content?.find((b) => typeof b.text === "string")?.text ?? "")); } catch { return null; }
}

/** Sends one Instagram text as the business and logs it as an AI message. Policy-checked first. */
async function sendInstagram(admin: SupabaseClient, input: { organizationId: string; leadId: string; conversationId: string; accountId: string; body: string; runId: string }) {
  const { data: policyData, error: policyError } = await admin.rpc("evaluate_instagram_dm_send_policy_v1", {
    p_organization_id: input.organizationId, p_conversation_id: input.conversationId, p_now: new Date().toISOString(),
    p_automated: false, p_human_approved: true,
  });
  const policy = (policyData ?? {}) as { allowed?: boolean; reasons?: string[]; instagram_user_id?: string };
  if (policyError || policy.allowed !== true || !policy.instagram_user_id) {
    return { ok: false as const, error: policyError?.message || (policy.reasons ?? []).join(", ") || "Instagram policy check failed." };
  }
  const runtime = await getInstagramRuntimeForOrganization(input.organizationId, input.accountId);
  const version = /^v\d+\.\d+$/.test(process.env.INSTAGRAM_API_VERSION?.trim() ?? "") ? process.env.INSTAGRAM_API_VERSION!.trim() : "v26.0";
  const response = await fetch(`https://graph.instagram.com/${version}/${encodeURIComponent(runtime.accountId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${runtime.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: policy.instagram_user_id }, message: { text: input.body } }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
  if (!response.ok || !payload.message_id) return { ok: false as const, error: payload.error?.message || `Instagram returned HTTP ${response.status}.` };

  const { data: logged } = await admin.rpc("log_lead_interaction", {
    p_lead_id: input.leadId, p_channel: "instagram", p_direction: "outbound", p_body: input.body, p_conversation_id: input.conversationId,
  });
  const row = Array.isArray(logged) ? logged[0] : logged;
  const messageId = (row as { id?: string } | null)?.id;
  if (messageId) {
    await admin.from("messages").update({
      external_message_id: payload.message_id, status: "sent", sent_at: new Date().toISOString(), sender_type: "ai",
      human_approved: false, metadata: { provider: "instagram", send_mode: "ai_autopilot", autopilot_run_id: input.runId },
    }).eq("id", messageId).eq("organization_id", input.organizationId);
    // The shared logger records outbound messages as human; this one was the AI.
    await admin.from("activities").update({ actor_type: "ai", actor_id: "ai_autopilot_v1", title: "AI Autopilot reply" })
      .eq("lead_id", input.leadId).eq("activity_type", "outbound_interaction").contains("metadata", { message_id: messageId });
  }
  return { ok: true as const, providerMessageId: payload.message_id };
}

async function handover(ctx: Ctx, leadId: string, reason: HandoverReason, detail?: string) {
  const { error } = await ctx.admin.rpc("ai_autopilot_handover_v1", { p_lead_id: leadId, p_reason: reason, p_detail: detail ?? HANDOVER_LABELS[reason] });
  if (error) { ctx.summary.errors += 1; return; }
  ctx.summary.handedOver += 1;
}

/** Claims one inbound message for Autopilot. The unique (message, mode) key stops double sends. */
async function claimRun(ctx: Ctx, input: { organizationId: string; leadId: string; inboundMessageId: string; kind: "reply" | "followup" }) {
  const { data, error } = await ctx.admin.from("ai_autopilot_runs").insert({
    organization_id: input.organizationId, lead_id: input.leadId, inbound_message_id: input.inboundMessageId,
    channel: "instagram", mode: "autopilot", status: "draft_ready", would_send: false, kind: input.kind, knowledge_used: 0,
  }).select("id").maybeSingle();
  if (error) return null;
  return data?.id as string | undefined ?? null;
}

async function finishRun(ctx: Ctx, runId: string, patch: Record<string, unknown>) {
  await ctx.admin.from("ai_autopilot_runs").update({ ...patch, resolved_at: new Date().toISOString() }).eq("id", runId);
}

function draftFields(draft: CopilotReplyResult) {
  return draft.ok ? { draft: draft.draft.slice(0, 4000), model: draft.model, router_risk: draft.risk, router_intent: draft.intent.slice(0, 120), knowledge_used: draft.knowledgeUsed } : { error: draft.error.slice(0, 500) };
}

type InboundRow = { id: string; lead_id: string; conversation_id: string; organization_id: string; body: string | null; created_at: string; received_at: string | null };

/** One reply cycle for a lead whose latest message is from them and unanswered. */
async function replyToLead(ctx: Ctx, msg: InboundRow, state: { status: string; enrolled_at: string } | null, lead: { stage: string; created_at: string; accountId: string }) {
  const kind = "reply" as const;
  const at = msg.received_at || msg.created_at;
  if (!windowOpen(at, ctx.now)) return;

  const runId = await claimRun(ctx, { organizationId: msg.organization_id, leadId: msg.lead_id, inboundMessageId: msg.id, kind });
  if (!runId) return; // already handled
  ctx.summary.considered += 1;

  const enrolled = state?.status === "active";
  const hard = liveHardStop(msg.body ?? "");
  if (hard) {
    if (enrolled) await handover(ctx, msg.lead_id, hard);
    await finishRun(ctx, runId, { status: enrolled ? "handed_over" : "skipped", stop_reason: hard });
    if (!enrolled) ctx.summary.skipped += 1;
    return;
  }

  const draft = await draftCopilotReply({ leadId: msg.lead_id, knowledgeClient: ctx.admin, purpose: "autopilot" });
  if (!draft.ok) {
    const reason: HandoverReason = draft.error.startsWith("SHARE_UNREADABLE") ? "unreadable_share" : "draft_failed";
    if (enrolled) await handover(ctx, msg.lead_id, reason);
    await finishRun(ctx, runId, { ...draftFields(draft), status: enrolled ? "handed_over" : "skipped", stop_reason: reason });
    if (!enrolled) ctx.summary.skipped += 1;
    return;
  }

  const assessment = await assess(draft.facts?.contextText ?? "", msg.body ?? "", draft.draft, kind);
  const decision = sendDecision({ assessment, draft: draft.draft, routerRisk: draft.risk });
  const base = { ...draftFields(draft), confidence: assessment?.confidence ?? null };

  if (!decision.send) {
    if (enrolled) await handover(ctx, msg.lead_id, decision.reason, decision.detail);
    else ctx.summary.skipped += 1; // not confident enough to take this lead: the team handles it as usual
    await finishRun(ctx, runId, { ...base, status: enrolled ? "handed_over" : "skipped", stop_reason: decision.reason });
    return;
  }

  if (!enrolled) {
    // Pilot: new leads only, capped per day. Taken over only when confident.
    if (state) { await finishRun(ctx, runId, { ...base, status: "skipped", stop_reason: "not_on_autopilot" }); ctx.summary.skipped += 1; return; }
    const { count } = await ctx.admin.from("ai_autopilot_leads").select("id", { count: "exact", head: true })
      .eq("organization_id", msg.organization_id).eq("enrolled_reason", "pilot_new_lead").gte("enrolled_at", istDayStart(ctx.now).toISOString());
    if ((count ?? 0) >= dailyCap()) { await finishRun(ctx, runId, { ...base, status: "skipped", stop_reason: "daily_cap" }); ctx.summary.skipped += 1; return; }
    const { error: enrolError } = await ctx.admin.from("ai_autopilot_leads").insert({ organization_id: msg.organization_id, lead_id: msg.lead_id, enrolled_reason: "pilot_new_lead" });
    if (enrolError) { await finishRun(ctx, runId, { ...base, status: "skipped", stop_reason: "enrol_failed" }); ctx.summary.errors += 1; return; }
    await ctx.admin.from("activities").insert({ lead_id: msg.lead_id, activity_type: "ai_autopilot_on", actor_type: "ai", actor_id: "ai_autopilot_v1", title: "AI Autopilot took this lead", details: `Confident it can help (${Math.round((assessment?.confidence ?? 0) * 100)}%).`, metadata: {} });
    ctx.summary.enrolled += 1;
  }

  const sent = await sendInstagram(ctx.admin, { organizationId: msg.organization_id, leadId: msg.lead_id, conversationId: msg.conversation_id, accountId: lead.accountId, body: draft.draft, runId });
  if (!sent.ok) {
    await handover(ctx, msg.lead_id, "send_failed", sent.error.slice(0, 300));
    await finishRun(ctx, runId, { ...base, status: "failed", stop_reason: "send_failed", error: sent.error.slice(0, 500) });
    return;
  }
  await finishRun(ctx, runId, { ...base, status: "sent", would_send: true, sent_body: draft.draft.slice(0, 4000), provider_message_id: sent.providerMessageId });
  const { data: row } = await ctx.admin.from("ai_autopilot_leads").select("ai_messages_sent").eq("lead_id", msg.lead_id).maybeSingle();
  await ctx.admin.from("ai_autopilot_leads").update({ ai_messages_sent: Number(row?.ai_messages_sent ?? 0) + 1, last_ai_message_at: new Date().toISOString() }).eq("lead_id", msg.lead_id);
  ctx.summary.sent += 1;
}

/** If someone on the team replied themselves, the AI steps back for that lead. */
async function pauseIfTeamReplied(ctx: Ctx, state: { lead_id: string; enrolled_at: string }) {
  const [{ data }, { data: aiRuns }] = await Promise.all([
    ctx.admin.from("messages").select("id, metadata, external_message_id")
      .eq("lead_id", state.lead_id).eq("direction", "outbound").gt("created_at", state.enrolled_at).limit(30),
    ctx.admin.from("ai_autopilot_runs").select("provider_message_id").eq("lead_id", state.lead_id).eq("mode", "autopilot").not("provider_message_id", "is", null).limit(100),
  ]);
  // The history import can store our own AI message before we tag it; match by Instagram message ID too.
  const aiIds = new Set((aiRuns ?? []).map((r) => String(r.provider_message_id)));
  const human = (data ?? []).some((m) => !((m.metadata ?? {}) as Record<string, unknown>).autopilot_run_id && !aiIds.has(String(m.external_message_id ?? "")));
  if (!human) return false;
  await ctx.admin.from("ai_autopilot_leads").update({ status: "paused", paused_at: new Date().toISOString() }).eq("lead_id", state.lead_id);
  await ctx.admin.from("activities").insert({ lead_id: state.lead_id, activity_type: "ai_autopilot_off", actor_type: "ai", actor_id: "ai_autopilot_v1", title: "AI Autopilot stepped back", details: "Someone on the team replied to this lead.", metadata: {} });
  ctx.summary.paused += 1;
  return true;
}

export async function runAutopilot(admin: SupabaseClient, now = new Date()): Promise<Summary> {
  const summary: Summary = { considered: 0, sent: 0, enrolled: 0, handedOver: 0, paused: 0, skipped: 0, nudges: 0, followupDrafts: 0, followupsSent: 0, errors: 0 };
  const ctx: Ctx = { admin, now, summary };
  const live = process.env.AI_AUTOPILOT_LIVE_ENABLED === "true";
  const orgFilter = (process.env.AI_AUTOPILOT_ORG_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();

  if (live) {
    // 1) Latest unanswered Instagram message per lead, last 24h.
    let q = admin.from("messages")
      .select("id, lead_id, conversation_id, organization_id, body, created_at, received_at, direction, sender_type, conversations!inner(channel, external_account_id)")
      .eq("conversations.channel", "instagram").gte("created_at", since).order("created_at", { ascending: false }).limit(600);
    if (orgFilter.length) q = q.in("organization_id", orgFilter);
    const { data: recent, error } = await q;
    if (error) throw new Error(`Recent Instagram messages could not be loaded: ${error.message}`);
    const latestByLead = new Map<string, Record<string, unknown>>();
    for (const m of recent ?? []) if (!latestByLead.has(String(m.lead_id))) latestByLead.set(String(m.lead_id), m as Record<string, unknown>);
    const waiting = [...latestByLead.values()].filter((m) => m.direction === "inbound" && m.sender_type === "lead").slice(0, 60);

    let handled = 0;
    for (const m of waiting) {
      if (handled >= MAX_LEADS_PER_RUN) break;
      const leadId = String(m.lead_id);
      const { data: lead } = await admin.from("leads").select("id, current_stage, created_at, current_contact_channel").eq("id", leadId).maybeSingle();
      if (!lead || lead.current_contact_channel !== "instagram" || CLOSED_STAGES.includes(String(lead.current_stage))) continue;
      const { data: state } = await admin.from("ai_autopilot_leads").select("status, enrolled_at, lead_id").eq("lead_id", leadId).maybeSingle();
      if (state && state.status !== "active") continue;
      if (state && (await pauseIfTeamReplied(ctx, state))) continue;
      if (!state) {
        const { count: humanReplies } = await admin.from("messages").select("id", { count: "exact", head: true })
          .eq("conversation_id", String(m.conversation_id)).eq("direction", "outbound");
        if (!eligibleNewLead({ leadCreatedAt: String(lead.created_at), stage: String(lead.current_stage), humanRepliesInThread: humanReplies ?? 0, now, pilotStartedAt: process.env.AI_AUTOPILOT_PILOT_START ?? null })) continue;
      }
      const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations;
      handled += 1;
      try {
        await replyToLead(ctx, m as unknown as InboundRow, state, { stage: String(lead.current_stage), created_at: String(lead.created_at), accountId: String((conv as { external_account_id?: string })?.external_account_id ?? "") });
      } catch (err) {
        summary.errors += 1;
        console.error("Autopilot reply failed", { leadId, error: err instanceof Error ? err.message : "unknown" });
      }
    }

    // 2) One nudge for active leads that went quiet after the AI's message (window still open).
    const { data: actives } = await admin.from("ai_autopilot_leads").select("lead_id, organization_id, last_ai_message_at, followups_sent").eq("status", "active").limit(100);
    for (const a of actives ?? []) {
      if (summary.nudges >= 3) break;
      const { data: msgs } = await admin.from("messages").select("id, direction, created_at, received_at, metadata, conversation_id, conversations!inner(channel, external_account_id)")
        .eq("lead_id", a.lead_id).eq("conversations.channel", "instagram").order("created_at", { ascending: false }).limit(10);
      const list = msgs ?? [];
      const lastInbound = list.find((x) => x.direction === "inbound");
      if (!lastInbound || !list[0]) continue;
      const nudgesSinceInbound = list.filter((x) => x.direction === "outbound" && Date.parse(String(x.created_at)) > Date.parse(String(lastInbound.created_at)) && ((x.metadata ?? {}) as Record<string, unknown>).autopilot_kind === "followup").length;
      const lastIsAi = list[0].direction === "outbound" && Boolean(((list[0].metadata ?? {}) as Record<string, unknown>).autopilot_run_id);
      if (!nudgeDue({ lastInboundAt: String(lastInbound.received_at || lastInbound.created_at), lastAiAt: a.last_ai_message_at, lastMessageFromAi: lastIsAi, nudgesSinceInbound, now })) continue;
      const conv = Array.isArray(list[0].conversations) ? list[0].conversations[0] : list[0].conversations;
      const sent = await sendFollowup(ctx, { leadId: a.lead_id, organizationId: a.organization_id, conversationId: String(list[0].conversation_id), accountId: String((conv as { external_account_id?: string })?.external_account_id ?? ""), anchorMessageId: String(list[0].id) });
      if (sent) { summary.nudges += 1; await admin.from("ai_autopilot_leads").update({ followups_sent: Number(a.followups_sent ?? 0) + 1 }).eq("lead_id", a.lead_id); }
    }
  }

  // 3) Follow-ups due today (set from "I'll get back to you" etc.): AI writes the message.
  //    Sent automatically only for Autopilot leads inside Instagram's 24h window;
  //    otherwise the draft waits on the task for one-click send or copy.
  if (process.env.AI_FOLLOWUP_DRAFTS_ENABLED === "true") {
    let t = admin.from("tasks").select("id, lead_id, organization_id, title, metadata, due_at")
      .eq("created_by_id", FOLLOWUP_SOURCE).eq("status", "open").lte("due_at", now.toISOString()).order("due_at", { ascending: true }).limit(40);
    if (orgFilter.length) t = t.in("organization_id", orgFilter);
    const { data: due } = await t;
    for (const task of due ?? []) {
      const meta = (task.metadata ?? {}) as Record<string, unknown>;
      if (meta.ai_draft || meta.ai_draft_error) continue;
      if (summary.followupDrafts >= MAX_FOLLOWUP_DRAFTS_PER_RUN) break;
      const draft = await draftCopilotReply({ leadId: String(task.lead_id), knowledgeClient: admin, purpose: "followup" }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "failed" }));
      summary.followupDrafts += 1;
      if (!draft.ok) {
        await admin.from("tasks").update({ metadata: { ...meta, ai_draft_error: draft.error.slice(0, 300), ai_draft_at: new Date().toISOString() } }).eq("id", task.id);
        continue;
      }
      await admin.from("tasks").update({ metadata: { ...meta, ai_draft: draft.draft.slice(0, 2000), ai_draft_at: new Date().toISOString(), ai_draft_model: draft.model } }).eq("id", task.id);
      if (!live) continue;
      const { data: state } = await admin.from("ai_autopilot_leads").select("status").eq("lead_id", task.lead_id).maybeSingle();
      if (state?.status !== "active") continue;
      const { data: last } = await admin.from("messages").select("id, conversation_id, created_at, received_at, direction, conversations!inner(channel, external_account_id)")
        .eq("lead_id", task.lead_id).eq("conversations.channel", "instagram").order("created_at", { ascending: false }).limit(5);
      const lastInbound = (last ?? []).find((x) => x.direction === "inbound");
      if (!lastInbound || !windowOpen(String(lastInbound.received_at || lastInbound.created_at), now)) continue;
      const conv = Array.isArray(lastInbound.conversations) ? lastInbound.conversations[0] : lastInbound.conversations;
      const ok = await sendFollowup(ctx, { leadId: String(task.lead_id), organizationId: String(task.organization_id), conversationId: String(lastInbound.conversation_id), accountId: String((conv as { external_account_id?: string })?.external_account_id ?? ""), anchorMessageId: String(last?.[0]?.id ?? lastInbound.id), presetDraft: draft });
      if (ok) {
        summary.followupsSent += 1;
        await admin.from("tasks").update({ status: "completed", completed_at: new Date().toISOString(), metadata: { ...meta, ai_draft: draft.draft.slice(0, 2000), sent_by_autopilot: true } }).eq("id", task.id);
      }
    }
  }
  return summary;
}

/** Writes, checks and sends one follow-up. Uses the newest message as the run's anchor. */
async function sendFollowup(ctx: Ctx, input: { leadId: string; organizationId: string; conversationId: string; accountId: string; anchorMessageId: string; presetDraft?: CopilotReplyResult }) {
  const { data: claimed, error } = await ctx.admin.from("ai_autopilot_runs").insert({
    organization_id: input.organizationId, lead_id: input.leadId, inbound_message_id: input.anchorMessageId,
    channel: "instagram", mode: "autopilot", status: "draft_ready", would_send: false, kind: "followup", knowledge_used: 0,
  }).select("id").maybeSingle();
  if (error || !claimed?.id) return false;
  const runId = String(claimed.id);
  const draft = input.presetDraft ?? (await draftCopilotReply({ leadId: input.leadId, knowledgeClient: ctx.admin, purpose: "followup" }));
  if (!draft.ok) { await finishRun(ctx, runId, { ...draftFields(draft), status: "skipped", stop_reason: "draft_failed" }); return false; }
  const assessment = await assess(draft.facts?.contextText ?? "", "", draft.draft, "followup");
  const decision = sendDecision({ assessment, draft: draft.draft, routerRisk: draft.risk });
  const base = { ...draftFields(draft), confidence: assessment?.confidence ?? null };
  if (!decision.send) { await finishRun(ctx, runId, { ...base, status: "skipped", stop_reason: decision.reason }); return false; }
  const sent = await sendInstagram(ctx.admin, { organizationId: input.organizationId, leadId: input.leadId, conversationId: input.conversationId, accountId: input.accountId, body: draft.draft, runId });
  if (!sent.ok) { await finishRun(ctx, runId, { ...base, status: "failed", stop_reason: "send_failed", error: sent.error.slice(0, 500) }); return false; }
  await ctx.admin.from("messages").update({ metadata: { provider: "instagram", send_mode: "ai_autopilot", autopilot_run_id: runId, autopilot_kind: "followup" } }).eq("external_message_id", sent.providerMessageId).eq("organization_id", input.organizationId);
  await finishRun(ctx, runId, { ...base, status: "sent", would_send: true, sent_body: draft.draft.slice(0, 4000), provider_message_id: sent.providerMessageId });
  await ctx.admin.from("ai_autopilot_leads").update({ last_ai_message_at: new Date().toISOString() }).eq("lead_id", input.leadId);
  return true;
}
