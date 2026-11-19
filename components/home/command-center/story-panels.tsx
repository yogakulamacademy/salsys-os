import Link from "next/link";
import { AlertTriangle, Clock3, Lightbulb, MessageCircleReply, Snowflake, Sparkles } from "lucide-react";

import { Panel } from "@/components/home/command-center/panel";
import { waitedFor, type HomeStory } from "@/lib/home-story";

const STAGE_LABEL: Record<string, string> = {
  qualified: "Qualified", high_intent: "High intent", payment_pending: "Payment pending",
};

/** One sentence about today, with the actions that answer it. */
export function HomeTodayStrip({ story, aiMoves24h }: { story: HomeStory; aiMoves24h: number | null }) {
  const extras = [
    story.leadsThisWeek != null ? `${story.leadsThisWeek.toLocaleString("en-IN")} new leads this week` : null,
    aiMoves24h ? `the AI moved ${aiMoves24h.toLocaleString("en-IN")} leads to the right stage` : null,
    story.aiRepliesToday ? `sent ${story.aiRepliesToday.toLocaleString("en-IN")} ${story.aiRepliesToday === 1 ? "reply" : "replies"}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <section aria-label="Today" className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-700">Today</span>
        <p className="max-w-[920px] text-xl font-bold leading-snug tracking-[-0.01em] text-copy-strong sm:text-[22px]">{story.headline}</p>
        {extras ? <p className="text-[13px] text-copy-muted">{extras}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2.5">
        {story.waitingNow ? (
          <Link href="/conversations" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
            <MessageCircleReply size={16} aria-hidden="true" /> Reply now
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{story.waitingNow.toLocaleString("en-IN")}</span>
          </Link>
        ) : null}
        {story.goingColdCount ? (
          <a href="#home-going-cold" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-50 px-4 text-sm font-semibold text-brand-800 hover:bg-brand-100">
            Follow up interested leads
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs">{story.goingColdCount.toLocaleString("en-IN")}</span>
          </a>
        ) : null}
        {story.lostSuggestions ? (
          <Link href="/follow-ups" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-copy-strong hover:border-line-strong">
            Confirm &ldquo;Lost?&rdquo; suggestions
            <span className="rounded-full bg-surface-soft px-2 py-0.5 text-xs">{story.lostSuggestions.toLocaleString("en-IN")}</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** Shown only when new leads dropped sharply week on week. */
export function HomeLeadsAlert({ story, adsProblem }: { story: HomeStory; adsProblem: string | null }) {
  if (story.leadsChange == null || story.leadsChange > -40) return null;
  return (
    <section aria-label="Needs attention" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex items-center gap-3">
        <AlertTriangle size={19} className="shrink-0 text-amber-800 dark:text-amber-300" aria-hidden="true" />
        <p className="text-sm text-amber-900 dark:text-amber-100">
          <strong>New leads are down {Math.abs(story.leadsChange)}% this week</strong> ({story.leadsThisWeek?.toLocaleString("en-IN")} vs {story.leadsLastWeek?.toLocaleString("en-IN")}).{" "}
          {adsProblem ? `Ad results aren't syncing (${adsProblem}), so the cause can't be seen here yet.` : "Check your ads and posting."}
        </p>
      </div>
      <Link href="/marketing" className="text-sm font-semibold text-amber-900 hover:underline dark:text-amber-100">{adsProblem ? "Reconnect ads →" : "Marketing →"}</Link>
    </section>
  );
}

export function FunnelInsight({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-surface-soft px-3 py-2.5 text-[13px] leading-5 text-copy-strong">
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export function GoingColdPanel({ story, now }: { story: HomeStory; now: Date }) {
  return (
    <Panel id="home-going-cold" icon={<Snowflake size={19} />} title="Interested, but going cold" className="flex-[1_1_380px]">
      <p className="text-[13px] text-copy-muted">
        {story.goingColdCount
          ? `${story.goingColdCount.toLocaleString("en-IN")} leads asked about fees, dates or paying, and nobody has replied for 2+ days.`
          : "No interested lead is waiting more than 2 days. Well done."}
      </p>
      {story.goingCold.length ? (
        <ul className="flex flex-col gap-2">
          {story.goingCold.map((lead) => (
            <li key={lead.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-copy-strong">
                  {lead.name} <span className="font-medium text-copy-muted">· {lead.course ?? STAGE_LABEL[lead.stage] ?? "Lead"}</span>
                </div>
                {lead.quote ? <div className="truncate text-xs text-copy-muted">&ldquo;{lead.quote}&rdquo;</div> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">{waitedFor(lead.lastInboundAt, now)}</span>
                <Link href={`/conversations?lead=${lead.id}`} className="inline-flex h-9 items-center rounded-lg bg-brand-50 px-3 text-xs font-semibold text-brand-800 hover:bg-brand-100">Reply</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

export function WinBackPanel({ story }: { story: HomeStory }) {
  const w = story.winBack;
  return (
    <Panel id="home-win-back" icon={<Sparkles size={19} />} title={`Win back ${w.total.toLocaleString("en-IN")} unanswered leads`} action={{ href: "/conversations", label: "Inbox" }} className="flex-[1_1_340px]">
      <p className="text-[13px] leading-5 text-copy-muted">
        They messaged over a week ago and have no reply in the CRM. Some were answered in the Instagram app before syncing started.
      </p>
      <div className="grid grid-cols-3 gap-2.5">
        <div className="flex flex-col rounded-xl bg-surface-soft p-3">
          <span className="text-xl font-extrabold tabular-nums text-copy-strong">{w.withCourse.toLocaleString("en-IN")}</span>
          <span className="text-[11px] text-copy-muted">course known</span>
        </div>
        <div className="flex flex-col rounded-xl bg-surface-soft p-3">
          <span className="text-xl font-extrabold tabular-nums text-copy-strong">{w.withoutCourse.toLocaleString("en-IN")}</span>
          <span className="text-[11px] text-copy-muted">course unknown</span>
        </div>
        <div className="flex flex-col rounded-xl bg-surface-soft p-3">
          <span className="text-xl font-extrabold tabular-nums text-copy-strong">24h</span>
          <span className="text-[11px] text-copy-muted">Instagram reply window</span>
        </div>
      </div>
      <p className="text-xs leading-5 text-copy-muted">
        Instagram only allows a reply within 24 hours of the lead&apos;s last message, so most of these need WhatsApp, email or a new post to reach them.
      </p>
    </Panel>
  );
}

export function MessageHoursPanel({ story }: { story: HomeStory }) {
  const peak = Math.max(1, ...story.hours);
  const total = story.hours.reduce((s, c) => s + c, 0);
  return (
    <Panel id="home-message-hours" icon={<Clock3 size={19} />} title="When leads message you" className="flex-[1_1_340px]">
      <p className="text-[13px] text-copy-muted">
        {story.busiest ? `Busiest ${story.busiest} (India time, last 30 days). Quick replies then matter most.` : "Not enough messages yet to see a pattern."}
      </p>
      <div
        role="img"
        aria-label={`Messages by hour of day, last 30 days${story.busiest ? `; busiest ${story.busiest}` : ""}.`}
        className="grid h-28 grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-[3px]"
      >
        {story.hours.map((count, hour) => (
          <span
            key={hour}
            title={`${hour}:00 · ${count} messages`}
            className={`block rounded-t ${count >= peak * 0.75 ? "bg-brand-700" : "bg-brand-100"}`}
            style={{ height: `${Math.max(3, Math.round((count / peak) * 100))}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-copy-muted">
        <span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>11 pm</span>
      </div>
      <span className="sr-only">{total} messages in total.</span>
    </Panel>
  );
}
