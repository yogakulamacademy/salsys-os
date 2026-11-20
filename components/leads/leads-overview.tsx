import Link from "next/link";
import { ArrowRight, BadgeCheck, ChevronRight } from "lucide-react";

import type { LeadsWorkspaceSummary } from "@/lib/leads-data";
import { biggestGap, fmt, STRIP_STAGES, type StageCounts } from "@/lib/leads-story";
import { waitedFor, type HomeStory } from "@/lib/home-story";

type LeadsOverviewProps = {
  summary: LeadsWorkspaceSummary;
  /** Plain-language story (waiting, going cold, says they paid); null when unavailable. */
  story?: HomeStory | null;
  /** Leads per stage; null hides the stage strip. */
  stages?: StageCounts | null;
  /** The stage the list is filtered to, to highlight it. */
  activeStage?: string;
};

type ActionCard = { count: number; title: string; detail: string; cta: string; href: string; tone: "money" | "attention" | "brand" | "neutral" };

const TONE: Record<ActionCard["tone"], string> = {
  money: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  attention: "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300",
  neutral: "bg-surface-muted text-copy-strong",
};

/**
 * Leads overview (owner-approved mockup, 20 Nov 2026): four "do this now"
 * cards and where the open leads are. Uses the server's authoritative counts;
 * a card or the strip is left out when its number isn't available.
 */
export function LeadsOverview({ summary, story = null, stages = null, activeStage = "" }: LeadsOverviewProps) {
  const cards: ActionCard[] = [];
  if (story) {
    cards.push({
      count: story.saysPaid.length,
      title: "Say they've paid",
      detail: story.saysPaid.length ? story.saysPaid.slice(0, 3).map((l) => l.name).join(", ") : "Nobody right now",
      cta: "Check", href: "#says-paid", tone: "money",
    });
    cards.push({
      count: story.waitingThisWeek,
      title: "Waiting for a reply",
      detail: `${fmt(story.waitingNow)} wrote in the last 3 days`,
      cta: "Reply", href: "/conversations?filter=waiting", tone: "attention",
    });
    cards.push({
      count: story.goingColdCount,
      title: "Interested, going cold",
      detail: "Asked fees or dates, no reply 2+ days",
      cta: "Follow up", href: "/home#home-going-cold", tone: "brand",
    });
  }
  cards.push({
    count: summary.followupOverdue,
    title: "Overdue follow-ups",
    detail: "Past their due date",
    cta: "Open", href: "/leads?view=followup_overdue", tone: "neutral",
  });

  const open = stages ? STRIP_STAGES.reduce((s, st) => s + (stages[st.key] ?? 0), 0) : 0;
  const max = stages ? Math.max(1, ...STRIP_STAGES.map((st) => stages[st.key] ?? 0)) : 1;
  const gap = biggestGap(stages);
  const aside = stages ? (stages.not_now ?? 0) + (stages.lost ?? 0) : 0;

  return (
    <div className="space-y-3" data-testid="leads-overview">
      <section aria-label="Do this now" className={`grid gap-3 sm:grid-cols-2 ${cards.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 transition hover:border-brand-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            <span className={`grid h-12 min-w-[56px] shrink-0 place-items-center rounded-xl px-2 text-[22px] font-bold tabular-nums ${TONE[card.tone]}`}>
              {fmt(card.count)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-copy-strong">{card.title}</span>
              <span className="block truncate text-[12px] text-copy-muted">{card.detail}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand-700 dark:text-brand-300">
              {card.cta} <ArrowRight size={14} className="transition group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        ))}
      </section>

      {stages ? (
        <section aria-label="Where your open leads are" className="rounded-2xl border border-line bg-surface px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Where your {fmt(open)} open leads are</h2>
            <span className="text-[12px] text-copy-subtle">
              Click a stage to filter the list{aside ? ` · ${fmt(stages.not_now ?? 0)} Not now and ${fmt(stages.lost ?? 0)} Lost are kept aside` : ""}
            </span>
          </div>
          <div className="mt-3 flex items-stretch gap-1 overflow-x-auto pb-1">
            {STRIP_STAGES.map((st, i) => {
              const count = stages[st.key] ?? 0;
              const active = activeStage === st.key;
              return (
                <div key={st.key} className="flex min-w-[130px] flex-1 items-center gap-1">
                  <Link
                    href={active ? "/leads" : `/leads?stage=${st.key}`}
                    aria-current={active ? "true" : undefined}
                    className={`min-w-0 flex-1 rounded-xl border px-3 py-2.5 transition ${active ? "border-brand-300 bg-brand-50/70 dark:bg-brand-950/30" : "border-line hover:border-brand-200 hover:bg-surface-soft"}`}
                  >
                    <span className="block truncate text-[12.5px] text-copy-muted">{st.label}</span>
                    <span className="mt-0.5 block text-[22px] font-bold leading-tight tabular-nums text-copy-strong">{fmt(count)}</span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className={`block h-full rounded-full ${st.key === "payment_pending" ? "bg-amber-500" : st.key === "enrolled" ? "bg-emerald-600" : "bg-brand-600"}`}
                        style={{ width: `${count ? Math.max(3, (count / max) * 100) : 0}%` }}
                      />
                    </span>
                  </Link>
                  {i < STRIP_STAGES.length - 1 ? <ChevronRight size={14} className="shrink-0 text-copy-subtle" aria-hidden /> : null}
                </div>
              );
            })}
          </div>
          {gap ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50/60 px-3.5 py-2.5 text-[13px] text-copy dark:bg-brand-950/20">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-700" aria-hidden />
              <span><strong>The big gap is {gap.from} → {gap.to}.</strong> {gap.advice}</span>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** Who says they've paid: the "Say they paid" tab lands here (#says-paid). */
export function LeadsSaysPaid({ story }: { story: HomeStory | null }) {
  if (!story?.saysPaid.length) return null;
  return (
    <section id="says-paid" aria-label="Say they've paid" className="flex scroll-mt-24 flex-col gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">
        <BadgeCheck size={15} aria-hidden /> They say they&apos;ve paid. Find the payment, then use Mark enrolled in the Inbox.
      </div>
      <ul className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        {story.saysPaid.slice(0, 9).map((lead) => (
          <li key={lead.id}>
            <Link href={`/conversations?lead=${lead.id}`} className="flex min-w-0 items-center gap-2.5 rounded-lg bg-surface px-3 py-2.5 text-[12px] transition hover:text-brand-700">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-copy-strong">{lead.name}{lead.course ? <span className="font-normal text-copy-muted"> · {lead.course}</span> : null}</span>
                {lead.quote ? <span className="block truncate text-copy-muted">&ldquo;{lead.quote}&rdquo; · {waitedFor(lead.lastInboundAt, new Date())} ago</span> : null}
              </span>
              <ArrowRight size={13} className="shrink-0 text-brand-700" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
