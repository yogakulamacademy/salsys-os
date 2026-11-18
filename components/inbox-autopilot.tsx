"use client";

import { useState, useTransition } from "react";
import { Bot, Copy, ExternalLink, Hand, MessageSquareReply, Check } from "lucide-react";

import { completeFollowupTaskAction, setAutopilotStateAction } from "@/app/conversations/autopilot-live-actions";
import type { InboxAutopilotState, InboxFollowupDraft } from "@/lib/autopilot-inbox-data";

/** Autopilot status for the open lead, with Take over / Hand to AI. */
export function InboxAutopilotBar({ leadId, state, canHandToAi }: { leadId: string; state: InboxAutopilotState; canHandToAi: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (action: "take_over" | "hand_to_ai" | "acknowledge") => start(async () => {
    setError(null);
    const result = await setAutopilotStateAction(leadId, action);
    if (!result.ok) setError(result.error);
  });

  if (state.status === "off" && !canHandToAi) return null;
  const tone = state.status === "active" ? "bg-emerald-50 text-emerald-900" : state.status === "handed_over" ? "bg-rose-50 text-rose-900" : "bg-surface-soft text-copy-muted";
  return (
    <div className={`ibx-autopilot flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 text-[12px] ${tone}`} role="status">
      <Bot size={14} aria-hidden />
      <p className="min-w-0 flex-1">
        {state.status === "active" && <><strong>AI Autopilot is handling this lead.</strong> {state.aiMessagesSent} AI {state.aiMessagesSent === 1 ? "reply" : "replies"} sent.{state.liveEnabled ? "" : " (Autopilot is switched off, so nothing is being sent.)"}</>}
        {state.status === "handed_over" && <><strong>Needs you:</strong> {state.handoverLabel}{state.handoverDetail && state.handoverDetail !== state.handoverLabel ? ` — ${state.handoverDetail}` : ""}. The AI has stopped on this lead.</>}
        {state.status === "paused" && <>You're handling this lead. The AI won't reply.</>}
        {state.status === "completed" && <>Autopilot finished with this lead.</>}
        {state.status === "off" && <>Not on Autopilot.</>}
        {error ? <span className="ml-2 text-rose-700">{error}</span> : null}
      </p>
      {state.status === "active" ? (
        <button type="button" disabled={pending} onClick={() => act("take_over")} className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 font-semibold text-copy hover:bg-surface-soft disabled:opacity-60">
          <Hand size={13} aria-hidden /> Take over
        </button>
      ) : null}
      {state.status === "handed_over" ? (
        <button type="button" disabled={pending} onClick={() => act("take_over")} className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 font-semibold text-copy hover:bg-surface-soft disabled:opacity-60">
          <Check size={13} aria-hidden /> I'll handle it
        </button>
      ) : null}
      {canHandToAi && state.status !== "active" ? (
        <button type="button" disabled={pending} onClick={() => act("hand_to_ai")} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          <Bot size={13} aria-hidden /> Hand to AI
        </button>
      ) : null}
    </div>
  );
}

/** A follow-up is due today and the AI has written it. */
export function InboxFollowupDraftCard({ followup }: { followup: InboxFollowupDraft }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return null;
  const useInReply = () => window.dispatchEvent(new CustomEvent("crm:copilot-draft", { detail: { channel: "instagram", body: followup.draft, source: "ai_followup" } }));
  const copy = async () => { try { await navigator.clipboard.writeText(followup.draft); setCopied(true); } catch { setError("Couldn't copy. Select the text instead."); } };
  const markDone = () => start(async () => { const r = await completeFollowupTaskAction(followup.taskId); if (r.ok) setDone(true); else setError(r.error); });
  return (
    <section className="ibx-followup-draft border-t border-line bg-amber-50 px-4 py-3 text-[12px] text-amber-950" aria-label="Follow-up due">
      <div className="flex items-center gap-2 font-semibold"><MessageSquareReply size={14} aria-hidden /> Follow-up due: {followup.title}</div>
      <p className="mt-2 whitespace-pre-wrap rounded-md border border-amber-200 bg-white px-3 py-2 text-copy">{followup.draft}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {followup.windowOpen ? (
          <button type="button" onClick={useInReply} className="rounded-md bg-brand-600 px-2.5 py-1 font-semibold text-white hover:bg-brand-700">Put in reply box</button>
        ) : (
          <>
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 font-semibold text-white hover:bg-brand-700"><Copy size={13} aria-hidden /> {copied ? "Copied" : "Copy message"}</button>
            {followup.instagramUsername ? (
              <a href={`https://ig.me/m/${encodeURIComponent(followup.instagramUsername)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold hover:bg-amber-100"><ExternalLink size={13} aria-hidden /> Open in Instagram</a>
            ) : null}
          </>
        )}
        <button type="button" disabled={pending} onClick={markDone} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold hover:bg-amber-100 disabled:opacity-60">Mark sent</button>
        {error ? <span className="text-rose-700">{error}</span> : null}
      </div>
      {!followup.windowOpen ? (
        <p className="mt-2 text-[11px] text-amber-900/80">Instagram only lets software message a lead within 24 hours of their last message, so send this one from the Instagram app, then click Mark sent.</p>
      ) : null}
    </section>
  );
}
