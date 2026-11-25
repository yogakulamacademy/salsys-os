import Link from "next/link";

import { moveSaidNoToNotNowAction } from "@/app/re-engaged/actions";
import { SubmitButton } from "@/components/submit-button";
import { ToastForm } from "@/components/toast-form";
import { REPLY_LABEL, REPLY_ORDER, type ReengagedData, type ReengagedSummary, type ReplyKind } from "@/lib/reengaged-story";

// Smart Re-engaged briefing (owner-approved mockup "Smart Re-engaged", 25 Nov
// 2026): who wrote back after 7+ days of silence, what they said, and who to
// contact first. Every number comes from live messages.

const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs";
const n = (x: number) => x.toLocaleString("en-IN");
const inr = (x: number) => (x >= 100000 ? `≈ ₹${(x / 100000).toFixed(1)} L` : `≈ ₹${Math.round(x).toLocaleString("en-IN")}`);
const weekLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const STAGE: Record<string, string> = { new: "New", contacted: "Contacted", engaged: "Engaged", qualified: "Qualified", high_intent: "High intent", payment_pending: "Payment pending", nurture: "Nurture" };
const KIND_TONE: Record<ReplyKind, string> = { yes: "bg-emerald-600", asked: "bg-blue-600", other: "bg-slate-400", shared: "bg-slate-300", no: "bg-red-700" };
const initials = (s: string) => s.replace(/[_.]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•";

function Bars({ rows }: { rows: Array<{ label: string; value: number; tone: string }> }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[150px_minmax(0,1fr)_40px] items-center gap-2.5 text-[12.5px]">
          <span className="truncate text-copy-muted">{r.label}</span>
          <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className={`block h-full rounded ${r.tone}`} style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <strong className="text-right tabular-nums text-copy-strong">{n(r.value)}</strong>
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

function Kpi({ label, value, sub, badge }: { label: string; value: string; sub: string; badge?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-2"><span className="text-[12.5px] font-semibold text-copy-muted">{label}</span>{badge}</div>
      <span className="text-[28px] font-extrabold tracking-tight text-copy-strong tabular-nums">{value}</span>
      <span className="truncate text-[12px] text-copy-muted">{sub}</span>
    </div>
  );
}

function WeeklyChart({ data, usual }: { data: ReengagedData; usual: number }) {
  const W = 1000, H = 230, B = 26, T = 22;
  const weeks = data.weeks;
  const max = Math.max(...weeks.map((w) => w.people), usual, 4);
  const step = (W - 20) / Math.max(1, weeks.length);
  const bw = Math.min(110, step * 0.55);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[230px] w-full" role="img" aria-label="People who came back after 7 or more days of silence, per week">
      {usual ? (
        <g>
          <line x1={10} x2={W - 10} y1={y(usual)} y2={y(usual)} stroke="#5743C5" strokeDasharray="6 5" strokeWidth={1.5} opacity={0.7} />
          <text x={14} y={y(usual) - 6} className="fill-brand-700 text-[12px] font-semibold">usual ≈ {usual}</text>
        </g>
      ) : null}
      {weeks.map((w, i) => {
        const x = 10 + i * step + step / 2;
        const current = i === weeks.length - 1;
        const high = usual > 0 && w.people >= usual * 1.5;
        return (
          <g key={w.week}>
            <rect x={x - bw / 2} y={y(w.people)} width={bw} height={Math.max(1, H - B - y(w.people))} rx={4}
              fill={high ? "#C2410C" : "#C9C1F2"} stroke={current ? "#111827" : "none"} strokeWidth={current ? 2.5 : 0}>
              <title>{`Week of ${weekLabel(w.week)}: ${w.people} came back, ${w.afterCheckin} after a check-in`}</title>
            </rect>
            <text x={x} y={y(w.people) - 6} textAnchor="middle" className="fill-copy-strong text-[13px] font-bold">{w.people}</text>
            <text x={x} y={H - 8} textAnchor="middle" className="fill-copy-muted text-[12px]">{weekLabel(w.week)}{current ? " (now)" : ""}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function SmartReengagedBriefing({ data, s }: { data: ReengagedData; s: ReengagedSummary }) {
  const ranks: React.ReactNode[] = [];
  if (s.readyAll.length) {
    const yes = s.ready.filter((p) => p.kind === "yes").length;
    const asked = s.ready.length - yes;
    ranks.push(
      <Rank key="ready" rank={ranks.length + 1} impact={s.ready.length ? `${n(s.ready.length)} ready to talk` : "All answered"} title={s.ready.length ? `Reply to the ${n(yes)} who said yes and the ${n(asked)} who asked a question` : "Everyone who said yes or asked has a reply"}>
        <Bars rows={[
          { label: "Said yes", value: s.kinds.yes, tone: "bg-emerald-600" },
          { label: "Asked a question", value: s.kinds.asked, tone: "bg-blue-600" },
          { label: "Waiting on us", value: s.ready.length, tone: "bg-orange-700" },
        ]} />
        <p className="text-[13px] leading-5 text-copy">{s.readyAdvanced ? `${n(s.readyAdvanced)} of them were already at High intent or Payment pending. ` : ""}They’re listed on the right, High intent first.</p>
        <div className="mt-auto"><Link href="#contact-first" className="btn-primary">See them</Link></div>
        <p className="text-[11.5px] text-copy-subtle">Sorted from their reply text</p>
      </Rank>,
    );
  }
  if (s.saidNo.length) {
    ranks.push(
      <Rank key="no" rank={ranks.length + 1} impact={`${n(s.saidNo.length)} said no · keep lists clean`} title={`Move the ${n(s.saidNo.length)} who said no to “Not now”`}>
        <Bars rows={[{ label: "No / not now", value: s.saidNo.length, tone: "bg-red-700" }]} />
        <p className="text-[13px] leading-5 text-copy">Leaving them in Engaged makes every count look bigger. <strong>Not now</strong> keeps them out of the active lists, and they can come back.</p>
        <details className="group mt-auto">
          <summary className="btn-primary inline-flex cursor-pointer list-none">Review and move</summary>
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-xl bg-surface-muted p-2.5 text-[12.5px]">
            {s.saidNo.map((p) => (
              <p key={p.leadId} className="truncate"><Link href={`/conversations?lead=${p.leadId}`} className="font-semibold text-copy-strong hover:underline">{p.name}</Link> <span className="text-copy-muted">“{p.body.replace(/\s+/g, " ").slice(0, 70)}”</span></p>
            ))}
          </div>
          <ToastForm action={moveSaidNoToNotNowAction} className="mt-2">
            {s.saidNo.slice(0, 200).map((p) => <input key={p.leadId} type="hidden" name="lead_id" value={p.leadId} />)}
            <SubmitButton pendingLabel="Moving…" className="btn-primary">Move {n(Math.min(200, s.saidNo.length))} to Not now</SubmitButton>
          </ToastForm>
        </details>
        <p className="text-[11.5px] text-copy-subtle">Each shows the message they replied with</p>
      </Rank>,
    );
  }
  if (s.thisWeek) {
    ranks.push(
      <Rank key="checkin" rank={ranks.length + 1} impact="The check-in works" title={`Your team’s check-in messages got ${n(s.afterCheckin)} replies`}>
        <Bars rows={[
          { label: "Replied to our check-in", value: s.afterCheckin, tone: "bg-brand-600" },
          { label: "Came back on their own", value: s.onOwn, tone: "bg-brand-200" },
        ]} />
        <p className="text-[13px] leading-5 text-copy">A short check-in after a quiet spell brings people back. Most of this week’s comebacks were answers to one.</p>
        <p className="mt-auto text-[11.5px] text-copy-subtle">Typical silence before coming back: {n(s.medianSilence)} days</p>
      </Rank>,
    );
  }

  const total = Math.max(1, s.people.length);
  const list = s.readyAll.slice(0, 12);

  return (
    <div className="flex flex-col gap-3.5" aria-label="Re-engaged briefing">
      {ranks.length ? <div className="grid gap-3.5 lg:grid-cols-3">{ranks}</div> : null}

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Came back this week" value={n(s.thisWeek)} sub={s.usual ? `Usual week ≈ ${n(s.usual)}` : "First weeks of data"}
          badge={s.change != null && Math.abs(s.change) >= 0.12 ? (
            <span className={`inline-flex h-[22px] items-center rounded-full px-2 text-[12px] font-extrabold ${s.change > 0 ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"}`}>{s.change > 0 ? "▲" : "▼"} {Math.round(Math.abs(s.change) * 100)}%</span>
          ) : undefined} />
        <Kpi label="Waiting on us" value={n(s.waiting)} sub={s.waiting === s.thisWeek ? `All ${n(s.thisWeek)} wrote last` : `They wrote last · of ${n(s.thisWeek)}`} />
        <Kpi label="At High intent or later" value={n(s.advanced)} sub={`Of the ${n(s.thisWeek)}`} />
        <Kpi label="Potential value" value={s.valueInr ? inr(s.valueInr) : "—"} sub="Indian prices · those who didn’t say no" />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className={card}>
          <h2 className="text-[16px] font-extrabold text-copy-strong">People who came back after 7+ days of silence, per week</h2>
          <WeeklyChart data={data} usual={s.usual} />
          <div>
            <p className="mb-1.5 text-[13px] font-bold text-copy-strong">What the {n(s.people.length)} said</p>
            <div className="flex h-9 overflow-hidden rounded-lg">
              {REPLY_ORDER.filter((k) => s.kinds[k]).map((k) => (
                <div key={k} className={`grid place-items-center text-[12px] font-bold text-white ${KIND_TONE[k]}`} style={{ width: `${(s.kinds[k] / total) * 100}%` }} title={`${REPLY_LABEL[k]}: ${s.kinds[k]}`}>{s.kinds[k]}</div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-copy-muted">
              {REPLY_ORDER.map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${KIND_TONE[k]}`} />{REPLY_LABEL[k]}</span>)}
            </div>
          </div>
        </section>

        <section id="contact-first" className={card}>
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Contact first · said yes or asked</h2>
            <p className="text-[12.5px] text-copy-muted">Waiting on us first, then High intent, then how clearly they said yes</p>
          </div>
          {list.length ? (
            <div className="divide-y divide-line">
              {list.map((p) => (
                <div key={p.leadId} className="flex items-center gap-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-[11.5px] font-bold text-brand-700">{initials(p.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-copy-strong">{p.name}</p>
                    <p className="truncate text-[12.5px] text-copy">“{p.body.replace(/\s+/g, " ").slice(0, 80)}”</p>
                    <p className="truncate text-[11.5px] text-copy-muted">{[p.course, STAGE[p.stage] ?? p.stage].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Link href={`/conversations?lead=${p.leadId}`} className={p.waiting ? "btn-primary h-8 px-3 text-[12.5px]" : "btn-secondary h-8 px-3 text-[12.5px]"}>{p.waiting ? "Reply" : "Open"}</Link>
                </div>
              ))}
            </div>
          ) : <p className="text-[13px] text-copy-muted">Nobody said yes or asked a question this week yet.</p>}
        </section>
      </div>
    </div>
  );
}
