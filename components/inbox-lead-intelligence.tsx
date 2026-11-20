import type { Health, IntentLevel, LeadIntelligence, TimelineTone } from "@/lib/lead-intelligence";
import type { LeadScore } from "@/lib/lead-score";
import type { LeadSourceContext } from "@/lib/lead-source-context";

const BAND_STYLE: Record<LeadScore["band"], { ring: string; text: string }> = {
  hot: { ring: "#12703f", text: "text-emerald-700" },
  warm: { ring: "#b45309", text: "text-amber-700" },
  cool: { ring: "#5743c5", text: "text-brand-700" },
  cold: { ring: "#8a87a0", text: "text-copy-muted" },
};

const URGENCY_LABEL: Record<LeadScore["nextStep"]["urgency"], string> = {
  now: "Do now", today: "Today", soon: "This week", later: "Later",
};

const INTENT_STYLE: Record<IntentLevel, string> = {
  high: "bg-emerald-50 text-emerald-700",
  warm: "bg-amber-50 text-amber-800",
  curious: "bg-brand-50 text-brand-700",
  hello: "bg-surface-soft text-copy-muted",
};

const HEALTH_STYLE: Record<Health, string> = {
  on_time: "text-emerald-700",
  reply_soon: "text-amber-700",
  going_cold: "text-rose-700",
  waiting_on_them: "text-copy-strong",
  quiet: "text-copy-muted",
};

const DOT: Record<TimelineTone, string> = {
  lead: "bg-brand-600",
  team: "bg-brand/40",
  good: "bg-emerald-600",
  warn: "bg-rose-600",
  muted: "bg-copy-subtle",
};

const RING = 2 * Math.PI * 31;

/** Where the lead stands and what to do next. Read-only; built on the server.
 *  Owner-approved design (20 Nov 2026): score ring, next step, journey, three facts. */
