import Link from "next/link";

import { closeSettledTasksInline } from "@/app/follow-ups/inline-actions";
import { SubmitButton } from "@/components/submit-button";
import { ToastForm } from "@/components/toast-form";
import { doneShare, type TasksIntelligence } from "@/lib/tasks-intelligence";

// Smart Tasks & follow-ups briefing (owner-approved mockup "Smart Tasks",
// 25 Nov 2026): ranked things to fix, four numbers, follow-ups created vs
// marked done per day with unusual days explained, and who owns them.

const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs";
const n = (x: number) => x.toLocaleString("en-IN");
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function Bars({ rows }: { rows: Array<{ label: string; value: number; tone: string }> }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[130px_minmax(0,1fr)_44px] items-center gap-2.5 text-[12.5px]">
          <span className="truncate text-copy-muted">{r.label}</span>
          <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className={`block h-full rounded ${r.tone}`} style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <strong className="text-right tabular-nums text-copy-strong">{n(r.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function Rank({ rank, impact, title, children, first }: { rank: number; impact: string; title: string; children: React.ReactNode; first: boolean }) {
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

function DailyChart({ data }: { data: TasksIntelligence }) {
  const W = 1000, H = 250, L = 34, B = 26, T = 12;
  const max = Math.max(...data.daily.map((d) => Math.max(d.created, d.done)), 4);
  const step = (W - L - 10) / data.daily.length;
  const bw = Math.max(4, Math.min(18, step * 0.36));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const flagged = new Map(data.flagged.map((f) => [f.day, f]));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[250px] w-full" role="img" aria-label="Follow-ups created and marked done per day">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - 10} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-line" strokeWidth={1} />
            <text x={L - 6} y={y(max * f) + 4} textAnchor="end" className="fill-copy-muted text-[11px]">{Math.round(max * f)}</text>
          </g>
        ))}
        {data.daily.map((d, i) => {
          const x = L + i * step + step / 2;
          return (
            <g key={d.day}>
              <rect x={x - bw - 1} y={y(d.created)} width={bw} height={H - B - y(d.created)} rx={2} fill="#C2410C" opacity={flagged.has(d.day) ? 1 : 0.85}>
                <title>{`${dayLabel(d.day)}: ${d.created} created`}</title>
              </rect>
              <rect x={x + 1} y={y(d.done)} width={bw} height={H - B - y(d.done)} rx={2} fill="#15803D">
                <title>{`${dayLabel(d.day)}: ${d.done} marked done`}</title>
              </rect>
              {i % 3 === 0 ? <text x={x} y={H - 8} textAnchor="middle" className="fill-copy-muted text-[11px]">{dayLabel(d.day)}</text> : null}
            </g>
          );
        })}
      </svg>
      {data.flagged.length ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {data.flagged.map((f) => (
            <div key={f.day} className="rounded-lg border border-orange-300 bg-orange-50/60 px-3 py-2 text-[12.5px] dark:border-orange-900/60 dark:bg-orange-950/20">
              <p className="font-bold text-orange-800 dark:text-orange-300">{dayLabel(f.day)} · {n(f.created)} created</p>
              <p className="text-copy">{f.top.map((t) => `${n(t.n)} “${t.title}”`).join(", ")}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SmartTasksBriefing({ data, lostChecks }: { data: TasksIntelligence; lostChecks: number }) {
  const ranks: React.ReactNode[] = [];
  if (data.answeredIds.length) {
    ranks.push(
      <Rank key="answered" rank={ranks.length + 1} first={!ranks.length} impact={`${n(data.answeredIds.length)} can close right now`} title="Close the follow-ups we’ve already answered">
        <Bars rows={[
          { label: "Late this week", value: data.lateThisWeek, tone: "bg-orange-700" },
          { label: "Already answered", value: data.answeredIds.length, tone: "bg-emerald-600" },
        ]} />
        <p className="text-[13px] leading-5 text-copy">We’ve replied to these people since the follow-up was created and they haven’t written back since.</p>
        <div className="mt-auto flex flex-wrap gap-2">
          <ToastForm action={closeSettledTasksInline}>
            {data.answeredIds.slice(0, 200).map((id) => <input key={id} type="hidden" name="task_id" value={id} />)}
            <SubmitButton pendingLabel="Closing…" className="btn-primary">Close the {n(Math.min(200, data.answeredIds.length))}</SubmitButton>
          </ToastForm>
          <Link href="#followups-list" className="btn-secondary">Review first</Link>
        </div>
        <p className="text-[11.5px] text-copy-subtle">Checked against every message, including replies typed in Instagram</p>
      </Rank>,
    );
  }
  if (lostChecks) {
    ranks.push(
      <Rank key="lost" rank={ranks.length + 1} first={!ranks.length} impact={`${n(lostChecks)} one-click decisions`} title="Confirm the AI’s “Lost?” checks">
        <Bars rows={[{ label: "AI thinks they said no", value: lostChecks, tone: "bg-slate-400" }]} />
        <p className="text-[13px] leading-5 text-copy">Each shows the message where they said no. <strong>Mark Lost</strong> or <strong>Keep them</strong>; answered ones leave every list.</p>
        <div className="mt-auto"><Link href="/follow-ups?view=lost" className={ranks.length ? "btn-secondary" : "btn-primary"}>Review the {n(lostChecks)}</Link></div>
        <p className="text-[11.5px] text-copy-subtle">Created when a reply reads like a no</p>
      </Rank>,
    );
  }
  if (data.noOwner) {
    ranks.push(
      <Rank key="owner" rank={ranks.length + 1} first={!ranks.length} impact={`${n(data.noOwner)} of ${n(data.open)} have no owner`} title="Give every follow-up an owner">
        <Bars rows={[
          { label: "No owner", value: data.noOwner, tone: "bg-red-700" },
          { label: "Has an owner", value: data.open - data.noOwner, tone: "bg-brand-600" },
        ]} />
        <p className="text-[13px] leading-5 text-copy">A follow-up with no owner reminds nobody. Give each lead an owner so every person sees only their own list.</p>
        <div className="mt-auto"><Link href="/team-performance" className={ranks.length ? "btn-secondary" : "btn-primary"}>Assign owners</Link></div>
        <p className="text-[11.5px] text-copy-subtle">Open follow-ups today</p>
      </Rank>,
    );
  }

  return (
    <div className="flex flex-col gap-3.5" aria-label="Follow-ups briefing">
      {ranks.length ? <div className="grid gap-3.5 lg:grid-cols-3">{ranks}</div> : null}

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Late" value={n(data.late)} sub={`${n(data.lateThisWeek)} from this week`} />
        <Kpi label={`Marked done · ${data.windowDays / 7} weeks`} value={`${Math.round(doneShare(data) * 100)}%`} sub={`${n(data.done)} of ${n(data.created)} created`} />
        <Kpi label="Due today" value={n(data.dueToday)} sub={data.dueTodayPast ? `${n(data.dueTodayPast)} already past their time` : "None past their time yet"} />
        <Kpi label="No owner" value={n(data.noOwner)} sub={`Of ${n(data.open)} open`} />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-[16px] font-extrabold text-copy-strong">Follow-ups created vs marked done, per day</h2>
              <p className="text-[12.5px] text-copy-muted">The gap between the two is why the list keeps growing</p>
            </div>
            <div className="flex gap-3 text-[12px] text-copy-muted">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#C2410C]" />Created</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#15803D]" />Marked done</span>
            </div>
          </div>
          <DailyChart data={data} />
        </section>

        <section className={card}>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Who owns them</h2>
          <Bars rows={data.owners.map((o) => ({ label: o.name, value: o.n, tone: o.name === "Nobody yet" ? "bg-red-700" : "bg-brand-600" }))} />
          {data.noOwner && data.noOwner >= data.open / 2 ? (
            <div className="rounded-xl border border-red-200 bg-red-50/60 px-3.5 py-3 text-[13px] dark:border-red-900/50 dark:bg-red-950/20">
              <p className="mb-1 text-[11.5px] font-extrabold uppercase tracking-wide text-red-700 dark:text-red-300">Why it matters</p>
              <p className="text-copy">With no owner, nobody is reminded. When each lead has an owner, each person gets a short daily list instead.</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
