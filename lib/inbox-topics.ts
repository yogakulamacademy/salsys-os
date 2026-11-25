// Shared (client + server) Inbox topic constants for "What people are asking".
// Topics are assigned in the database by app_private.inbox_topic_v1 from the
// lead's latest inbound message. "interested" is always shown first (owner
// request, 25 Nov 2026); the rest are sorted by count.
export const PINNED_TOPIC: InboxTopicKey = "interested";
export const INBOX_TOPICS = ["interested", "fee", "dates", "register", "accommodation", "online_offline", "location", "certification"] as const;
export type InboxTopicKey = (typeof INBOX_TOPICS)[number];
export type InboxTopic = "all" | InboxTopicKey | "other";
export const INBOX_TOPIC_LABELS: Record<InboxTopicKey, string> = {
  interested: "Interested",
  fee: "Fees",
  dates: "Dates & batches",
  register: "How to register",
  accommodation: "Accommodation",
  online_offline: "Online or in person",
  location: "Location",
  certification: "Certification",
};

export const CHANNEL_CHIPS = [
  { value: "all", label: "All", color: "#5743c5" },
  { value: "whatsapp", label: "WhatsApp", color: "#12703f" },
  { value: "instagram", label: "Instagram", color: "#a3195b" },
  { value: "website", label: "Website", color: "#1d4ed8" },
] as const;
