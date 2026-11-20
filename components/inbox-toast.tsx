"use client";

import { ToastOnLoad } from "@/components/app-toast";

/** Inbox results show as app-wide toasts (see components/app-toast.tsx). */
export function InboxToastHost({ initialMessage, initialError }: { initialMessage?: string | null; initialError?: string | null }) {
  return <ToastOnLoad message={initialMessage} error={initialError} />;
}
