import Link from "next/link";

import type { ConversationLeadSummary } from "@/components/conversations-sidebar";
import type { InboxPage } from "@/lib/conversations-page-data";
import { INBOX_TOPICS, INBOX_TOPIC_LABELS } from "@/lib/inbox-topics";
import { groupWaiting, summarizeWaiting, type WaitKind } from "@/lib/inbox-waiting";

// "Today in your inbox" (owner-approved combined design, 20 Nov 2026): what
// fills the right side when no conversation is open, instead of an empty
// "Select a conversation" panel. Built from the Waiting list itself.

type Props = {
  rows: ConversationLeadSummary[];
  pagination?: Omit<InboxPage, "rows">;
  hrefFor: (leadId: string) => string;
};

const KIND_CARDS: Array<{ kind: WaitKind; label: string; note: string }> = [
  { kind: "question", label: "Questions waiting", note: "Fees, dates, stay, certificates" },
  { kind: "message", label: "Other messages", note: "“Ok”, “I will inform you”, follow-ups" },
  { kind: "share", label: "Shares & story reactions", note: "Low effort: a short thank-you is enough" },
];

export function InboxOverview({ rows, pagination, hrefFor }: Props) {
  const onWaiting = !pagination || pagination.filter === "waiting";
  const now = Date.now();
  const waitingRows = onWaiting
    ? rows.map((row) => ({ ...row, kind: (row.lastKind ?? "message") as WaitKind }))
    : [];
  const summary = summarizeWaiting(waitingRows, now);
  const groups = groupWaiting(waitingRows);
  const firstOf = (kind: WaitKind) => groups.find((g) => g.kind === kind)?.rows[0] ?? null;
  const oldestQuestion = firstOf("question");
  const firstPaid = firstOf("paid");
  const waitingTotal = pagination?.counts.waiting ?? summary.total;
  const older = pagination?.counts.older ?? 0;

  const topicCounts = pagination?.topicCounts ?? null;
  const topics = topicCounts
    ? INBOX_TOPICS.map((key) => ({ key, label: INBOX_TOPIC_LABELS[key], value: topicCounts[key] ?? 0 }))
        .filter((t) => t.value > 0)
        .sort((a, b) => b.value - a.value)
    : [];
  const topMax = topics[0]?.value ?? 1;

  const details = [
    summary.oldestQuestionDays != null ? `Oldest question: ${summary.oldestQuestionDays === 0 ? "today" : `${summary.oldestQuestionDays} ${summary.oldestQuestionDays === 1 ? "day" : "days"}`}.` : null,
    summary.last24h ? `${summary.last24h.toLocaleString("en-IN")} arrived in the last 24 hours.` : null,
    summary.counts.paid ? `${summary.counts.paid.toLocaleString("en-IN")} ${summary.counts.paid === 1 ? "person says they've" : "people say they've"} already paid.` : null,
  ].filter(Boolean).join(" ");

  return (
    <section aria-label="Today in your inbox" className="inbox-overview flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-surface-soft p-5">
      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-6 shadow-card">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-700">Today in your inbox</span>
        <p className="max-w-[1100px] text-[22px] font-bold leading-snug tracking-[-0.01em] text-copy-strong">
          {onWaiting
            ? summary.headline
            : `${waitingTotal.toLocaleString("en-IN")} ${waitingTotal === 1 ? "person wrote this week and is" : "people wrote this week and are"} waiting for a reply.`}
        </p>
        {onWaiting && details ? <p className="text-[14px] text-copy-muted">{details}</p> : null}
        <div className="flex flex-wrap gap-2.5">
          {oldestQuestion ? (
            <Link href={hrefFor(oldestQuestion.id)} className="inline-flex h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
              Start with the oldest question
            </Link>
          ) : !onWaiting ? (
            <Link href="/conversations" className="inline-flex h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
              Open the Waiting list
            </Link>
          ) : null}
          {firstPaid ? (
            <Link href={hrefFor(firstPaid.id)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-200">
              Check the payment
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs dark:bg-white/10">{summary.counts.paid}</span>
            </Link>
          ) : null}
          <Link href="/leads#says-paid" className="inline-flex h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-copy-strong hover:border-line-strong">
            Everyone who says they paid
          </Link>
        </div>
      </div>

      {onWaiting ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {KIND_CARDS.map((card) => (
            <div key={card.kind} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
              <span className="text-[13px] font-semibold text-copy-muted">{card.label}</span>
              <span className="text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-copy-strong">{summary.counts[card.kind].toLocaleString("en-IN")}</span>
              <span className="text-[12.5px] text-copy-muted">{card.note}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1fr]">
        {topics.length ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            <div>
              <h2 className="text-base font-bold text-copy-strong">What people ask about</h2>
              <p className="text-[13px] text-copy-muted">Across the chats in this list. Tap a topic chip on the left to see those chats.</p>
            </div>
            <ul className="flex flex-col gap-2">
              {topics.map((t) => (
                <li key={t.key} className="grid grid-cols-[150px_1fr_48px] items-center gap-2.5 text-[13px]">
                  <span className="truncate text-copy-strong">{t.label}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                    <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.max(3, Math.round((t.value / topMax) * 100))}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums text-copy-strong">{t.value.toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-base font-bold text-copy-strong">Older than a week</h2>
          <p className="text-[28px] font-extrabold tracking-[-0.02em] text-copy-strong">{older.toLocaleString("en-IN")}</p>
          <p className="text-[14px] leading-relaxed text-copy-muted">
            People who wrote more than 7 days ago and never got a reply. They&rsquo;re kept out of the Waiting list so today&rsquo;s work stays short. On Instagram the CRM can only reply within 7 days of their last message; you can still answer by hand in the Instagram app.
          </p>
          <Link href="/conversations?filter=older" className="inline-flex h-10 items-center self-start rounded-xl bg-brand-50 px-4 text-[13px] font-semibold text-brand-800 hover:bg-brand-100">
            Open the older chats
          </Link>
        </div>
      </div>
    </section>
  );
}
