"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ShieldAlert } from "lucide-react";

import { getShadowDraftAction, recordShadowOutcomeAction, type ShadowDraft } from "@/app/conversations/autopilot-shadow-actions";

type Ready = Extract<ShadowDraft, { ok: true }>;

/**
 * Autopilot shadow mode (Instagram): drafts the reply when a conversation needing
 * a reply is opened, fills the reply box if it is empty, and records how much the
 * person changed it when they send. Never sends anything itself.
 */
export function InboxShadowDraft({ leadId }: { leadId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "hidden" | "error">("loading");
  const [run, setRun] = useState<Ready | null>(null);
  const [filled, setFilled] = useState(false);
  const recorded = useRef(false);

  useEffect(() => {
    let alive = true;
    recorded.current = false;
    setState("loading");
    getShadowDraftAction(leadId)
      .then((result) => {
        if (!alive) return;
        if (!result.ok) { setState(result.disabled ? "hidden" : "error"); return; }
        setRun(result);
        setState("ready");
        if (result.draft) {
          const box = document.getElementById(`reply-draft-${leadId}`) as HTMLTextAreaElement | null;
          if (!box || !box.value.trim()) {
            window.dispatchEvent(new CustomEvent("crm:copilot-draft", { detail: { channel: "instagram", body: result.draft, source: "autopilot_shadow" } }));
            setFilled(true);
          }
        }
      })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [leadId]);

  useEffect(() => {
    if (!run?.draft || !run.runId) return;
    const onSent = (event: Event) => {
      const body = (event as CustomEvent<{ body?: string }>).detail?.body;
      if (!body || recorded.current) return;
      recorded.current = true;
      void recordShadowOutcomeAction({ runId: run.runId, draft: run.draft ?? "", sentBody: body });
    };
    window.addEventListener("crm:instagram-sent", onSent);
    return () => window.removeEventListener("crm:instagram-sent", onSent);
  }, [run]);

  if (state === "hidden") return null;
  if (state === "loading") {
    return <div className="ibx-shadow-draft border-t border-line bg-brand-50 px-4 py-2 text-[11px] text-copy-muted" role="status">AI is drafting a reply (shadow mode)…</div>;
  }
  if (state === "error" || !run) {
    return <div className="ibx-shadow-draft border-t border-line bg-surface-soft px-4 py-2 text-[11px] text-copy-muted">AI draft unavailable for this message; reply as usual.</div>;
  }
  return (
    <div className={`ibx-shadow-draft flex items-start gap-2 border-t border-line px-4 py-2 text-[11px] ${run.wouldSend ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`} role="status">
      {run.wouldSend ? <Bot size={14} className="mt-0.5 shrink-0" aria-hidden /> : <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />}
      <p>
        <strong className="font-semibold">Autopilot shadow mode:</strong>{" "}
        {run.draft ? (filled ? "the AI's draft is in the reply box; review it and send as usual. " : "the AI drafted a reply, but your own draft was kept. ") : "the AI did not draft this one. "}
        {run.wouldSend
          ? "Live Autopilot would have sent this by itself."
          : `Live Autopilot would hand this to you: ${run.stopLabel ?? "needs a person"}.`}
      </p>
    </div>
  );
}
