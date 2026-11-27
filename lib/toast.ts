/**
 * App-wide toasts (owner request, 20 Nov 2026). Call from any client component:
 *   toast.success("Saved successfully")
 *   toast.info("Request in progress", { description: "You'll be notified once it's done." })
 *   toast.error("Something went wrong", { description: "Check your connection and try again.", onRetry })
 * Success and info fade after 2 seconds. Errors fade too, unless they offer Retry.
 */
export type ToastTone = "success" | "info" | "warning" | "error";
export type ToastOptions = { description?: string; onRetry?: () => void; duration?: number };
export type ToastDetail = ToastOptions & { tone: ToastTone; title: string };

export const TOAST_EVENT = "crm:toast";
let hosts = 0;
const pending: ToastDetail[] = [];

/** Preserve feedback emitted by children before the root host's effect mounts. */
export function registerToastHost() {
  hosts++;
  for (const detail of pending.splice(0)) window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
  return () => { hosts = Math.max(0, hosts - 1); };
}

function emit(detail: ToastDetail) {
  if (typeof window === "undefined" || !detail.title) return;
  if (!hosts) { pending.push(detail); if (pending.length > 5) pending.shift(); return; }
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
}

export const toast = {
  success: (title: string, options: ToastOptions = {}) => emit({ ...options, tone: "success", title }),
  info: (title: string, options: ToastOptions = {}) => emit({ ...options, tone: "info", title }),
  warning: (title: string, options: ToastOptions = {}) => emit({ ...options, tone: "warning", title }),
  error: (title: string, options: ToastOptions = {}) => emit({ ...options, tone: "error", title }),
};
