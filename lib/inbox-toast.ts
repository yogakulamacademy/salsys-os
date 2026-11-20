import { toast } from "@/lib/toast";

/** Inbox results as app-wide toasts. An error message becomes the description under "Something went wrong". */
export type InboxToastTone = "success" | "error";

export function showInboxToast(message: string, tone: InboxToastTone = "success", onRetry?: () => void) {
  if (!message) return;
  if (tone === "error") toast.error("Something went wrong", { description: message, onRetry });
  else toast.success(message);
}
