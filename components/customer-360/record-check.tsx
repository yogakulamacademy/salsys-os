import { AlertTriangle } from "lucide-react";

import { setMainCourseAction } from "@/app/customer-360/actions";
import { SubmitButton } from "@/components/submit-button";
import { ToastForm } from "@/components/toast-form";
import type { RecordCheck, Signals } from "@/lib/person-checks";

// Customer 360 "The record vs the conversation" and "Signals" (owner-approved
// mockup "Smart Customer 360", 25 Nov 2026).

const card = "rounded-2xl border border-line bg-surface p-5 shadow-xs";
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export function RecordVsConversation({ check, leadId, personId, messages }: { check: RecordCheck; leadId: string; personId: string; messages: number }) {
  const course = check.suggestCourse;
  return (
    <section className={card} aria-label="The record vs the conversation">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">The record vs the conversation</h2>
        <span className={`text-[12px] font-bold ${check.issues ? "text-orange-700 dark:text-orange-300" : "text-emerald-700 dark:text-emerald-300"}`}>
          {check.issues ? `${check.issues} to check` : "Matches"}
        </span>
      </div>
      <dl className="mt-2 divide-y divide-line">
        {check.flags.map((f) => (
          <div key={f.label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2 text-[13px]">
            <dt className="text-copy-muted">{f.label}</dt>
            <dd className={`flex min-w-0 items-start gap-1.5 font-semibold ${f.warn ? "text-orange-700 dark:text-orange-300" : "text-copy-strong"}`}>
              <span className="min-w-0 break-words">{f.value}</span>
              {f.warn ? <AlertTriangle size={13} className="mt-[3px] shrink-0" aria-label="Check this" /> : null}
            </dd>
          </div>
        ))}
      </dl>
      {course ? (
        <ToastForm action={setMainCourseAction.bind(null, leadId, course.id, personId)} resetOnSuccess={false} className="mt-3">
          <SubmitButton pendingLabel="Saving…" className="btn-primary">Make “{course.name}” the course</SubmitButton>
        </ToastForm>
      ) : null}
      <p className="mt-2 text-[11.5px] text-copy-subtle">
        From {messages.toLocaleString("en-IN")} messages and the CRM record.
        {check.unsavedNumber ? " The number they typed is not saved yet; check it in the chat before adding it." : ""}
      </p>
    </section>
  );
}

export function SignalsCard({ s }: { s: Signals }) {
  const rows = [
    { label: "Asked the fee", value: s.askedFee, text: `${s.askedFee}×`, tone: "bg-orange-700" },
    { label: "Messages from them", value: s.fromThem, text: String(s.fromThem), tone: "bg-blue-600" },
    { label: "Messages from us", value: s.fromUs, text: String(s.fromUs), tone: "bg-emerald-600" },
    { label: "Days since last message", value: s.daysSinceLast ?? 0, text: s.daysSinceLast == null ? "—" : String(s.daysSinceLast), tone: (s.daysSinceLast ?? 0) > 7 ? "bg-red-700" : "bg-slate-400" },
    { label: "Longest wait for our reply", value: s.longestWaitDays, text: `${s.longestWaitDays} d`, tone: s.longestWaitDays > 1 ? "bg-red-700" : "bg-slate-400" },
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <section className={card} aria-label="Signals">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Signals</h2>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[170px_minmax(0,1fr)_44px] items-center gap-2.5 text-[12.5px]">
            <span className="truncate text-copy-muted">{r.label}</span>
            <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className={`block h-full rounded ${r.tone}`} style={{ width: `${(r.value / max) * 100}%` }} /></span>
            <strong className="text-right tabular-nums text-copy-strong">{r.text}</strong>
          </div>
        ))}
      </div>
      {s.longestWaitDays > 1 && s.longestWaitFrom ? (
        <p className="mt-3 rounded-xl bg-red-50/70 px-3 py-2 text-[12.5px] text-red-800 dark:bg-red-950/25 dark:text-red-300">
          {s.longestWaitOpen
            ? `They have been waiting ${Math.floor(s.longestWaitDays)} days for our reply since ${shortDate(s.longestWaitFrom)}.`
            : `They waited ${s.longestWaitDays} days for our reply after writing on ${shortDate(s.longestWaitFrom)}.`}
        </p>
      ) : null}
    </section>
  );
}
