import type { SupabaseClient } from "@supabase/supabase-js";

import { locationFromText } from "@/lib/lead-interests";
import {
  decideStageMove,
  isAdStarter,
  parseStageAnswer,
  ruleBasedSignal,
  STAGE_LABEL,
  STAGE_SCHEMA,
  stageSystemPrompt,
  stageUserPrompt,
  strongerSignal,
  type AiStageSignal,
} from "@/lib/lead-stages";

// Automatic pipeline stages (task #21). Runs every 10 minutes from
// /api/leads/stages/scan. AI_STAGE_AUTOMATION_MODE: "off" (default), "dry_run"
// (decide and report, change nothing) or "live".

export type StageMode = "off" | "dry_run" | "live";
export function stageAutomationMode(): StageMode {
  const v = process.env.AI_STAGE_AUTOMATION_MODE?.trim().toLowerCase();
  return v === "live" || v === "dry_run" ? v : "off";
}

const FINAL = ["closed_won", "enrolled", "lost", "unqualified", "duplicate"];
const ACTOR_ID = "ai_stage_v1";
const LOST_TASK_ID = "ai_stage_lost_v1";
const PLAN_WORDS = /\b(online|offline|in[- ]person|residential|onsite|on campus|jan(uary)?|feb(ruary)?|march|april|may|june|july|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?|next month|this month|next year|weekend|weekday)\b/i;

type Msg = { body: string | null; direction: string; created_at: string };
export type StageDecisionLog = { leadId: string; from: string; to: string | null; action: string; why: string; evidence: string; method: "rule" | "ai" };

async function classifyWithClaude(lines: Array<{ who: "lead" | "team"; text: string }>) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_HAIKU_MODEL?.trim() || process.env.ANTHROPIC_COPILOT_MODEL?.trim();
  if (!apiKey || !model) return null;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      system: stageSystemPrompt(),
      messages: [{ role: "user", content: stageUserPrompt(lines) }],
      output_config: { format: { type: "json_schema", schema: STAGE_SCHEMA } },
    }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { content?: Array<{ text?: string }> };
  return parseStageAnswer(payload.content?.find((b) => typeof b.text === "string")?.text ?? "");
}

