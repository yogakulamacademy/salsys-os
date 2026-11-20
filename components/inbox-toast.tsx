"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { InboxToastTone } from "@/lib/inbox-toast";

type Toast = { id: number; message: string; tone: InboxToastTone; leaving: boolean };

/**
 * Small toast for Inbox results (owner request, 20 Nov 2026): shows what happened,
 * fades after 2 seconds. Replaces the full-width success / error banners.
 * Also picks up ?notice= / ?error= left by actions that still redirect, then
 * removes them from the address without reloading.
 */
export function InboxToastHost({ initialMessage, initialError }: { initialMessage?: string | null; initialError?: string | null }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const push = (message: string, tone: InboxToastTone) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, message, tone, leaving: false }]);
      window.setTimeout(() => setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), 2000);
      window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2350);
    };
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; tone?: InboxToastTone }>).detail;
      if (detail?.message) push(detail.message, detail.tone ?? "success");
    };
    window.addEventListener("crm:inbox-toast", onToast);
    return () => window.removeEventListener("crm:inbox-toast", onToast);
  }, []);

  useEffect(() => {
    if (!initialMessage && !initialError) return;
    window.dispatchEvent(new CustomEvent("crm:inbox-toast", {
      detail: initialError ? { message: initialError, tone: "error" } : { message: initialMessage, tone: "success" },
    }));
    const url = new URL(window.location.href);
    if (url.searchParams.has("notice") || url.searchParams.has("error")) {
      url.searchParams.delete("notice");
      url.searchParams.delete("error");
      window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : ""));
    }
  }, [initialMessage, initialError]);

  if (!toasts.length) return null;
  return (
    <div className="inbox-toasts" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`inbox-toast is-${t.tone} ${t.leaving ? "is-leaving" : ""}`}>
          {t.tone === "error" ? <AlertCircle size={15} aria-hidden /> : <CheckCircle2 size={15} aria-hidden />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