export function InboxLeadIntelligence({ intel, score, source, withTimeline = true }: { intel: LeadIntelligence; score?: LeadScore | null; source?: LeadSourceContext | null; withTimeline?: boolean }) {
  const { journey, stats } = intel;
  return (
    <>
    <section aria-label="Lead intelligence" className="ibx-lead-intel ibx-v5-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="ibx-v5-card-title is-accent">Lead intelligence</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${INTENT_STYLE[intel.intent]}`}>{intel.intentLabel}</span>
      </div>

      {score ? (
        <div className="ibx-lead-score ibx-v5-score">
          <svg role="img" aria-label={`Lead score ${score.score} out of 100`} width="76" height="76" viewBox="0 0 76 76">
            <circle cx="38" cy="38" r="31" fill="none" stroke="var(--ibx5-track, #EEECF4)" strokeWidth="8" />
            <circle cx="38" cy="38" r="31" fill="none" stroke={BAND_STYLE[score.band].ring} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(Math.max(0, Math.min(100, score.score)) / 100) * RING} ${RING}`} transform="rotate(-90 38 38)" />
            <text x="38" y="44" textAnchor="middle" fontSize="20" fontWeight="800" fill="currentColor">{score.score}</text>
          </svg>
          <div className="min-w-0">
            <p className={`text-[15px] font-bold leading-snug ${BAND_STYLE[score.band].text}`} title={score.confidenceNote}>
              {score.bandLabel} · {score.confidence}% likely to pay in 30 days
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-copy">{intel.summary}</p>
            <details className="mt-1 text-[12px]">
              <summary className="cursor-pointer font-semibold text-brand-700">Why this score</summary>
              <ul className="mt-1 space-y-0.5">
                <li className="flex justify-between gap-2"><span className="text-copy-muted">Starting point</span><span className="font-semibold text-copy-muted">30</span></li>
                {score.factors.slice(0, 6).map((f) => (
                  <li key={f.key} className="flex justify-between gap-2">
                    <span className="text-copy">{f.label}</span>
                    <span className={`font-semibold ${f.points > 0 ? "text-emerald-700" : "text-rose-700"}`}>{f.points > 0 ? `+${f.points}` : f.points}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-copy-subtle">{score.confidenceLabel}. {score.confidenceNote}</p>
            </details>
          </div>
        </div>
      ) : (
        <p className="text-[14px] font-semibold leading-snug text-copy-strong">{intel.summary}</p>
      )}

      {score ? (
        <div className="ibx-v5-next-step">
          <p className="text-[12px] font-bold text-brand-700">Next step · {URGENCY_LABEL[score.nextStep.urgency]}</p>
          <p className="text-[14px] font-semibold text-copy-strong">{score.nextStep.title}</p>
          <p className="text-[12px] text-copy-muted">{score.nextStep.detail}</p>
        </div>
      ) : null}

      {source?.ad || source?.latestShare ? (
        <div className="ibx-lead-source space-y-1 rounded-xl bg-surface-soft px-3 py-2 text-[12px]">
          {source.ad ? (
            <p title={source.ad.adId ? `Ad ID ${source.ad.adId}` : undefined}>
              <span className="font-bold text-copy-muted">From ad: </span>
              <span className="text-copy-strong">{source.ad.title}</span>
              {source.ad.course ? <span className="text-brand-700"> · {source.ad.course.name}</span> : null}
            </p>
          ) : null}
          {source.latestShare ? (
            <p>
              <span className="font-bold text-copy-muted">{source.latestShare.kind === "story_reply" ? "Replied to a story: " : "Shared: "}</span>
              {source.latestShare.readable
                ? <span className="text-copy-strong">{(source.latestShare.caption ?? "").slice(0, 90)}{(source.latestShare.caption ?? "").length > 90 ? "…" : ""}</span>
                : <span className="text-amber-800">a post we can&apos;t see; open it in Instagram</span>}
              {source.latestShare.course ? <span className="text-brand-700"> · {source.latestShare.course.name}</span> : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="flex gap-[3px]" role="img" aria-label={`Journey: ${journey.stepText}`}>
          {journey.stages.map((s) => (
            <span
              key={s.key}
              title={s.label}
              className={`h-1.5 flex-1 rounded-full ${
                s.state === "current" || s.state === "done"
                  ? journey.offTrack ? "bg-rose-500" : "bg-brand-600"
                  : "bg-line"
              }`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[12px] text-copy-muted">
          <span>New</span>
          <span className={`font-bold ${journey.offTrack ? "text-rose-700" : "text-copy-strong"}`}>{journey.stepText}</span>
          <span>Enrolled</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat value={stats.waitText} label={stats.waitLabel} className={`text-[16px] ${HEALTH_STYLE[stats.health]}`} />
        <Stat value={stats.healthLabel} label="Response health" className={`text-[14px] ${HEALTH_STYLE[stats.health]}`} />
        <Stat value={`${stats.inbound} / ${stats.outbound}`} label="Messages in / out" className="text-[16px] text-copy-strong" />
      </div>

      {intel.signals.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="What the lead asked about">
          {intel.signals.map((s) => (
            <span key={s} className="rounded-full border border-brand-100 bg-surface px-2 py-0.5 text-[12px] font-semibold text-brand-700">{s}</span>
          ))}
        </div>
      ) : null}
    </section>
    {withTimeline ? <InboxLeadTimeline intel={intel} /> : null}
    </>
  );
}

/** "What's happened": newest first, time on the right. */
export function InboxLeadTimeline({ intel, profileHref }: { intel: LeadIntelligence; profileHref?: string }) {
  if (!intel.timeline.length && !profileHref) return null;
  return (
    <section aria-label="What has happened" className="ibx-v5-card ibx-v5-timeline">
      <h3 className="ibx-v5-card-title">What&apos;s happened</h3>
      {intel.timeline.length ? (
        <ol className="space-y-1.5">
          {intel.timeline.map((t, i) => (
            <li key={`${i}-${t.text}`} className="flex items-start justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-start gap-2">
                <span aria-hidden="true" className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${DOT[t.tone]}`} />
                <span className="break-words text-copy-strong">{t.text}</span>
              </span>
              {t.when ? <span className="shrink-0 text-copy-muted">{t.when}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {profileHref ? <a href={profileHref} className="text-[12px] font-semibold text-brand-700 hover:underline">Full profile and lead details</a> : null}
    </section>
  );
}

function Stat({ value, label, className }: { value: string; label: string; className: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-2.5 py-2">
      <span className={`font-extrabold leading-tight ${className}`}>{value}</span>
      <span className="text-[11px] text-copy-muted">{label}</span>
    </div>
  );
}
