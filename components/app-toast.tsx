"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { registerToastHost, toast, TOAST_EVENT, type ToastDetail } from "@/lib/toast";

type Item = ToastDetail & { id: number; leaving: boolean };

const ICON = { success: CheckCircle2, info: Info, warning: AlertTriangle, error: XCircle } as const;

/** Mounted once in the root layout. Shows toasts sent with lib/toast. */
export function AppToastHost() {
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef(new Map<number, number>());
  const nextId = useRef(1);
  const recent = useRef(new Map<string, number>());

  const close = (id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 220);
  };
  const schedule = (item: Item) => {
    const sticky = item.tone === "error" && item.onRetry;
    if (sticky) return;
    const ms = item.duration ?? (item.tone === "error" || item.tone === "warning" ? 6000 : 2000);
    timers.current.set(item.id, window.setTimeout(() => close(item.id), ms));
  };

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      if (!detail?.title) return;
      const key = `${detail.tone}:${detail.title}:${detail.description ?? ''}`;
      const now = Date.now();
      if (now - (recent.current.get(key) ?? 0) < 1200) return;
      recent.current.set(key, now);
      for (const [entry, time] of recent.current) if (now - time > 10000) recent.current.delete(entry);
      const item: Item = { ...detail, id: nextId.current++, leaving: false };
      setItems((list) => [...list.slice(-3), item]);
      schedule(item);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    const unregister = registerToastHost();
    return () => { unregister(); window.removeEventListener(TOAST_EVENT, onToast); timers.current.forEach(window.clearTimeout); timers.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!items.length) return null;
  return (
    <div className="app-toasts" aria-live="polite">
      {items.map((item) => {
        const Icon = ICON[item.tone];
        return (
          <div key={item.id} role={item.tone === "error" || item.tone === "warning" ? "alert" : "status"}
            className={`app-toast is-${item.tone} ${item.leaving ? "is-leaving" : ""}`}
            onMouseEnter={() => { window.clearTimeout(timers.current.get(item.id)); }}
            onMouseLeave={() => schedule(item)}>
            <Icon className="app-toast-icon" size={20} aria-hidden strokeWidth={2.2} />
            <div className="app-toast-body">
              <p className="app-toast-title">{item.title}</p>
              {item.description ? <p className="app-toast-text">{item.description}</p> : null}
              {item.onRetry ? (
                <div className="app-toast-actions">
                  <button type="button" className="is-primary" onClick={() => { close(item.id); item.onRetry?.(); }}>Retry</button>
                  <button type="button" onClick={() => close(item.id)}>Dismiss</button>
                </div>
              ) : null}
            </div>
            <button type="button" className="app-toast-close" aria-label="Close" onClick={() => close(item.id)}>
              <X size={16} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Turns a page's ?notice= / ?error= result into a toast once, then removes
 * those params from the address without reloading. Use instead of a banner.
 */
export function ToastOnLoad({ message, error, description }: { message?: string | null; error?: string | null; description?: string | null }) {
  useEffect(() => {
    if (!message && !error) return;
    if (error) toast.error('Something went wrong', { description: error });
    else toast.success(message as string, { description: description ?? undefined });
    const url = new URL(window.location.href);
    if (['notice', 'error', 'error_description', 'error_message'].some(key => url.searchParams.has(key))) {
      url.searchParams.delete("notice");
      url.searchParams.delete("error");
      url.searchParams.delete('error_description');
      url.searchParams.delete('error_message');
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, [message, error, description]);
  return null;
}
