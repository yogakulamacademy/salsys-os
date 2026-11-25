import Link from "next/link";

import {
  coolingCell, HEAT_BUCKETS, HEAT_STAGES, heatGrid, inrText, pipelineSuggestions,
  type PipelineIntelligence, type PipelineSuggestion,
} from "@/lib/pipeline-intelligence";

// Smart Pipeline briefing (owner-approved mockup "Pipeline v2", 25 Nov 2026):
// ranked suggestions, numbers, who is going cold (stage × days since the last
// message) and open value by course. Sits in the Overview tab; the other
// tabs (Work queue, Pipeline, Payments, Capacity, Performance) are unchanged.

const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs";
const TONE: Record<PipelineSuggestion["evidence"][number]["tone"], string> = {
  good: "bg-emerald-600", bad: "bg-red-600", warn: "bg-orange-600", neutral: "bg-line", brand: "bg-brand-600",
};

function Suggestion({ s, rank }: { s: PipelineSuggestion; rank: number }) {
  const max = Math.max(...s.evidence.map((e) => e.value), 1);
  return (
    <article className={`${card} ${rank === 1 ? "border-brand-200 shadow-[0_8px_24px_rgba(87,67,197,0.10)]" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`grid size-6 place-items-center rounded-lg text-[12.5px] font-extrabold ${rank === 1 ? "bg-copy-strong text-surface" : "bg-brand-50 text-brand-700"}`}>{rank}</span>
        <span className="text-[12px] font-extrabold tracking-wide text-brand-700 dark:text-brand-300">{s.impact}</span>
      </div>
      <h3 className="text-[16px] font-extrabold leading-snug text-copy-strong">{s.title}</h3>
      <div className="space-y-1.5">
        {s.evidence.map((e) => (
          <div key={e.label} className="grid grid-cols-[150px_minmax(0,1fr)_40px] items-center gap-2.5 text-[12.5px]">
            <span className="truncate text-copy-muted">{e.label}</span>
            <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className={`block h-full rounded ${TONE[e.tone]}`} style={{ width: `${(e.value / max) * 100}%` }} /></span>
            <strong className="text-right tabular-nums text-copy-strong">{e.text}</strong>
          </div>
        ))}
      </div>
      <p className="text-[13px] leading-5 text-copy">{s.body}</p>
      <div className="mt-auto"><Link href={s.action.href} className={rank === 1 ? "btn-primary" : "btn-secondary"}>{s.action.label}</Link></div>
      <p className="text-[11.5px] text-copy-subtle">{s.basis}</p>
    </article>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-xs">
      <span className="text-[12.5px] font-semibold text-copy-muted">{label}</span>
      <span className="text-[28px] font-extrabold tracking-tight text-copy-strong tabular-nums">{value}</span>
      <span className="truncate text-[12px] text-copy-muted">{sub}</span>
    </div>
  );
}

export function SmartPipelineBriefing({ data }: { data: PipelineIntelligence }) {
  const ideas = pipelineSuggestions(data);
  const grid = heatGrid(data);
  const max = Math.max(1, ...grid.flat().map((c) => c.n));
  const cool = coolingCell(grid);
  const coolStage = cool ? HEAT_STAGES.find((s) => s.key === cool.stage)?.label : null;
  const coolBucket = cool ? HEAT_BUCKETS.find((b) => b.key === cool.bucket)?.label : null;
  const stageTotal = cool ? data.stages[cool.stage] ?? 0 : 0;
  const courses = data.courses.filter((c) => c.inr > 0).slice(0, 6);
  const courseMax = Math.max(1, ...courses.map((c) => c.inr));

  return (
    <div className="space-y-3.5">
      <form action="/leads" method="get" className="flex flex-wrap items-center gap-3 rounded-2xl border-[1.5px] border-brand-200 bg-surface px-3.5 py-2.5">
        <span className="grid size-[30px] place-items-center rounded-[9px] bg-brand-600 font-extrabold text-white" aria-hidden>✦</span>
        <input name="q" placeholder="Find someone in the pipeline… a name, a phone number or something they wrote" aria-label="Find leads" className="min-w-[240px] flex-1 bg-transparent text-[14px] text-copy-strong outline-none placeholder:text-copy-subtle" />
        {[["High intent", "/leads?stage=high_intent"], ["Payment pending", "/leads?stage=payment_pending"], ["Waiting on us", "/conversations?filter=waiting"]].map(([t, h]) => (
          <Link key={t} href={h} className="rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-bold text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">{t}</Link>
        ))}
      </form>

      {ideas.length ? (
        <div className={`grid gap-3.5 ${ideas.length === 3 ? "xl:grid-cols-[1.15fr_1fr_1fr]" : ideas.length === 2 ? "xl:grid-cols-2" : ""}`}>
          {ideas.map((s, i) => <Suggestion key={s.key} s={s} rank={i + 1} />)}
        </div>
      ) : null}

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Open pipeline" value={`≈ ${inrText(data.open.inr)}`} sub={`${data.open.n} people · ${data.open.priced} with an Indian price`} />
        <Kpi label="High intent" value={String(data.stages.high_intent ?? 0)} sub={`${data.highIntentWaiting.n} waiting on our reply`} />
        <Kpi label="Payment pending" value={String(data.payment.n)} sub={`${data.payment.monthPlus} quiet for 30+ days`} />
        <Kpi label="Moved to payment · 30 days" value={String(data.moves30.toPayment)} sub={`${data.moves30.highIntentToPayment} from High intent · ${data.moves30.won} won`} />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_560px]">
        <section className={card}>
          <div>
            <h3 className="text-[16px] font-extrabold text-copy-strong">Who is going cold · days since the last message</h3>
            <p className="text-[12.5px] text-copy-muted">Darker = more people. Hover a cell for details; click to open that stage.</p>
          </div>
          <div className="grid grid-cols-[170px_repeat(5,minmax(0,1fr))] gap-1.5">
            <span />
            {HEAT_BUCKETS.map((b) => <span key={b.key} className="text-center text-[11.5px] font-bold text-copy-muted">{b.label}</span>)}
            {grid.map((row, ri) => (
              <div key={HEAT_STAGES[ri].key} className="contents">
                <span className="flex items-center text-[13px] font-bold text-copy-strong">{HEAT_STAGES[ri].label} · {data.stages[HEAT_STAGES[ri].key] ?? 0}</span>
                {row.map((c) => {
                  const a = c.n ? 0.16 + (c.n / max) * 0.84 : 0;
                  const isCool = cool && c.stage === cool.stage && c.bucket === cool.bucket;
                  return (
                    <Link key={c.bucket} href={`/leads?stage=${c.stage}`}
                      title={`${HEAT_STAGES[ri].label} · last message ${HEAT_BUCKETS.find((b) => b.key === c.bucket)?.label}\n${c.n} people · ${c.waiting} waiting on our reply${c.topCourse ? `\nBiggest course: ${c.topCourse}` : ""}${c.inr ? `\nValue at Indian prices: ${inrText(c.inr)}` : ""}`}
                      className={`grid h-[58px] place-items-center rounded-[10px] text-[19px] font-extrabold tabular-nums ${isCool ? "outline outline-[3px] outline-offset-2 outline-copy-strong" : ""}`}
                      style={{ background: c.n ? `rgba(194,65,12,${a.toFixed(2)})` : "var(--color-surface-muted, #F7F6FB)", color: c.n ? (a > 0.5 ? "#fff" : "#6B2A05") : "#B8B4C8" }}>
                      {c.n}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
          {cool && cool.n && coolStage ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50/70 px-3.5 py-2.5 dark:border-orange-900/50 dark:bg-orange-950/20">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-orange-700 dark:text-orange-300">What this shows</div>
              <p className="mt-0.5 text-[13.5px] leading-5 text-copy-strong">
                <strong>{cool.n} of {stageTotal} at {coolStage}</strong> last spoke {coolBucket} ago{cool.topCourse ? `, most about ${cool.topCourse}` : ""}. They’re interested but cooling.
                {cool.waiting ? <> <strong>{cool.waiting}</strong> of them are waiting on our reply; start there.</> : " A personal message with the next start date is the natural next step."}
              </p>
            </div>
          ) : null}
        </section>

        <section className={card}>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Open value by course</h3>
          <div className="space-y-2">
            {courses.map((c) => (
              <Link key={c.course} href={`/leads?course=${encodeURIComponent(c.course)}`} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_76px] items-center gap-3 text-[13px] hover:underline">
                <span className="truncate text-copy">{c.course}</span>
                <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded bg-brand-600" style={{ width: `${(c.inr / courseMax) * 100}%` }} /></span>
                <strong className="text-right tabular-nums text-copy-strong">{inrText(c.inr).replace(" lakh", " L")}</strong>
              </Link>
            ))}
          </div>
          <p className="text-[12px] text-copy-muted">At Indian prices, for people at Qualified, High intent or Payment pending. International leads are priced in their own currency and not added in.</p>
        </section>
      </div>
    </div>
  );
}
