/**
 * App-wide toasts (owner request, 20 Nov 2026). Call from any client component:
 *   toast.success("Saved successfully")
 *   toast.info("Request in progress", { description: "You'll be notified once it's done." })
 *   toast.error("Something went wrong", { description: "Check your connection and try again.", onRetry })
 * Success and info fade after 2 seconds. Errors fade too, unless they offer Retry.
 */
export type ToastTone = "success" | "info" | "error";
export type ToastOptions = { description?: string; onRetry?: () => void; duration?: number };
export type ToastDetail = ToastOptions & { tone: ToastTone; title: string };

export const TOAST_EVENT = "crm:toast";

function emit(detail: ToastDetail) {
  if (typeof window === "undefined" || !detail.title) return;
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
}

export const toast = {
  success: (title: string, options: ToastOptions = {}) => emit({ ...options, tone: "success", title }),
  info: (title: string, options: ToastOptions = {}) => emit({ ...options, tone: "info", title }),
  error: (title: string, options: ToastOptions = {}) => emit({ ...options, tone: "error", title }),
};
