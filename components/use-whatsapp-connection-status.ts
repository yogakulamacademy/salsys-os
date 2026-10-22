"use client";

import { useCallback, useEffect, useState } from "react";

export type WhatsAppConnectionState =
  | "loading"
  | "connected"
  | "disconnected"
  | "unavailable";

type StatusResponse =
  | {
      ok: true;
      state: "connected" | "disconnected";
      verifiedAt?: string | null;
      reason?: string | null;
    }
  | { ok: false; error: string };

export function useWhatsAppConnectionStatus() {
  const [state, setState] = useState<WhatsAppConnectionState>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError(null);

    try {
      const response = await fetch("/api/integrations/whatsapp/status", {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const body = (await response.json()) as StatusResponse;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "Unable to verify WhatsApp." : body.error);
      }

      setState(body.state);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setState("unavailable");
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to verify WhatsApp connection state.",
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return { state, error, refresh };
}
