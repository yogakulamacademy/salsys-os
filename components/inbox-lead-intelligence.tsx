import type { Health, IntentLevel, LeadIntelligence, TimelineTone } from "@/lib/lead-intelligence";

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

/** Where the lead stands and what has happened. Read-only; built on the server. */
export function InboxLeadIntelligence({ intel }: { intel: LeadIntelligence }) {
  const { journey, stats } = intel;
  return (
    <section aria-label="Lead intelligence" className="ibx-lead-intel border-b border-line px-3.5 py-4">
      <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-copy-muted">Lead intelligence</h3>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${INTENT_STYLE[intel.intent]}`}>{intel.intentLabel}</span>
        </div>

        <p className="mt-2 text-[13px] font-semibold leading-snug text-copy-strong">{intel.summary}</p>

        <div className="mt-3">
          <div className="flex gap-[3px]" role="img" aria-label={`Journey: ${journey.stepText}`}>
            {journey.stages.map((s) => (
              <span
                key={s.key}
                title={s.label}
                className={`h-2 flex-1 rounded ${
                  s.state === "current"
                    ? "bg-brand-600 ring-2 ring-brand-100"
                    : s.state === "done"
                      ? "bg-brand/50"
                      : journey.offTrack
                        ? "bg-line opacity-60"
                        : "bg-line"
                }`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-copy-subtle">
            <span>New</span>
            <span className={`font-bold ${journey.offTrack ? "text-rose-700" : "text-brand-700"}`}>{journey.stepText}</span>
            <span>Enrolled</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Stat value={stats.waitText} label={stats.waitLabel} className={`text-[15px] ${HEALTH_STYLE[stats.health]}`} />
          <Stat value={stats.healthLabel} label="Response health" className={`text-[12px] ${HEALTH_STYLE[stats.health]}`} />
          <Stat value={`${stats.inbound} / ${stats.outbound}`} label="Msgs in / out" className="text-[15px] text-copy-strong" />
        </div>

        {intel.signals.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="What the lead asked about">
            {intel.signals.map((s) => (
              <span key={s} className="rounded-full border border-brand-100 bg-surface px-2 py-0.5 text-[11px] font-semibold text-brand-700">{s}</span>
            ))}
          </div>
        ) : null}

        {intel.timeline.length ? (
          <div className="mt-3">
            <h4 className="mb-1.5 text-[11px] font-bold text-copy-muted">What&apos;s happened</h4>
            <ol className="space-y-2">
              {intel.timeline.map((t, i) => (
                <li key={`${i}-${t.text}`} className="flex items-start gap-2">
                  <span aria-hidden="true" className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${DOT[t.tone]}`} />
                  <div className="min-w-0">
                    <p className="break-words text-[12px] font-semibold text-copy-strong">{t.text}</p>
                    {t.when ? <p className="text-[11px] text-copy-subtle">{t.when}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ value, label, className }: { value: string; label: string; className: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface p-2">
      <span className={`font-extrabold leading-tight ${className}`}>{value}</span>
      <span className="text-[10px] text-copy-muted">{label}</span>
    </div>
  );
}
