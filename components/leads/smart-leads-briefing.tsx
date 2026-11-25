import Link from "next/link";

import {
  courseTrends, kpis, normalBand, suggestions, unusualRuns, valueOf,
  type Channel, type LeadsIntelligence, type Suggestion,
} from "@/lib/leads-intelligence";

// Smart Leads briefing (owner-approved mockup "Leads v2", 25 Nov 2026):
// a search box with shortcuts, three ranked suggestions, numbers compared
// with a usual week, new people per day against the usual range with unusual
// days flagged, and demand by course. Every number comes from live data.

const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs";
const inr = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)} lakh` : `₹${Math.round(n).toLocaleString("en-IN")}`);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function Spark({ values, tone = "#5743C5", w = 112, h = 32 }: { values: number[]; tone?: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [4 + (i * (w - 8)) / (values.length - 1), h - 4 - (v / max) * (h - 8)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <polygon points={`4,${h - 4} ${line} ${lx.toFixed(1)},${h - 4}`} fill={tone} opacity={0.1} />
      <polyline points={line} fill="none" stroke={tone} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3.5} fill={tone} />
    </svg>
  );
}

function Delta({ change, goodWhenUp = true }: { change: number | null; goodWhenUp?: boolean }) {
  if (change == null) return null;
  const up = change >= 0;
  const cls = Math.abs(change) < 0.12 ? "bg-surface-muted text-copy-muted"
    : up === goodWhenUp ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
      : "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300";
  return <span className={`inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[12px] font-extrabold ${cls}`}>{up ? "▲" : "▼"} {Math.round(Math.abs(change) * 100)}%</span>;
}

function Kpi({ label, value, sub, delta, spark }: { label: string; value: string; sub: string; delta?: React.ReactNode; spark?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-2"><span className="text-[12.5px] font-semibold text-copy-muted">{label}</span>{delta}</div>
      <div className="flex items-end justify-between gap-2"><span className="text-[28px] font-extrabold tracking-tight text-copy-strong tabular-nums">{value}</span>{spark}</div>
      <div className="truncate text-[12px] text-copy-muted">{sub}</div>
    </div>
  );
}

const TONE: Record<Suggestion["evidence"][number]["tone"], string> = { good: "bg-emerald-600", bad: "bg-red-600", neutral: "bg-line", brand: "bg-brand-600" };

function SuggestionCard({ s, rank }: { s: Suggestion; rank: number }) {
  const max = Math.max(...s.evidence.map((e) => e.value), 0.0001);
  return (
    <article className={`${card} ${rank === 1 ? "border-brand-200 shadow-[0_8px_24px_rgba(87,67,197,0.10)]" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`grid size-6 place-items-center rounded-lg text-[12.5px] font-extrabold ${rank === 1 ? "bg-copy-strong text-surface" : "bg-brand-50 text-brand-700"}`}>{rank}</span>
        <span className="text-[12px] font-extrabold tracking-wide text-brand-700 dark:text-brand-300">{s.impact}</span>
      </div>
      <h3 className="text-[16px] font-extrabold leading-snug text-copy-strong">{s.title}</h3>
      <div className="space-y-1.5">
        {s.evidence.map((e) => (
          <div key={e.label} className="grid grid-cols-[150px_minmax(0,1fr)_48px] items-center gap-2.5 text-[12.5px]">
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

function DailyChart({ data, channel, range }: { data: LeadsIntelligence; channel: Channel; range: 30 | 90 }) {
  const fullBand = normalBand(data.daily, channel);
  const runs = unusualRuns(data.daily, fullBand).filter((r) => fullBand.findIndex((b) => b.d === r.from) >= fullBand.length - range);
  const band = fullBand.slice(-range);
  const W = 1000; const H = 260; const PL = 34; const PB = 22;
  const max = Math.max(10, ...band.map((b) => Math.max(b.value, b.high))) * 1.1;
  const X = (i: number) => PL + (i * (W - PL - 8)) / Math.max(1, band.length - 1);
  const Y = (v: number) => H - PB - (v / max) * (H - PB - 8);
  const ticks = [0, Math.round(max / 2 / 10) * 10, Math.round((max * 0.95) / 10) * 10].filter((v, i, a) => a.indexOf(v) === i);
  const upper = band.map((b, i) => `${X(i).toFixed(1)},${Y(b.high).toFixed(1)}`).join(" ");
  const lower = band.map((b, i) => `${X(i).toFixed(1)},${Y(b.low).toFixed(1)}`).reverse().join(" ");
  const labelEvery = range === 30 ? 3 : 10;
  const href = (r: number, c: Channel) => `/leads?range=${r}${c === "all" ? "" : `&ch=${c}`}#leads-daily`;
  return (
    <section id="leads-daily" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-extrabold text-copy-strong">New people per day, against your usual range</h3>
          <p className="text-[12.5px] text-copy-muted">Shaded band = your usual range over the 2 weeks before each day · circles = unusual days · hover a point for its numbers</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-0.5 rounded-xl bg-surface-muted p-[3px]">
            {(["all", "instagram", "website"] as Channel[]).map((c) => (
              <Link key={c} href={href(range, c)} scroll={false} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${c === channel ? "bg-brand-600 text-white" : "text-copy-muted"}`}>{c === "all" ? "All" : c === "instagram" ? "Instagram" : "Website"}</Link>
            ))}
          </div>
          <div className="flex gap-0.5 rounded-xl bg-surface-muted p-[3px]">
            {([30, 90] as const).map((r) => (
              <Link key={r} href={href(r, channel)} scroll={false} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${r === range ? "bg-brand-600 text-white" : "text-copy-muted"}`}>{r} days</Link>
            ))}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="New people per day with the usual range">
        {ticks.map((t) => (
          <g key={t}><line x1={PL} x2={W} y1={Y(t)} y2={Y(t)} stroke="currentColor" className="text-line" /><text x={PL - 6} y={Y(t) + 4} fontSize={11} textAnchor="end" className="fill-copy-subtle">{t}</text></g>
        ))}
        <polygon points={`${upper} ${lower}`} fill="#5743C5" opacity={0.1} />
        <polyline points={band.map((b, i) => `${X(i).toFixed(1)},${Y(b.mid).toFixed(1)}`).join(" ")} fill="none" stroke="#5743C5" strokeWidth={1.2} strokeDasharray="4 4" opacity={0.6} />
        <polyline points={band.map((b, i) => `${X(i).toFixed(1)},${Y(b.value).toFixed(1)}`).join(" ")} fill="none" stroke="currentColor" className="text-copy-strong" strokeWidth={2.4} strokeLinejoin="round" />
        {band.map((b, i) => {
          const p = data.daily[data.daily.length - range + i];
          const flagged = b.flag && i !== band.length - 1;
          return (
            <g key={b.d}>
              <circle cx={X(i)} cy={Y(b.value)} r={flagged ? 5 : 9} fill={flagged ? "#fff" : "transparent"} stroke={flagged ? (b.flag === "high" ? "#C2410C" : "#B42318") : "none"} strokeWidth={2.5}>
                <title>{`${dayLabel(b.d)} · ${b.value} new (usual ${Math.round(b.low)}–${Math.round(b.high)})\nInstagram ${p.instagram} · Website ${p.website}${p.fromAd ? ` · from an ad ${p.fromAd}` : ""}\nBecame Qualified so far: ${p.qualified}`}</title>
              </circle>
              {i % labelEvery === 0 || i === band.length - 1 ? <text x={X(i)} y={H - 4} fontSize={11} textAnchor="middle" className="fill-copy-subtle">{dayLabel(b.d)}</text> : null}
            </g>
          );
        })}
      </svg>
      {runs.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {runs.slice(0, 2).map((r) => {
            const high = r.direction === "high";
            const perDay = Math.round(r.total / r.days);
            const span = r.from === r.to ? dayLabel(r.from) : `${dayLabel(r.from)}–${dayLabel(r.to)}`;
            const mostlyAd = high && r.fromAd >= r.total * 0.5;
            const someAd = high && !mostlyAd && r.fromAd > 0;
            return (
              <div key={r.from} className={`rounded-xl border-[1.5px] bg-surface px-3 py-2 text-[12.5px] leading-5 ${high ? "border-orange-300" : "border-red-300"}`}>
                <strong className={high ? "text-orange-700 dark:text-orange-300" : "text-red-700 dark:text-red-300"}>Unusually {r.direction} · {span}</strong>
                <span className="text-copy"> · {r.days > 1 ? `${r.total} in ${r.days} days` : `${r.total} that day`} vs about {Math.round(r.usualPerDay)} a day usually.
                  {" "}{mostlyAd ? `${r.fromAd} came from an Instagram ad.` : someAd ? `${r.fromAd} of them came from an Instagram ad.` : r.instagram >= r.website ? `Mostly Instagram (${r.instagram}); website ${r.website}.` : `Mostly website (${r.website}); Instagram ${r.instagram}.`}
                  {!high && r.fromAd === 0 && r.usualFromAdPerDay >= 3 ? ` Nobody came from an ad (usually about ${Math.round(r.usualFromAdPerDay)} a day): did the ads stop?` : !high && perDay < 3 ? " Did an ad or post stop?" : ""}</span>
              </div>
            );
          })}
        </div>
      ) : <p className="text-[12.5px] text-copy-muted">No unusual days in this period.</p>}
    </section>
  );
}

export function SmartLeadsBriefing({ data, channel = "all", range = 30, searchQuery = "" }: { data: LeadsIntelligence; channel?: Channel; range?: 30 | 90; searchQuery?: string }) {
  const k = kpis(data);
  const ideas = suggestions(data);
  const courses = courseTrends(data);
  const newChange = k.newUsualWeek ? (k.newThisWeek - k.newUsualWeek) / k.newUsualWeek : null;
  const qualChange = k.qualRate != null && k.qualEarlier ? (k.qualRate - (k.qualEarlier[0] + k.qualEarlier[1]) / 2) / ((k.qualEarlier[0] + k.qualEarlier[1]) / 2 || 1) : null;
  const thisWeekReply = data.weeks.find((w) => w.wkAgo === 0);
  return (
    <div className="space-y-3">
      <form action="/leads" method="get" className="flex flex-wrap items-center gap-3 rounded-2xl border-[1.5px] border-brand-200 bg-surface px-3.5 py-2.5">
        <span className="grid size-[30px] place-items-center rounded-[9px] bg-brand-600 font-extrabold text-white" aria-hidden>✦</span>
        <input name="q" defaultValue={searchQuery} placeholder="Find leads… a name, a phone number or something they wrote" aria-label="Find leads" className="min-w-[240px] flex-1 bg-transparent text-[14px] text-copy-strong outline-none placeholder:text-copy-subtle" />
        {[["Waiting on us", "/conversations?filter=waiting"], ["Qualified and up", "/leads?view=qualified_up"], ["Payment pending", "/leads?stage=payment_pending"]].map(([t, h]) => (
          <Link key={t} href={h} className="rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-bold text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">{t}</Link>
        ))}
      </form>

      {ideas.length ? (
        <div className={`grid gap-3.5 ${ideas.length === 3 ? "xl:grid-cols-[1.15fr_1fr_1fr]" : ideas.length === 2 ? "xl:grid-cols-2" : ""}`}>
          {ideas.map((s, i) => <SuggestionCard key={s.key} s={s} rank={i + 1} />)}
        </div>
      ) : null}

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="New people · last 7 days" value={k.newThisWeek.toLocaleString("en-IN")} sub={`Usual week ≈ ${k.newUsualWeek.toLocaleString("en-IN")}`} delta={<Delta change={newChange} />} spark={<Spark values={k.newSpark} />} />
        <Kpi label="Get a reply from us" value={k.replyRate != null ? pct(k.replyRate) : "—"} sub={`Weekly: ${k.replySpark.map(pct).join(", ")}${thisWeekReply && thisWeekReply.wrote ? ` · this week so far ${pct(thisWeekReply.replied / thisWeekReply.wrote)}` : ""}`} spark={<Spark values={k.replySpark} tone="#1E8A50" />} />
        <Kpi label="Become Qualified" value={k.qualRate != null ? pct(k.qualRate) : "—"} sub={k.qualEarlier ? `People who wrote 8–14 days ago · earlier weeks ${pct(k.qualEarlier[0])}–${pct(k.qualEarlier[1])}` : "People who wrote 8–14 days ago"} delta={<Delta change={qualChange} />} spark={<Spark values={k.qualSpark} tone="#2563EB" />} />
        <Kpi label="Open pipeline" value={`≈ ${inr(k.pipelineInr)}`} sub={`${k.pipelineN.toLocaleString("en-IN")} at Qualified, High intent or Payment · Indian prices`} />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_600px]">
        <DailyChart data={data} channel={channel} range={range} />
        <section id="leads-courses" className={card}>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">By course · last 4 weeks</h3>
          <div className="grid grid-cols-[minmax(0,1.5fr)_100px_64px_62px_70px] gap-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-copy-subtle">
            <span>Course</span><span>Trend</span><span>vs usual</span><span className="text-right">Qualified</span><span className="text-right">Open ₹</span>
          </div>
          {courses.map((c) => (
            <div key={c.courseId ?? "unknown"} className={`grid grid-cols-[minmax(0,1.5fr)_100px_64px_62px_70px] items-center gap-2.5 border-t border-line pt-2 ${c.known ? "" : "opacity-75"}`}>
              <div className="min-w-0">
                {c.known ? <Link href={`/leads?course=${encodeURIComponent(c.name)}`} className="block truncate text-[13px] font-bold text-copy-strong hover:underline">{c.name}</Link> : <span className="block truncate text-[13px] font-bold text-copy-strong">{c.name}</span>}
                <span className="text-[11.5px] text-copy-muted">{c.now} this week · usual {c.usual}</span>
              </div>
              <Spark values={c.weeks} w={100} h={30} tone={c.change != null && c.change < -0.25 ? "#B42318" : c.change != null && c.change > 0.1 ? "#1E8A50" : "#5743C5"} />
              <Delta change={c.change} />
              <span className="text-right text-[13px] font-bold tabular-nums">{pct(c.qualifiedShare)}</span>
              <span className="text-right text-[13px] font-bold tabular-nums">{c.openInr ? inr(c.openInr).replace(" lakh", " L") : "—"}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
