/** Plain-words messages for Inbox notice codes. Pure: used by the page and inline actions. */
export function noticeFor(value?: string | null) {
  if (value === "whatsapp-sent") return "WhatsApp message sent.";
  if (value === "whatsapp-template-sent") return "WhatsApp template sent.";
  if (value === "whatsapp-started") return "WhatsApp conversation started.";
  if (value === "lead-context-updated") return "Lead details updated.";
  if (value === "interaction-logged") return "Call recorded on the lead.";
  if (value === "owner-updated") return "Conversation owner updated across CRM and open work.";
  if (value === "conversation-snoozed") return "Conversation snoozed in your inbox.";
  if (value === "conversation-unsnoozed") return "Conversation returned to your active inbox.";
  if (value === "conversation-done") return "Conversation marked done. New inbound messages will reopen it.";
  if (value === "conversation-reopened") return "Conversation returned to the active reply queue.";
  if (value === "inbox-stage-updated") return "Lead stage updated and recorded in CRM history.";
  return value ? "Interaction logged." : null;
}
