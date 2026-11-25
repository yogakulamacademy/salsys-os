import Link from "next/link";

import { monthName, rupees, type RevenueStory } from "@/lib/revenue-story";

// Smart Revenue briefing (owner-approved mockup "Revenue", 25 Nov 2026):
// confirmed money in, what is closest to landing, and what is missing.
// Website checkouts and warm people are never added to money collected.

const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs";
const n = (x: number) => x.toLocaleString("en-IN");
const COURSE_TONES = ["#5743C5", "#C2410C", "#0EA5A4", "#2563EB", "#A16207", "#7C3AED"];
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

function Bars({ rows, max }: { rows: Array<{ label: string; value: number; shown: string; tone: string }>; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[150px_minmax(0,1fr)_72px] items-center gap-2.5 text-[12.5px]">
          <span className="truncate text-copy-muted">{r.label}</span>
          <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded" style={{ width: `${top ? (r.value / top) * 100 : 0}%`, background: r.tone }} /></span>
          <strong className="text-right tabular-nums text-copy-strong">{r.shown}</strong>
        </div>
      ))}
    </div>
  );
}

function Rank({ rank, impact, title, children }: { rank: number; impact: string; title: string; children: React.ReactNode }) {
  const first = rank === 1;
  return (
    <article className={`${card} ${first ? "border-brand-200 shadow-[0_8px_24px_rgba(87,67,197,0.10)]" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`grid size-6 place-items-center rounded-lg text-[12.5px] font-extrabold ${first ? "bg-copy-strong text-surface" : "bg-brand-50 text-brand-700"}`}>{rank}</span>
        <span className="text-[12px] font-extrabold uppercase tracking-wide text-brand-700 dark:text-brand-300">{impact}</span>
      </div>
      <h3 className="text-[16px] font-extrabold leading-snug text-copy-strong">{title}</h3>
      {children}
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

function MonthlyChart({ s, tones }: { s: RevenueStory; tones: Map<string, string> }) {
  const W = 1000, H = 280, B = 28, T = 26, L = 56;
  const max = Math.max(...s.months.map((m) => m.total), 1) * 1.08;
  const step = (W - L - 10) / Math.max(1, s.months.length);
  const bw = Math.min(160, step * 0.55);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const grid = [0, max / 2, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Money collected per month, by course">
      {grid.map((g) => (
        <g key={g}>
          <line x1={L} x2={W - 10} y1={y(g)} y2={y(g)} stroke="currentColor" className="text-line" />
          <text x={L - 8} y={y(g) + 4} textAnchor="end" className="fill-copy-muted text-[11px]">₹{Math.round(g / 1000)}k</text>
        </g>
      ))}
      {s.months.map((m, i) => {
        const x = L + i * step + step / 2;
        let base = 0;
        return (
          <g key={m.month}>
            {m.parts.map((p) => {
              const top = y(base + p.amount), bottom = y(base);
              base += p.amount;
              return (
                <rect key={p.course} x={x - bw / 2} y={top} width={bw} height={Math.max(1, bottom - top)} rx={3} fill={tones.get(p.course) ?? "#94A3B8"}>
                  <title>{`${monthName(m.month)}: ${p.course} ${rupees(p.amount)}`}</title>
                </rect>
              );
            })}
            <text x={x} y={y(m.total) - 8} textAnchor="middle" className="fill-copy-strong text-[13px] font-extrabold">{m.total ? `₹${n(m.total)}` : "₹0"}</text>
            <text x={x} y={H - 8} textAnchor="middle" className="fill-copy-muted text-[12px]">{monthName(m.month, "short")} {m.month.slice(0, 4)}{m.month === s.currentMonth ? " (so far)" : ""}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function SmartRevenueBriefing({ s, since, usdInr }: { s: RevenueStory; since: string; usdInr: number }) {
  const tones = new Map(s.courses.map((c, i) => [c.course, COURSE_TONES[i % COURSE_TONES.length]]));
  const ranks: React.ReactNode[] = [];

  if (s.checkouts.count) {
    const rows = [
      ...(s.checkouts.inr ? [{ label: "Paid in rupees", value: s.checkouts.inr, shown: rupees(s.checkouts.inr), tone: "#15803D" }] : []),
      ...(s.checkouts.usd ? [{ label: "Paid in dollars", value: s.checkouts.usd * usdInr, shown: rupees(s.checkouts.usd * usdInr), tone: "#15803D" }] : []),
    ];
    ranks.push(
      <Rank key="checkouts" rank={ranks.length + 1} impact={`≈ ${rupees(s.checkouts.inrTotal)} started paying`} title={`Confirm the ${n(s.checkouts.count)} website ${s.checkouts.count === 1 ? "checkout" : "checkouts"}`}>
        <Bars rows={rows} />
        <p className="text-[13px] leading-5 text-copy">
          {s.checkouts.usd ? `${usd(s.checkouts.usd)} of it is in dollars. ` : ""}They opened a checkout on your website, but the CRM never heard whether it went through. <strong>Check your bank or PayPal and mark each one</strong>; until then none of it counts as collected.
        </p>
        <div className="mt-auto"><Link href="/admissions?view=payments" className="btn-primary">Open Check who paid</Link></div>
        <p className="text-[11.5px] text-copy-subtle">Website checkouts still pending · dollars at ₹{usdInr.toFixed(2)}</p>
      </Rank>,
    );
  }

  if (s.warm.recent || s.warm.quiet) {
    ranks.push(
      <Rank key="warm" rank={ranks.length + 1} impact={`${n(s.warm.recent)} warm${s.warm.valueInr ? ` · ≈ ${rupees(s.warm.valueInr)}` : ""}`} title="Talk to the High-intent and Qualified people who wrote recently">
        <Bars rows={[
          { label: "Wrote in the last 2 weeks", value: s.warm.recent, shown: n(s.warm.recent), tone: "#5743C5" },
          { label: "Gone quiet", value: s.warm.quiet, shown: n(s.warm.quiet), tone: "#D9D5E6" },
        ]} />
        <p className="text-[13px] leading-5 text-copy">
          Of {n(s.warm.recent + s.warm.quiet)} people at High intent or Qualified, <strong>{n(s.warm.recent)} wrote in the last 14 days</strong> ({n(s.warm.highIntentRecent)} High intent, {n(s.warm.qualifiedRecent)} Qualified). They’re the realistic next enrolments; the other {n(s.warm.quiet)} need a check-in first.
        </p>
        <div className="mt-auto flex flex-wrap gap-2">
          <Link href="/leads?stage=high_intent" className="btn-primary">See High intent</Link>
          <Link href="/leads?stage=qualified" className="btn-secondary">See Qualified</Link>
        </div>
        <p className="text-[11.5px] text-copy-subtle">Indian prices{s.warm.intl ? ` · ${n(s.warm.intl)} international not added` : ""}</p>
      </Rank>,
    );
  }

  if (s.spendStale || !s.spendLastDay) {
    const known = s.spend.filter((m) => m.amount !== null);
    const missing = s.spend.filter((m) => m.amount === null);
    const missingLabel = missing.length ? (missing.length === 1 ? monthName(missing[0].month, "short") : `${monthName(missing[0].month, "short")}–${monthName(missing[missing.length - 1].month, "short")}`) : "";
    const lastDay = s.spendLastDay ? new Date(`${s.spendLastDay}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : null;
    const max = Math.max(...known.map((m) => m.amount ?? 0), 1);
    ranks.push(
      <Rank key="spend" rank={ranks.length + 1} impact={lastDay ? `Ad spend missing since ${lastDay}` : "No ad spend yet"} title="Reconnect Meta Ads to see what each enrolment costs">
        <Bars max={max} rows={[
          ...known.map((m) => ({ label: monthName(m.month), value: m.amount ?? 0, shown: rupees(m.amount ?? 0), tone: "#C2410C" })),
          ...(missingLabel ? [{ label: missingLabel, value: 0, shown: "—", tone: "#D9D5E6" }] : []),
        ]} />
        <p className="text-[13px] leading-5 text-copy">
          {lastDay ? <>Spend stopped syncing on {lastDay}, so <strong>cost per enrolment is unknown{missingLabel ? ` for ${missingLabel}` : ""}</strong>.</> : <>No Meta ad spend has synced, so cost per enrolment can’t be worked out.</>}
        </p>
        <div className="mt-auto"><Link href="/settings/integrations" className="btn-primary">Reconnect Meta Ads</Link></div>
        <p className="text-[11.5px] text-copy-subtle">Meta Ads daily spend</p>
      </Rank>,
    );
  }

  const from = monthName(since.slice(0, 7));
  const pct = s.conversion === null ? "—" : `${(s.conversion * 100).toFixed(s.conversion < 0.1 ? 1 : 0)}%`;

  return (
    <div className="flex flex-col gap-3.5" aria-label="Revenue briefing">
      {ranks.length ? <div className={`grid gap-3.5 ${ranks.length >= 3 ? "lg:grid-cols-3" : ranks.length === 2 ? "lg:grid-cols-2" : ""}`}>{ranks}</div> : null}

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Collected this month" value={rupees(s.thisMonthInr)} sub={`${n(s.thisMonthEnrolments)} ${s.thisMonthEnrolments === 1 ? "enrolment" : "enrolments"}${s.lastMonthInr !== null ? ` · last month ${rupees(s.lastMonthInr)}` : ""}`} />
        <Kpi label={`Collected since ${from}`} value={rupees(s.collectedInr)} sub={`${n(s.enrolments)} ${s.enrolments === 1 ? "enrolment" : "enrolments"}${s.otherCurrencies.length ? ` · plus ${s.otherCurrencies.map((c) => `${c.currency} ${n(Math.round(c.amount))}`).join(", ")}` : ", all in rupees"}`} />
        <Kpi label="Average enrolment" value={s.average === null ? "—" : rupees(s.average)} sub={s.average === null ? "No enrolments yet" : `${rupees(s.collectedInr)} ÷ ${n(s.enrolments)} enrolments`} />
        <Kpi label="Enquiry → enrolment" value={pct} sub={`${n(s.enrolments)} of ${n(s.enquiries)} enquiries since 1 ${monthName(since.slice(0, 7), "short")}`} />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold text-copy-strong">Money collected per month, by course</h2>
              <p className="text-[12.5px] text-copy-muted">Confirmed payments only. Website checkouts count once someone confirms them.</p>
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1">
              {s.courses.map((c) => (
                <span key={c.course} className="inline-flex items-center gap-1.5 text-[12px] text-copy-muted"><span className="size-2.5 rounded-sm" style={{ background: tones.get(c.course) }} />{c.course}</span>
              ))}
            </div>
          </div>
          <MonthlyChart s={s} tones={tones} />
        </section>

        <section className={card}>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Where the money came from</h2>
          {s.courses.length ? (
            <div className="space-y-2">
              {s.courses.map((c) => (
                <div key={c.course} className="grid grid-cols-[minmax(0,240px)_minmax(0,1fr)_64px] items-center gap-2.5 text-[13px]">
                  <span className="truncate text-copy">{c.course} · {n(c.enrolments)}</span>
                  <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded" style={{ width: `${(c.amount / (s.courses[0].amount || 1)) * 100}%`, background: tones.get(c.course) }} /></span>
                  <strong className="text-right tabular-nums text-copy-strong">{rupees(c.amount)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="text-[13px] text-copy-muted">No confirmed payments since {from} yet.</p>}
          {s.engaged ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] leading-5 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-orange-700 dark:text-orange-300">The big “pipeline” number isn’t money yet</p>
              <p className="mt-1">The detailed numbers below add up every open enquiry’s course price. <strong>{n(s.engaged)}</strong> of those people are at Engaged, mostly people who asked the fee once, so that total isn’t money anyone owes.</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
