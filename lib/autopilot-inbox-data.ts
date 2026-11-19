import "server-only";

import { HANDOVER_LABELS, type HandoverReason } from "@/lib/autopilot-live";
import { getOrgSalesAiSettings } from "@/lib/org-sales-ai-settings";
import { createClient } from "@/lib/supabase/server";

export type InboxAutopilotState = {
  status: "active" | "paused" | "handed_over" | "completed" | "off";
  aiMessagesSent: number;
  handoverLabel: string | null;
  handoverDetail: string | null;
  liveEnabled: boolean;
};

export type InboxFollowupDraft = {
  taskId: string;
  title: string;
  dueAt: string;
  draft: string;
  windowOpen: boolean;
  instagramUsername: string | null;
};

/** Autopilot state and any due AI follow-up draft for the open lead (user-scoped, RLS). */
export async function getInboxAutopilot(leadId: string): Promise<{ state: InboxAutopilotState; followup: InboxFollowupDraft | null }> {
  const supabase = await createClient();
  const [{ data: row }, { data: tasks }, { data: lastInbound }, { data: handle }] = await Promise.all([
    supabase.from("ai_autopilot_leads").select("status, ai_messages_sent, handover_reason, handover_detail").eq("lead_id", leadId).maybeSingle(),
    supabase.from("tasks").select("id, title, due_at, metadata").eq("lead_id", leadId).eq("status", "open")
      .eq("created_by_id", "ai_followup_detection_v1").lte("due_at", new Date().toISOString()).order("due_at", { ascending: true }).limit(3),
    supabase.from("messages").select("created_at, received_at").eq("lead_id", leadId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("lead_contacts").select("value").eq("lead_id", leadId).eq("contact_type", "instagram_username").limit(1).maybeSingle(),
  ]);
  // On when the CRM-wide switch and this lead's business setting are both on.
  const { data: leadOrg } = await supabase.from("leads").select("organization_id").eq("id", leadId).maybeSingle();
  const liveEnabled = process.env.AI_AUTOPILOT_LIVE_ENABLED === "true" && Boolean(leadOrg?.organization_id) &&
    (await getOrgSalesAiSettings(supabase, String(leadOrg?.organization_id))).autopilotEnabled;
  const reason = (row?.handover_reason ?? null) as HandoverReason | null;
  const state: InboxAutopilotState = {
    status: (row?.status as InboxAutopilotState["status"]) ?? "off",
    aiMessagesSent: Number(row?.ai_messages_sent ?? 0),
    handoverLabel: reason ? HANDOVER_LABELS[reason] ?? reason : null,
    handoverDetail: row?.handover_detail ?? null,
    liveEnabled,
  };
  const task = (tasks ?? []).find((t) => typeof (t.metadata as Record<string, unknown> | null)?.ai_draft === "string");
  const at = Date.parse(String(lastInbound?.received_at || lastInbound?.created_at || ""));
  const followup = task ? {
    taskId: task.id, title: task.title, dueAt: task.due_at,
    draft: String((task.metadata as Record<string, unknown>).ai_draft),
    windowOpen: Number.isFinite(at) && Date.now() - at < 23.5 * 3_600_000,
    instagramUsername: handle?.value ?? null,
  } : null;
  return { state, followup };
}
