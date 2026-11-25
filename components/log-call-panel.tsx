"use client";

import { useState, useTransition } from "react";

import { CALL_ANSWERS, NEXT_STEPS, defaultNextDays, type CallAnswer } from "@/lib/log-call";
import { toast } from "@/lib/toast";

// "Log a call in two taps" (owner-approved mockup, 25 Nov 2026): how it went,
// the next step, an optional note. Saves in place with a toast; nothing is sent.

type Action = (fd: FormData) => Promise<{ ok: boolean; message: string }>;

const chip = (on: boolean) =>
  `inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-semibold transition ${
    on
      ? "border-brand-600 bg-brand-600 text-white"
      : "border-line bg-surface text-copy-strong hover:border-line-strong"
  }`;

export function LogCallPanel({ leadName, action, prompt, onDone, onCancel, compact = false }: {
  leadName: string;
  action: Action;
  /** e.g. "You tapped her number 4 minutes ago" */
  prompt?: string | null;
  onDone?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [answer, setAnswer] = useState<CallAnswer | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const nextDays = next ?? (answer ? defaultNextDays(answer) : 0);
  const first = leadName.split(/\s+/)[0] || leadName;

  const save = () => {
    if (!answer || pending) return;
    const fd = new FormData();
    fd.set("answer", answer);
    fd.set("next_days", String(nextDays));
    fd.set("direction", direction);
    fd.set("note", note);
    start(async () => {
      const r = await action(fd);
      if (r.ok) {
        toast.success(r.message);
        setAnswer(null); setNext(null); setNote("");
        onDone?.();
      } else {
        toast.error("Something went wrong", { description: r.message });
      }
    });
  };

  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-line bg-surface ${compact ? "p-3" : "p-4 shadow-xs"}`}>
      <div>
        <p className="text-[14px] font-bold text-copy-strong">How did the call with {first} go?</p>
        {prompt ? <p className="text-[12px] text-copy-muted">{prompt}</p> : null}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="How the call went">
        {CALL_ANSWERS.map((a) => (
          <button key={a.key} type="button" aria-pressed={answer === a.key} className={chip(answer === a.key)}
            onClick={() => { setAnswer(a.key); setNext(null); }}>{a.label}</button>
        ))}
      </div>
      <div>
        <p className="mb-1.5 text-[11.5px] font-bold text-copy-muted">Next step</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Next step">
          {NEXT_STEPS.map((s) => (
            <button key={s.days} type="button" aria-pressed={nextDays === s.days} disabled={!answer}
              className={`${chip(Boolean(answer) && nextDays === s.days)} disabled:opacity-50`} onClick={() => setNext(s.days)}>{s.label}</button>
          ))}
        </div>
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={compact ? 2 : 3}
        placeholder={'Note (optional) · e.g. "Will pay after salary on 1 Dec"'}
        className="w-full rounded-[9px] border border-line bg-surface px-2.5 py-2 text-[13px] text-copy-strong" aria-label="Note" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={!answer || pending} className="btn-primary h-9">{pending ? "Saving…" : "Save"}</button>
        {onCancel ? <button type="button" onClick={onCancel} className="btn-secondary h-9">Skip</button> : null}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-copy-muted">
          <select value={direction} onChange={(e) => setDirection(e.target.value === "inbound" ? "inbound" : "outbound")}
            className="h-8 rounded-lg border border-line bg-surface px-1.5 text-[12px] text-copy-strong" aria-label="Who called">
            <option value="outbound">We called</option>
            <option value="inbound">They called</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] text-copy-subtle">
        {answer === "will_pay" || answer === "paid"
          ? "Moves them to Payment pending so it shows in Check who paid. "
          : answer === "not_now" ? "Moves them to Not now; they can come back. " : ""}
        Saved to their timeline. Nothing is sent to {first}.
      </p>
    </div>
  );
}
