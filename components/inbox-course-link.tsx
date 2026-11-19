"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useState, useTransition } from "react";

import { getTrackedCourseLinkAction } from "@/app/conversations/tracked-link-actions";

export type InboxCourseLinkStatus = {
  url: string;
  courseName: string | null;
  sentAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  visitCountryName: string | null;
  visitRegion: string | null;
};

function ago(iso: string | null) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Course link card in the Inbox side panel (DM-LINK): whether the lead opened
 * their course link and from which country. The visit country is the network's
 * approximate location when the link was opened, not nationality or residence:
 * the team decides pricing.
 */
export function InboxCourseLink({ leadId, status }: { leadId: string; status: InboxCourseLinkStatus | null }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = () => start(async () => {
    setError(null);
    const result = status?.url ? { ok: true as const, url: status.url } : await getTrackedCourseLinkAction(leadId);
    if (!result.ok) { setError(result.error); return; }
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Copy this link: ${result.url}`);
    }
  });

  const state = !status ? "none" : status.firstOpenedAt ? "opened" : status.sentAt ? "sent" : "ready";
  return (
    <section className="ibx-course-link" aria-label="Course link">
      <div className="flex items-center gap-2">
        <Link2 size={14} aria-hidden className="text-brand-600" />
        <strong className="text-[12px]">Course link</strong>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          state === "opened" ? "bg-emerald-50 text-emerald-800" : state === "sent" ? "bg-amber-50 text-amber-800" : "bg-surface-soft text-copy-muted"}`}>
          {state === "opened" ? "Opened" : state === "sent" ? "Not opened yet" : state === "ready" ? "Not sent yet" : "No link yet"}
        </span>
      </div>
      {status ? (
        <dl className="mt-2 grid gap-1 text-[11px]">
          {status.courseName ? <div className="flex justify-between gap-2"><dt className="text-copy-muted">Course</dt><dd className="text-right">{status.courseName}</dd></div> : null}
          {status.sentAt ? <div className="flex justify-between gap-2"><dt className="text-copy-muted">Sent</dt><dd>{ago(status.sentAt)}</dd></div> : null}
          {status.firstOpenedAt ? <div className="flex justify-between gap-2"><dt className="text-copy-muted">Opened</dt><dd>{ago(status.lastOpenedAt ?? status.firstOpenedAt)}{status.openCount > 1 ? ` · ${status.openCount} times` : ""}</dd></div> : null}
          {status.firstOpenedAt ? (
            <div className="flex justify-between gap-2">
              <dt className="text-copy-muted" title="Approximate location of the network the link was opened from. Not nationality or residence: confirm before deciding the price.">Visit country</dt>
              <dd className="font-semibold">{status.visitCountryName ?? "Unknown"}{status.visitRegion && status.visitCountryName ? ` (${status.visitRegion})` : ""}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-1 text-[11px] text-copy-muted">The AI adds this link when it shares course details. Opening it shows you the visit country.</p>
      )}
      {status?.firstOpenedAt ? (
        <p className="mt-1.5 text-[10px] leading-4 text-copy-muted">Where the link was opened, not necessarily where they live. You decide the price.</p>
      ) : null}
      <button type="button" onClick={copy} disabled={pending}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-copy hover:bg-surface-soft disabled:opacity-60">
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
        {copied ? "Copied" : "Copy tracked link"}
      </button>
      {error ? <p className="mt-1 text-[11px] text-rose-700">{error}</p> : null}
    </section>
  );
}
