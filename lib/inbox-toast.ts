/** Show a small Inbox toast (fades after 2 seconds). Safe to import in client components. */
export type InboxToastTone = "success" | "error";

export function showInboxToast(message: string, tone: InboxToastTone = "success") {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent("crm:inbox-toast", { detail: { message, tone } }));
}
