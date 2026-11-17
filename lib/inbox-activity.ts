// How Inbox Activity rows are grouped and labelled. Pure, so it can be tested.

export type ActivityKind = "message" | "contact" | "note" | "followup" | "update" | "source";
export type ActivityFilter = "all" | "messages" | "contacts" | "followups" | "updates";

export const ACTIVITY_FILTERS: Array<[ActivityFilter, string]> = [
  ["all", "All"],
  ["messages", "Messages"],
  ["contacts", "Calls & notes"],
  ["followups", "Follow-ups"],
  ["updates", "Updates"],
];

export const KIND_LABEL: Record<ActivityKind, string> = {
  message: "Message",
  contact: "Contact",
  note: "Note",
  followup: "Follow-up",
  update: "Update",
  source: "Source",
};

// Channels whose interactions are already shown as real messages in the thread.
const MESSAGE_CHANNELS = new Set(["instagram", "whatsapp", "website", "messenger", "facebook"]);

export type ActivityLike = { activity_type: string; channel: string | null; actor_type?: string | null };

/** An inbound/outbound interaction on a messaging channel repeats a chat message. */
export function isMessageEcho(row: ActivityLike): boolean {
  const interaction = row.activity_type === "inbound_interaction" || row.activity_type === "outbound_interaction";
  return interaction && (row.channel == null || MESSAGE_CHANNELS.has(row.channel.toLowerCase()));
}

export function activityKind(row: ActivityLike): ActivityKind {
  const t = row.activity_type;
  if (t === "internal_note" || t === "note") return "note";
  if (t.startsWith("followup") || t.startsWith("follow_up") || t.includes("task")) return "followup";
  if (t === "inbound_interaction" || t === "outbound_interaction") return isMessageEcho(row) ? "message" : "contact";
  if (t === "lead_created" || t.startsWith("website_") || t.includes("attribution") || t.includes("touchpoint")) return "source";
  return "update";
}

export function matchesFilter(kind: ActivityKind, filter: ActivityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "messages") return kind === "message";
  if (filter === "contacts") return kind === "contact" || kind === "note";
  if (filter === "followups") return kind === "followup";
  return kind === "update" || kind === "source";
}

/** Plain-English title for activity types that have no stored title. */
export function activityTitle(row: ActivityLike & { title?: string | null }): string {
  if (row.title?.trim()) return row.title.trim();
  const t = row.activity_type;
  const ch = row.channel ? row.channel.replaceAll("_", " ") : null;
  const map: Record<string, string> = {
    lead_created: "Lead created",
    website_lead_created: "Website enquiry received",
    website_form_repeat: "Submitted the website form again",
    followup_created: "Follow-up scheduled",
    followup_completed: "Follow-up completed",
    owner_assignment: "Owner changed",
    lead_context_updated: "Lead details updated",
    internal_note: "Internal note",
    note: "Note",
  };
  if (map[t]) return map[t];
  if (t === "outbound_interaction") return ch === "phone" ? "Call made" : `Contact logged${ch ? ` · ${ch}` : ""}`;
  if (t === "inbound_interaction") return ch === "phone" ? "Call received" : `Lead got in touch${ch ? ` · ${ch}` : ""}`;
  return t.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}
