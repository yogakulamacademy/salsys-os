"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { addFunnelChangeAction, endFunnelChangeAction, saveFunnelAction } from "@/app/marketing/funnel-actions";
import { PageHead, card } from "@/components/marketing/smart-blocks";
import { PRESETS, STEP_INFO, STEP_KEYS, coursePages, measureFunnel, shortDay, type Draft, type FunnelDef, type MeasuredFunnel, type StepKey, type Suggestion } from "@/lib/funnel-advisor";
import type { FunnelAdvisorPage, SavedFunnel } from "@/lib/funnel-advisor-data";
import { toast } from "@/lib/toast";

// Funnel advisor (owner-approved prototype "Funnel advisor", 26 Nov 2026):
// suggestions from the organisation's own numbers, and funnels the team
// defines (SEO funnels included), measured step by step with before/after
// checks for changes. Drafts are never sent or published from here.

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const seg = (on: boolean) => `h-8 rounded-lg px-3 text-[12.5px] font-bold ${on ? "bg-brand-600 text-white" : "text-copy-muted hover:text-copy-strong"}`;
const KIND: Record<Suggestion["type"], [string, string]> = {
  funnel: ["Funnel", "bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300"],
  content: ["Content", "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-200"],
  page: ["Web page", "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300"],
  search: ["SEO", "bg-teal-50 text-teal-800 dark:bg-teal-950/30 dark:text-teal-300"],
};
const input = "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-copy-strong outline-none focus:border-brand-500";

type Drawer = { kind: "draft"; title: string; draft: Draft } | { kind: "builder"; def: FunnelDef } | { kind: "change"; funnel: SavedFunnel } | null;