export async function scanLeadStage(admin: SupabaseClient, leadId: string, mode: StageMode, now: Date): Promise<StageDecisionLog | null> {
  const { data: lead } = await admin
    .from("leads")
    .select("id, organization_id, current_stage, interested_course_id, owner_user_id, metadata")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;
  const meta = (lead.metadata ?? {}) as Record<string, unknown>;
  const markScanned = async () => {
    if (mode === "live") await admin.from("leads").update({ metadata: { ...meta, stage_scanned_at: now.toISOString() } }).eq("id", leadId);
  };
  const current = String(lead.current_stage);
  if (FINAL.includes(current)) { await markScanned(); return null; }

  const [{ data: recent }, { count: inboundCount }, { count: outboundCount }, { data: manual }] = await Promise.all([
    admin.from("messages").select("body, direction, created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(12),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("lead_id", leadId).eq("direction", "inbound"),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("lead_id", leadId).eq("direction", "outbound"),
    admin.from("lead_stage_history").select("changed_at").eq("lead_id", leadId).eq("changed_by_type", "human").order("changed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const msgs = ((recent ?? []) as Msg[]).reverse();
  const inbound = msgs.filter((m) => m.direction === "inbound" && m.body?.trim());
  // Only words the lead typed count as a plan: a shared post's caption ("…in
  // Mysore… November batch") or an ad button ("How do I register for 200-Hour
  // YTT in Mysore?") is our text, not theirs.
  const typed = inbound.filter((m) => !isAdStarter(m.body) && !/^(Shared an Instagram|\[Instagram )/i.test(m.body ?? ""));
  const hasPlan = typed.some((m) => PLAN_WORDS.test(m.body ?? "") || locationFromText(m.body) != null);

  const rule = ruleBasedSignal({ inboundCount: inboundCount ?? 0, outboundCount: outboundCount ?? 0, hasMainCourse: Boolean(lead.interested_course_id), hasPlan });
  const ruleEvidence = rule === "contacted" ? "We messaged them; no reply yet." : rule === "qualified" ? `Main course known and they shared a plan: "${(typed.find((m) => PLAN_WORDS.test(m.body ?? "") || locationFromText(m.body))?.body ?? "").slice(0, 100)}"` : "";

  // Ask the AI only when the lead wrote something since the last scan.
  const lastInboundAt = inbound.at(-1)?.created_at ?? null;
  const scannedAt = typeof meta.stage_scanned_at === "string" ? meta.stage_scanned_at : null;
  let ai: { stage: AiStageSignal; confidence: number; evidence: string } | null = null;
  if (lastInboundAt && (!scannedAt || Date.parse(lastInboundAt) > Date.parse(scannedAt))) {
    const lines = msgs.filter((m) => m.body?.trim()).slice(-10).map((m) => ({ who: (m.direction === "inbound" ? "lead" : "team") as "lead" | "team", text: m.body ?? "" }));
    ai = await classifyWithClaude(lines).catch(() => null);
  }

  const aiSignal = ai?.stage ?? "none";
  const signal = strongerSignal(aiSignal, rule);
  const fromAi = signal !== "none" && signal === aiSignal;
  const confidence = fromAi ? ai!.confidence : 1;
  const evidence = fromAi ? ai!.evidence : ruleEvidence;

  const decision = decideStageMove({ current, signal, confidence, lastManualMoveAt: manual?.changed_at ?? null, now });
  const log: StageDecisionLog = {
    leadId, from: current, to: decision.action === "move" ? decision.to : decision.action === "suggest_lost" ? "lost?" : null,
    action: decision.action, why: decision.action === "none" ? decision.why : "", evidence, method: fromAi ? "ai" : "rule",
  };

  if (mode === "live" && decision.action === "move") {
    const reason = `AI moved from ${STAGE_LABEL[current] ?? current} to ${STAGE_LABEL[decision.to] ?? decision.to}${evidence ? `: ${evidence}` : ""}`.slice(0, 480);
    const { error } = await admin.rpc("set_lead_stage", {
      p_lead_id: leadId, p_new_stage: decision.to, p_changed_by_type: "ai", p_changed_by_id: ACTOR_ID, p_reason: reason,
    });
    if (error) throw new Error(`Stage move failed: ${error.message}`);
    await admin.from("activities").insert({
      lead_id: leadId, activity_type: "ai_stage_move", actor_type: "ai", actor_id: ACTOR_ID,
      title: `Stage moved to ${STAGE_LABEL[decision.to] ?? decision.to} automatically`,
      details: evidence || null,
      metadata: { from: current, to: decision.to, confidence, method: log.method, source: ACTOR_ID },
    });
  }

  if (mode === "live" && decision.action === "suggest_lost") {
    const { data: open } = await admin.from("tasks").select("id").eq("lead_id", leadId).eq("created_by_id", LOST_TASK_ID).eq("status", "open").limit(1);
    if (!open?.length) {
      await admin.from("tasks").insert({
        organization_id: lead.organization_id, lead_id: leadId, task_type: "human_review",
        title: "AI suggests marking this lead Lost: please confirm",
        description: `From their messages: ${evidence || "they seem to have declined"}. Move to Lost if you agree, or reply to win them back.`.slice(0, 1000),
        status: "open", due_at: now.toISOString(), assigned_to: lead.owner_user_id ?? null,
        created_by_type: "ai", created_by_id: LOST_TASK_ID, metadata: { source: LOST_TASK_ID, confidence },
      });
    }
  }

  await markScanned();
  return log;
}

/** Leads with messages in the last 30 minutes, plus open leads never scanned (backfill). */
export async function runStageScan(admin: SupabaseClient, mode: StageMode, now = new Date(), backfill = 60) {
  const since = new Date(now.getTime() - 30 * 60_000).toISOString();
  const [{ data: recentMsgs }, { data: unscanned }] = await Promise.all([
    admin.from("messages").select("lead_id").gte("created_at", since).not("lead_id", "is", null).limit(500),
    admin.from("leads").select("id").is("metadata->>stage_scanned_at", null).not("current_stage", "in", `(${FINAL.join(",")})`)
      .order("updated_at", { ascending: false }).limit(backfill),
  ]);
  const ids = [...new Set([...(recentMsgs ?? []).map((m: { lead_id: string | null }) => String(m.lead_id)), ...(unscanned ?? []).map((l: { id: string }) => String(l.id))])].filter((id) => id && id !== "null");

  const decisions: StageDecisionLog[] = [];
  let scanned = 0; let moved = 0; let lostSuggested = 0; let errors = 0;
  for (const id of ids) {
    try {
      const log = await scanLeadStage(admin, id, mode, now);
      scanned += 1;
      if (!log) continue;
      if (log.action === "move") moved += 1;
      if (log.action === "suggest_lost") lostSuggested += 1;
      if (log.action !== "none") decisions.push(log);
    } catch (err) {
      errors += 1;
      console.error("Stage scan failed", { leadId: id, error: err instanceof Error ? err.message : "unknown" });
    }
  }
  return { mode, scanned, moved, lostSuggested, errors, decisions: decisions.slice(0, 60) };
}