export function FunnelAdvisorPage({ page }: { page: FunnelAdvisorPage }) {
  const { advisor } = page;
  const [tab, setTab] = useState<"advice" | "mine">("advice");
  const [courseId, setCourseId] = useState(advisor.courses[0]?.id ?? "");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [pick, setPick] = useState<string | null>(page.funnels[0]?.id ?? null);
  const course = advisor.courses.find((c) => c.id === courseId) ?? advisor.courses[0];
  const funnel = page.funnels.find((f) => f.id === pick) ?? page.funnels[0];

  const newFunnel = (preset = PRESETS[0]) => setDrawer({ kind: "builder", def: { ...preset.def, courseId: course?.id ?? null, name: preset.def.name } });

  return (
    <div className="flex flex-col gap-3.5" aria-label="Funnel advisor">
      <PageHead eyebrow="Marketing" title="Funnel advisor" headline={advisor.headline}
        right={
          <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="View">
            <button type="button" aria-pressed={tab === "advice"} onClick={() => setTab("advice")} className={seg(tab === "advice")}>Suggestions</button>
            <button type="button" aria-pressed={tab === "mine"} onClick={() => setTab("mine")} className={seg(tab === "mine")}>My funnels ({n(page.funnels.length)})</button>
          </div>
        } />

      {tab === "advice" ? (
        <>
          {advisor.top.length ? (
            <div className={`grid gap-3.5 ${advisor.top.length >= 3 ? "xl:grid-cols-3" : advisor.top.length === 2 ? "xl:grid-cols-2" : ""}`}>
              {advisor.top.map((s, i) => (
                <article key={s.id} className={`${card} ${i === 0 ? "border-brand-100 shadow-[0_8px_24px_rgba(87,67,197,0.10)]" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`grid size-6 place-items-center rounded-lg text-[12.5px] font-extrabold ${i === 0 ? "bg-copy-strong text-surface" : "bg-brand-50 text-brand-700"}`}>{i + 1}</span>
                    <span className={`inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-extrabold uppercase ${KIND[s.type][1]}`}>{KIND[s.type][0]}</span>
                  </div>
                  <h3 className="text-[16px] font-extrabold leading-snug text-copy-strong">{s.title}</h3>
                  <p className="text-[13px] leading-5 text-copy">{s.body}</p>
                  <p className="text-[11.5px] text-copy-subtle">Why: {s.why}</p>
                  <div className="mt-auto"><button type="button" className={i === 0 ? "btn-primary" : "btn-secondary"} onClick={() => setDrawer({ kind: "draft", title: s.title, draft: s.draft })}>See the draft</button></div>
                </article>
              ))}
            </div>
          ) : null}

          {course ? (
            <section className={card}>
              <div>
                <h2 className="text-[16px] font-extrabold text-copy-strong">Course by course</h2>
                <p className="text-[12.5px] text-copy-muted">Where people come from, where they stop, and what to change · last {advisor.days} days</p>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Course">
                {advisor.courses.map((c) => (
                  <button key={c.id} type="button" aria-pressed={c.id === course.id} onClick={() => setCourseId(c.id)}
                    className={`rounded-xl border px-3 py-1.5 text-left text-[12.5px] font-bold ${c.id === course.id ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200" : "border-line bg-surface text-copy-muted hover:text-copy-strong"}`}>
                    {c.name}<span className="block text-[11px] font-semibold">{n(c.paid)} paid{c.next ? ` · next ${shortDay(c.next)}` : ""}</span>
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {([["Enquiries", course.enquiries, `${n(course.instagram)} Instagram · ${n(course.website)} website`], ["Course page visits", course.pageVisits, `${n(course.pageLeads)} enquiries from them`], ["Reached Qualified", course.qualified, `${pct(course.qualified, course.enquiries)}% of enquiries`], ["Paid", course.paid, course.qualified ? `${pct(course.paid, course.qualified)}% of Qualified` : ""], ["Next batch", course.next ? shortDay(course.next) : "—", course.next ? "" : "no batch scheduled"]] as const).map(([l, v, s]) => (
                  <div key={l} className="rounded-xl border border-line px-3.5 py-2.5">
                    <span className="block text-[12px] font-semibold text-copy-muted">{l}</span>
                    <span className="block text-[20px] font-extrabold tabular-nums text-copy-strong">{typeof v === "number" ? n(v) : v}</span>
                    <span className="block truncate text-[11.5px] text-copy-muted">{s}</span>
                  </div>
                ))}
              </div>
              <p className="rounded-lg border-l-[3px] border-brand-600 bg-brand-50/70 px-3 py-2.5 text-[12.5px] leading-5 text-copy dark:bg-brand-950/30">{course.leak}</p>
              {course.suggestions.length ? course.suggestions.map((s, i) => (
                <div key={s.id} className="grid grid-cols-[86px_minmax(0,1fr)_auto] items-start gap-3.5 border-t border-line py-3">
                  <span className={`inline-flex h-[22px] items-center justify-self-start rounded-full px-2 text-[11px] font-extrabold uppercase ${KIND[s.type][1]}`}>{KIND[s.type][0]}</span>
                  <div className="min-w-0">
                    <h4 className="text-[14.5px] font-bold text-copy-strong">{s.title}</h4>
                    <p className="mt-0.5 text-[13px] leading-5 text-copy">{s.body}</p>
                    <p className="mt-1 text-[12px] text-copy-muted">Why: {s.why}</p>
                  </div>
                  <button type="button" className={i === 0 ? "btn-primary" : "btn-secondary"} onClick={() => setDrawer({ kind: "draft", title: s.title, draft: s.draft })}>See the draft</button>
                </div>
              )) : <p className="text-[13px] text-copy-muted">Nothing stands out for this course yet.</p>}
              <div><button type="button" className="btn-secondary" onClick={() => newFunnel(PRESETS[1])}>Make a funnel for this course</button></div>
            </section>
          ) : null}

          <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <section className={card}>
              <div><h2 className="text-[16px] font-extrabold text-copy-strong">Which medium works</h2><p className="text-[12.5px] text-copy-muted">Website visits, enquiries and payments by how people came · last {advisor.days} days</p></div>
              <div className="grid grid-cols-[minmax(0,190px)_repeat(3,minmax(0,1fr))] gap-3 text-[11.5px] font-semibold text-copy-muted"><span>Medium</span><span>Website visits</span><span>Enquiries</span><span>Paid</span></div>
              {advisor.mediums.map((m) => {
                const maxV = Math.max(1, ...advisor.mediums.map((x) => x.visits)), maxE = Math.max(1, ...advisor.mediums.map((x) => x.enquiries)), maxP = Math.max(1, ...advisor.mediums.map((x) => x.paid));
                const cell = (v: number, max: number, color: string, extra = "") => (
                  <span className="flex items-center gap-2"><span className="h-2.5 flex-1 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded" style={{ width: `${(v / max) * 100}%`, background: color }} /></span><strong className="w-16 text-right text-[12.5px] tabular-nums text-copy-strong">{n(v)}{extra}</strong></span>
                );
                return (
                  <div key={m.label} className="grid grid-cols-[minmax(0,190px)_repeat(3,minmax(0,1fr))] items-center gap-3 border-t border-line py-2 text-[13px]">
                    <span><span className="block font-bold text-copy-strong">{m.label}</span><span className="block text-[11.5px] text-copy-muted">{m.note}</span></span>
                    {cell(m.visits, maxV, "#C9C1F2")}
                    {cell(m.enquiries, maxE, "#5743C5", m.visits && m.enquiries <= m.visits ? ` · ${Math.round((m.enquiries / m.visits) * 1000) / 10}%` : "")}
                    {cell(m.paid, maxP, "#15803D")}
                  </div>
                );
              })}
            </section>
            <section className={card}>
              <div><h2 className="text-[16px] font-extrabold text-copy-strong">SEO: searches you almost win</h2><p className="text-[12.5px] text-copy-muted">Seen often on Google at positions 4–20, but rarely clicked</p></div>
              {advisor.searches.length ? advisor.searches.map((q) => (
                <div key={q.query} className="grid grid-cols-[minmax(0,1fr)_70px_70px_56px] items-center gap-2 border-t border-line py-2 text-[13px]">
                  <span className="truncate font-semibold text-copy-strong" title={q.query}>{q.query}</span>
                  <span className="text-right tabular-nums">{n(q.views)} <span className="text-[11px] text-copy-muted">views</span></span>
                  <span className="text-right tabular-nums">{n(q.clicks)} <span className="text-[11px] text-copy-muted">clicks</span></span>
                  <span className="text-right tabular-nums text-copy-muted">#{q.position}</span>
                </div>
              )) : <p className="text-[13px] text-copy-muted">No search terms in that range yet.</p>}
              {advisor.searches.length ? <div><button type="button" className="btn-primary" onClick={() => setDrawer({ kind: "builder", def: { ...PRESETS[0].def, courseId: null, terms: advisor.searches.slice(0, 3).map((q) => q.query) } })}>Make an SEO funnel from these</button></div> : null}
            </section>
          </div>
        </>
      ) : (
        <>
          <section className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-[16px] font-extrabold text-copy-strong">My funnels</h2><p className="text-[12.5px] text-copy-muted">Paths you want people to take, measured step by step · last {advisor.days} days</p></div>
              <button type="button" className="btn-primary" onClick={() => newFunnel()}>+ New funnel</button>
            </div>
            {page.funnels.length ? page.funnels.map((f) => (
              <button key={f.id} type="button" onClick={() => setPick(f.id)} aria-pressed={f.id === funnel?.id}
                className={`grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-2 py-3 text-left hover:bg-surface-muted ${f.id === funnel?.id ? "rounded-xl bg-surface-muted" : ""}`}>
                <span className={`inline-flex h-[22px] items-center justify-self-start rounded-full px-2 text-[11px] font-extrabold ${f.kind === "seo" ? KIND.search[1] : f.status === "live" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-surface-muted text-copy-muted"}`}>{f.kind === "seo" ? "SEO" : f.status === "live" ? "Live" : "Draft"}</span>
                <span className="min-w-0"><span className="block truncate text-[14px] font-bold text-copy-strong">{f.name}</span>
                  <span className="block truncate text-[12px] text-copy-muted">{page.data.courses.find((c) => c.id === f.courseId)?.name ?? "All courses"}{f.goal ? ` · goal: ${f.goal}` : ""}</span></span>
                <span className="text-[12px] text-copy-muted">{f.measured.weakest != null ? `weakest: ${f.measured.steps[f.measured.weakest].label}` : `${n(f.steps.length)} steps`}</span>
              </button>
            )) : (
              <div className="grid gap-2 md:grid-cols-2">
                {PRESETS.map((p) => (
                  <button key={p.key} type="button" onClick={() => newFunnel(p)} className="rounded-xl border border-line p-3.5 text-left hover:border-brand-300 hover:bg-surface-muted">
                    <span className="block text-[14px] font-bold text-copy-strong">{p.title}</span><span className="block text-[12.5px] text-copy-muted">{p.summary}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          {funnel ? <FunnelDetail funnel={funnel} page={page} onEdit={() => setDrawer({ kind: "builder", def: funnel })} onChange={() => setDrawer({ kind: "change", funnel })} /> : null}
        </>
      )}

      <section className={card}>
        <div><h2 className="text-[16px] font-extrabold text-copy-strong">How the advisor decides</h2></div>
        <p className="text-[13px] leading-6 text-copy">Every suggestion comes from your own numbers: enquiries per course and channel, how far they got and who paid, website visits and enquiries per page (Google Analytics), and Google searches and positions (Search Console). It looks for the biggest gap between two steps and compares each page and course with your best one. Drafts are <strong>never sent or published from here</strong>; you copy and edit them. Fees, discounts and payment links stay with the team.</p>
      </section>

      {drawer ? <DrawerView drawer={drawer} page={page} onClose={() => setDrawer(null)} /> : null}
    </div>
  );
}

function StepsChart({ m }: { m: MeasuredFunnel }) {
  const top = Math.max(1, ...m.steps.map((s) => s.value ?? 0));
  return (
    <div className="flex flex-col gap-1">
      {m.steps.map((s, i) => (
        <div key={`${s.key}-${i}`} className={`grid grid-cols-[minmax(0,280px)_minmax(0,1fr)_170px] items-center gap-3 rounded-lg px-2 py-1.5 ${i === m.weakest ? "bg-red-50/70 dark:bg-red-950/20" : ""}`}>
          <span className="min-w-0"><span className="block text-[13.5px] font-bold text-copy-strong">{i + 1}. {s.label}</span><span className="block truncate text-[11.5px] text-copy-muted" title={s.note}>{s.note}</span></span>
          <span className="h-4 overflow-hidden rounded bg-surface-muted">{s.value != null ? <span className={`block h-full rounded ${i === m.weakest ? "bg-red-600" : s.unit === "people" ? "bg-brand-600" : "bg-brand-300"}`} style={{ width: `${Math.max((s.value / top) * 100, 0.8)}%` }} /> : null}</span>
          <span className="text-right text-[13px]">
            <strong className="tabular-nums text-copy-strong">{s.value == null ? "not measured yet" : `${n(s.value)} ${s.unit}`}</strong>
            {i && s.rate != null ? <span className={`block text-[11.5px] font-bold ${i === m.weakest ? "text-red-700 dark:text-red-300" : "text-copy-muted"}`}>{s.rate}% of step {i}</span> : null}
            {s.adds ? <span className="block text-[11.5px] text-copy-muted">includes people from other sources</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function FunnelDetail({ funnel, page, onEdit, onChange }: { funnel: SavedFunnel; page: FunnelAdvisorPage; onEdit: () => void; onChange: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const m = funnel.measured;
  const end = (id: string) => start(async () => { const r = await endFunnelChangeAction(id); if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error("Not ended", { description: r.message }); });
  const archive = () => start(async () => { const r = await saveFunnelAction({ ...funnel, status: "archived" }); if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error("Not archived", { description: r.message }); });
  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-extrabold text-copy-strong">{funnel.name}</h2>
          <p className="text-[12.5px] text-copy-muted">{page.data.courses.find((c) => c.id === funnel.courseId)?.name ?? "All courses"}{funnel.goal ? ` · goal: ${funnel.goal}` : ""}{funnel.kind === "seo" && funnel.terms.length ? ` · searches: ${funnel.terms.join(", ")}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={onEdit}>Edit funnel</button>
          <button type="button" className="btn-primary" onClick={onChange}>Try a change</button>
        </div>
      </div>
      <StepsChart m={m} />
      {m.weakest != null ? (
        <p className="rounded-lg border-l-[3px] border-red-600 bg-red-50/70 px-3 py-2.5 text-[12.5px] leading-5 text-copy dark:bg-red-950/20">
          <strong className="text-copy-strong">Weakest step: {m.steps[m.weakest].label}.</strong> {m.fix ?? ""}
        </p>
      ) : null}
      <p className="text-[11.5px] text-copy-subtle">People steps follow the same enquiries from the last {m.days} days. Google and page steps count views and visits in the same period, not people. {m.pages.length ? `Pages: ${m.pages.slice(0, 4).join(", ")}${m.pages.length > 4 ? ` and ${n(m.pages.length - 4)} more` : ""}.` : ""}</p>
      <div>
        <h3 className="text-[14px] font-bold text-copy-strong">Changes you’re trying</h3>
        <p className="text-[12px] text-copy-muted">Each change is compared with the same number of days before it started</p>
      </div>
      {funnel.changes.length ? funnel.changes.map((c) => {
        const i = funnel.steps.indexOf(c.step);
        const better = c.before != null && c.after != null ? c.after - c.before : null;
        return (
          <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-line py-2.5 text-[13px]">
            <span className="min-w-0">
              <span className="block font-bold text-copy-strong">{c.title}</span>
              <span className="block text-[12px] text-copy-muted">Step {i + 1}: {STEP_INFO[c.step]?.label ?? c.step} · since {shortDay(c.startedAt)}{c.endedAt ? ` · ended ${shortDay(c.endedAt)}` : ` · ${n(c.daysRunning)} days running`}</span>
              <span className="block text-[12.5px]">{c.before == null || c.after == null ? "Not enough data yet; check back in a week." : <>Before: <strong>{c.before}%</strong> · after: <strong>{c.after}%</strong> <span className={better! > 0 ? "font-bold text-emerald-700 dark:text-emerald-300" : better! < 0 ? "font-bold text-red-700 dark:text-red-300" : ""}>{better! > 0 ? "▲ better" : better! < 0 ? "▼ worse" : "no change"}</span>{c.daysRunning < 14 ? " · early" : ""}</>}</span>
            </span>
            {c.endedAt ? null : <button type="button" disabled={pending} className="btn-secondary" onClick={() => end(c.id)}>End</button>}
          </div>
        );
      }) : <p className="text-[13px] text-copy-muted">No changes yet. Press “Try a change” when you change a page, a reply or a post for this funnel.</p>}
      <div><button type="button" disabled={pending} onClick={archive} className="text-[12.5px] font-semibold text-copy-muted hover:text-red-700">Archive this funnel</button></div>
    </section>
  );
}

function DrawerView({ drawer, page, onClose }: { drawer: NonNullable<Drawer>; page: FunnelAdvisorPage; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside className="flex h-full w-[min(600px,96vw)] flex-col border-l border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()} aria-label="Details">
        {drawer.kind === "draft" ? <DraftView title={drawer.title} draft={drawer.draft} onClose={onClose} /> : null}
        {drawer.kind === "builder" ? <Builder initial={drawer.def} page={page} onClose={onClose} /> : null}
        {drawer.kind === "change" ? <ChangeForm funnel={drawer.funnel} onClose={onClose} /> : null}
      </aside>
    </div>
  );
}

function Head({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div><div className="text-[12px] font-bold text-copy-muted">{eyebrow}</div><h3 className="text-[17px] font-extrabold text-copy-strong">{title}</h3></div>
      <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
    </header>
  );
}

function DraftView({ title, draft, onClose }: { title: string; draft: Draft; onClose: () => void }) {
  const [text, setText] = useState(draft.text);
  return (
    <>
      <Head eyebrow={draft.kind} title={title} onClose={onClose} />
      <div className="flex flex-col gap-3 overflow-auto px-5 py-4">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="w-full rounded-xl border border-line bg-surface-muted p-3 text-[13px] leading-6 text-copy-strong" aria-label="Draft" />
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={() => { void navigator.clipboard?.writeText(text); toast.success("Copied."); }}>Copy</button>
        </div>
        <p className="text-[12px] text-copy-muted">Fill in the parts in {"{braces}"} before you use it. Nothing is sent or published from here.</p>
      </div>
    </>
  );
}

function Builder({ initial, page, onClose }: { initial: FunnelDef; page: FunnelAdvisorPage; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [def, setDef] = useState<FunnelDef>(initial);
  const [pageQuery, setPageQuery] = useState("");
  const [term, setTerm] = useState("");
  const set = (p: Partial<FunnelDef>) => setDef((d) => ({ ...d, ...p }));
  const preview = useMemo(() => measureFunnel(def, page.data), [def, page.data]);
  const courseName = page.data.courses.find((c) => c.id === def.courseId)?.name;
  const suggestedPages = courseName ? coursePages(courseName, page.data.pages.map((p) => p.path)) : [];
  const pageOptions = page.data.pages.filter((p) => !def.pages.includes(p.path) && (!pageQuery || p.path.toLowerCase().includes(pageQuery.toLowerCase()))).slice(0, 8);
  const termOptions = page.data.searchTerms.filter((q) => !def.terms.includes(q.query) && term && q.query.includes(term.toLowerCase())).slice(0, 6);
  const move = (i: number, d: -1 | 1) => { const s = [...def.steps]; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; set({ steps: s }); };
  const save = () => start(async () => {
    const r = await saveFunnelAction(def);
    if (r.ok) { toast.success(r.message); onClose(); router.refresh(); } else toast.error("Not saved", { description: r.message });
  });
  return (
    <>
      <Head eyebrow={def.id ? "Edit funnel" : "New funnel"} title={def.name || "Define a funnel"} onClose={onClose} />
      <div className="flex flex-col gap-4 overflow-auto px-5 py-4 text-[13px]">
        {!def.id ? (
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => <button key={p.key} type="button" onClick={() => setDef({ ...p.def, courseId: def.courseId })} className={`rounded-full border px-3 py-1 text-[12px] font-bold ${def.steps.join() === p.def.steps.join() ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line text-copy-muted"}`}>{p.title}</button>)}
          </div>
        ) : null}
        <label className="block"><b>Name</b><input className={`${input} mt-1`} value={def.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><b>Type</b>
            <select className={`${input} mt-1`} value={def.kind} onChange={(e) => set({ kind: e.target.value as FunnelDef["kind"] })}>
              <option value="general">Normal funnel</option><option value="seo">SEO funnel</option>
            </select>
          </label>
          <label className="block"><b>Course</b>
            <select className={`${input} mt-1`} value={def.courseId ?? ""} onChange={(e) => set({ courseId: e.target.value || null })}>
              <option value="">All courses</option>
              {[...page.data.courses].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <label className="block"><b>Goal</b> <span className="text-copy-muted">(optional)</span><input className={`${input} mt-1`} value={def.goal ?? ""} placeholder="e.g. 8 paid a month" onChange={(e) => set({ goal: e.target.value })} maxLength={160} /></label>

        <div>
          <b>Steps</b> <span className="text-copy-muted">in the order people take them</span>
          <div className="mt-1.5 flex flex-col gap-1">
            {def.steps.map((s, i) => {
              const p = preview.steps[i];
              return (
                <div key={`${s}-${i}`} className="grid grid-cols-[24px_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-line px-2 py-1.5">
                  <span className="grid size-6 place-items-center rounded-md bg-brand-50 text-[12px] font-extrabold text-brand-700">{i + 1}</span>
                  <span className="min-w-0"><span className="block font-bold text-copy-strong">{STEP_INFO[s].label}</span><span className="block truncate text-[11.5px] text-copy-muted">{p?.value == null ? p?.note : `${n(p.value)} ${p.unit}${p.rate != null && i ? ` · ${p.rate}% of step ${i}` : ""}`}</span></span>
                  <span className="flex gap-0.5"><button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="px-1 text-copy-muted hover:text-copy-strong">↑</button><button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="px-1 text-copy-muted hover:text-copy-strong">↓</button></span>
                  <button type="button" aria-label="Remove step" onClick={() => set({ steps: def.steps.filter((_, j) => j !== i) })} className="px-1 text-copy-muted hover:text-red-700">✕</button>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STEP_KEYS.filter((k) => def.steps.length < 12 && !def.steps.includes(k)).map((k) => (
              <button key={k} type="button" title={STEP_INFO[k].hint} onClick={() => set({ steps: [...def.steps, k] })} className="h-7 rounded-full border border-line px-2.5 text-[12px] font-bold text-copy-muted hover:text-copy-strong">+ {STEP_INFO[k].label}</button>
            ))}
          </div>
        </div>

        {def.kind === "seo" ? (
          <div>
            <b>Search terms</b> <span className="text-copy-muted">the Google searches this funnel is about</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {def.terms.map((t) => <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full bg-teal-50 px-2.5 text-[12px] font-bold text-teal-800 dark:bg-teal-950/30 dark:text-teal-300">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set({ terms: def.terms.filter((x) => x !== t) })}>✕</button></span>)}
            </div>
            <input className={`${input} mt-1.5`} placeholder="Type a search term, e.g. prenatal yoga course" value={term} onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && term.trim()) { e.preventDefault(); set({ terms: [...new Set([...def.terms, term.trim().toLowerCase()])].slice(0, 40) }); setTerm(""); } }} />
            {termOptions.length ? <div className="mt-1 flex flex-col">{termOptions.map((q) => <button key={q.query} type="button" onClick={() => { set({ terms: [...def.terms, q.query].slice(0, 40) }); setTerm(""); }} className="flex justify-between rounded px-2 py-1 text-left hover:bg-surface-muted"><span>{q.query}</span><span className="text-copy-muted">{n(q.views)} views · #{q.position}</span></button>)}</div> : null}
          </div>
        ) : null}

        <div>
          <b>Pages</b> <span className="text-copy-muted">{def.pages.length ? "the pages this funnel sends people to" : courseName ? `using the ${courseName} pages (${n(suggestedPages.length)}) unless you pick some` : "pick the pages this funnel sends people to"}</span>
          <div className="mt-1.5 flex flex-col gap-1">
            {def.pages.map((p) => <span key={p} className="flex items-center justify-between rounded-lg bg-surface-muted px-2.5 py-1 text-[12px]"><span className="truncate">{p}</span><button type="button" aria-label={`Remove ${p}`} onClick={() => set({ pages: def.pages.filter((x) => x !== p) })}>✕</button></span>)}
          </div>
          <input className={`${input} mt-1.5`} placeholder="Search your website pages" value={pageQuery} onChange={(e) => setPageQuery(e.target.value)} />
          <div className="mt-1 flex flex-col">
            {(pageQuery ? pageOptions : suggestedPages.filter((p) => !def.pages.includes(p)).slice(0, 6).map((path) => ({ path, visits: page.data.pages.find((x) => x.path === path)?.visits ?? 0 }))).map((p) => (
              <button key={p.path} type="button" onClick={() => set({ pages: [...def.pages, p.path].slice(0, 40) })} className="flex justify-between gap-2 rounded px-2 py-1 text-left hover:bg-surface-muted"><span className="truncate">+ {p.path}</span><span className="shrink-0 text-copy-muted">{n(p.visits)} visits</span></button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-brand-50/70 px-3 py-2.5 text-[12.5px] leading-5 dark:bg-brand-950/30">
          {preview.weakest != null ? <><strong>Weakest step today: {preview.steps[preview.weakest].label}.</strong> {preview.fix}</> : "Add steps to see today’s numbers for each one."}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={pending} onClick={save} className="btn-primary">{pending ? "Saving…" : "Save funnel"}</button>
          {def.id ? <button type="button" disabled={pending} onClick={() => setDef({ ...def, status: def.status === "draft" ? "live" : "draft" })} className="btn-secondary">{def.status === "draft" ? "Mark live" : "Mark as draft"}</button> : null}
        </div>
      </div>
    </>
  );
}

function ChangeForm({ funnel, onClose }: { funnel: SavedFunnel; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<StepKey>(funnel.measured.weakest != null ? funnel.steps[funnel.measured.weakest] : funnel.steps[1] ?? funnel.steps[0]);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const save = () => start(async () => {
    const r = await addFunnelChangeAction(funnel.id, step, title, details);
    if (r.ok) { toast.success(r.message); onClose(); router.refresh(); } else toast.error("Not saved", { description: r.message });
  });
  return (
    <>
      <Head eyebrow="Try a change" title={funnel.name} onClose={onClose} />
      <div className="flex flex-col gap-3 overflow-auto px-5 py-4 text-[13px]">
        <p className="text-copy-muted">Record a change you’re making (a new page layout, a different first reply, a new Google title). From today the advisor compares that step with the same number of days before.</p>
        <label className="block"><b>Which step should it improve?</b>
          <select className={`${input} mt-1`} value={step} onChange={(e) => setStep(e.target.value as StepKey)}>
            {funnel.steps.map((s, i) => <option key={`${s}-${i}`} value={s}>{i + 1}. {STEP_INFO[s].label}</option>)}
          </select>
        </label>
        <label className="block"><b>What are you changing?</b><input className={`${input} mt-1`} value={title} maxLength={160} placeholder="e.g. Form and dates moved to the top of the page" onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block"><b>Details</b> <span className="text-copy-muted">(optional)</span><textarea className="mt-1 w-full rounded-lg border border-line bg-surface p-2.5 text-[13px]" rows={4} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
        <div><button type="button" disabled={pending || !title.trim()} onClick={save} className="btn-primary">{pending ? "Saving…" : "Start comparing"}</button></div>
      </div>
    </>
  );
}
