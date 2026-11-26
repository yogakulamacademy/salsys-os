"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { siteCheckStepAction } from "@/app/seo/site-check-actions";

import { KpiRow, PageHead, RankCards, SignalList, card } from "@/components/marketing/smart-blocks";
import type { HealthStory, IdeasStory, SearchesStory } from "@/lib/marketing-search-detail";

// Google search › "Searches and pages", "Content ideas" and "Site health and AI
// answers" (owner-approved prototype "Google search inner pages", 26 Nov 2026).

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const per100 = (c: number, v: number) => (v ? (Math.round((c / v) * 1000) / 10).toLocaleString("en-IN") : "0");
const th = "pb-1.5 text-right text-[11.5px] font-semibold text-copy-muted";
const thL = "pb-1.5 pl-1 text-left text-[11.5px] font-semibold text-copy-muted";
const td = "border-t border-line py-2 text-right tabular-nums";
const tdL = "border-t border-line py-2 pl-1 text-left";
const posTone = (p: number) => (p <= 10 ? "text-emerald-700 dark:text-emerald-300" : p <= 20 ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300");
const Foot = ({ href, label }: { href: string; label: string }) => (
  <p className="text-[12.5px] text-copy-muted">Need the raw numbers? <Link href={href} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{label} →</Link></p>
);

export function SmartSearchesPage({ story }: { story: SearchesStory }) {
  const [pick, setPick] = useState(story.topics[0]?.key ?? "");
  const [sort, setSort] = useState<{ k: "views" | "clicks" | "position"; d: 1 | -1 }>({ k: "views", d: -1 });
  const topic = story.topics.find((t) => t.key === pick) ?? story.topics[0];
  const topics = useMemo(() => [...story.topics].sort((a, b) => (a[sort.k] - b[sort.k]) * sort.d), [story.topics, sort]);
  const sortBtn = (k: typeof sort.k, label: string) => (
    <button type="button" className="hover:text-copy-strong" onClick={() => setSort((s) => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : k === "position" ? 1 : -1 }))}>{label}{sort.k === k ? (sort.d === 1 ? " ↑" : " ↓") : ""}</button>
  );
  return (
    <div className="flex flex-col gap-3.5" aria-label="Searches and pages">
      <PageHead eyebrow="Marketing · Google search" title="Searches and pages" headline={story.headline} />
      <RankCards ranks={story.ranks} />
      <KpiRow kpis={story.kpis} />
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section id="topics" className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">What people search for</h2><p className="text-[12.5px] text-copy-muted">Searches grouped by topic, not counting your name · pick one to see its searches</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr><th className={thL}>Topic</th><th className={th}>{sortBtn("views", "Views")}</th><th className={th}>{sortBtn("clicks", "Clicks")}</th><th className={th}>{sortBtn("position", "Position")}</th><th className={th}>Home page shown</th><th className={`${thL} pl-4`}>Page Google shows most</th></tr></thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.key} onClick={() => setPick(t.key)} className={`cursor-pointer hover:bg-surface-muted ${t.key === topic?.key ? "bg-brand-50/70 dark:bg-brand-950/30" : ""}`}>
                    <td className={`${tdL} font-semibold text-copy-strong`}>{t.label}</td>
                    <td className={td}>{n(t.views)}</td>
                    <td className={td}>{n(t.clicks)}</td>
                    <td className={`${td} font-bold ${posTone(t.position)}`}>{Math.round(t.position)}</td>
                    <td className={`${td} ${t.homeShare >= 50 ? "font-bold text-amber-700 dark:text-amber-300" : ""}`}>{t.homeShare}%</td>
                    <td className={`${tdL} pl-4 text-copy-muted`}>{t.topPageLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {topic ? (
          <section className={card}>
            <div><h2 className="text-[16px] font-extrabold text-copy-strong">{topic.label}</h2><p className="text-[12.5px] text-copy-muted">{n(topic.views)} views · {n(topic.clicks)} clicks ({per100(topic.clicks, topic.views)} in 100) · top searches</p></div>
            <table className="w-full text-[13px]">
              <thead><tr><th className={thL}>Search</th><th className={th}>Views</th><th className={th}>Clicks</th><th className={th}>Pos.</th></tr></thead>
              <tbody>
                {topic.searches.map((s) => (
                  <tr key={s.query}>
                    <td className={tdL}><span className="text-copy-strong">{s.query}</span><span className="block text-[11.5px] text-copy-subtle">{s.page === "/" ? "Home page" : s.page}</span></td>
                    <td className={td}>{n(s.views)}</td><td className={td}>{n(s.clicks)}</td><td className={`${td} font-bold ${posTone(s.position)}`}>{s.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section id="near" className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Searches you almost win</h2><p className="text-[12.5px] text-copy-muted">On page one (position 3–12) but fewer than 3 in 100 people click · a better title usually fixes it</p></div>
          {story.near.length ? (
            <table className="w-full text-[13px]">
              <thead><tr><th className={thL}>Search</th><th className={th}>Views</th><th className={th}>Clicks</th><th className={th}>Pos.</th><th className={`${thL} pl-4`}>Page Google shows</th></tr></thead>
              <tbody>
                {story.near.map((r) => (
                  <tr key={r.query}>
                    <td className={`${tdL} text-copy-strong`}>{r.query}</td>
                    <td className={td}>{n(r.views)}</td><td className={td}>{n(r.clicks)}</td><td className={`${td} font-bold`}>{r.position}</td>
                    <td className={`${tdL} pl-4`}>{r.pageLabel}{r.wrongPage ? <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">wrong page</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-[13px] text-copy-muted">None right now.</p>}
        </section>
        <section className={card}>
          <h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2>
          <SignalList signals={story.signals} />
        </section>
      </div>
      <Foot href="/seo/search-performance?classic=1" label="Open the full search explorer" />
    </div>
  );
}

export function SmartIdeasPage({ story }: { story: IdeasStory }) {
  return (
    <div className="flex flex-col gap-3.5" aria-label="Content ideas">
      <PageHead eyebrow="Marketing · Google search" title="Content ideas" headline={story.headline} />
      {story.ideas.length ? (
        <div className="grid gap-3.5 xl:grid-cols-2">
          {story.ideas.map((i, k) => (
            <article key={i.key} className={card}>
              <div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-lg bg-brand-50 text-[12.5px] font-extrabold text-brand-700">{k + 1}</span><span className="text-[12px] font-semibold text-copy-muted">{i.meta}</span></div>
              <h3 className="text-[17px] font-extrabold leading-snug text-copy-strong">{i.title}</h3>
              <p className="text-[13px] leading-5 text-copy">{i.why}</p>
              <pre className="whitespace-pre-wrap rounded-lg border-l-[3px] border-brand-600 bg-surface-muted px-3 py-2.5 font-sans text-[12.5px] leading-5 text-copy">{i.outline}</pre>
              <div>
                <div className="text-[11.5px] font-semibold text-copy-muted">Searches it would target</div>
                <div className="mt-1 flex flex-wrap gap-1.5">{i.searches.map((s) => <span key={s} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-copy">{s}</span>)}</div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <p className="text-[12px] text-copy-subtle">Ideas come from the last 30 days of Google searches. Outlines are a starting point: check facts and fees before publishing.</p>
      <Foot href="/seo/content-opportunities?classic=1" label="Open the detailed page list" />
    </div>
  );
}

function SiteCheckButton({ host }: { host: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; text: string | null; bad?: boolean }>({ busy: false, text: null });
  const run = async () => {
    setState({ busy: true, text: "Starting the check…" });
    let step = await siteCheckStepAction({ host });
    for (let i = 0; step.ok && !step.done && step.runId && i < 120; i += 1) {
      setState({ busy: true, text: `Checking pages: ${step.fetched ?? 0} of ${step.discovered ?? 0} found so far…` });
      step = await siteCheckStepAction({ runId: step.runId });
    }
    if (!step.ok) return setState({ busy: false, text: step.message, bad: true });
    setState({ busy: false, text: step.done ? `Done: ${step.fetched} pages checked${step.failed ? `, ${step.failed} couldn’t be opened` : ""}.` : "Paused. Click again to continue." });
    router.refresh();
  };
  return (
    <div className="flex items-center gap-3">
      {state.text ? <span className={`text-[12.5px] ${state.bad ? "text-red-700 dark:text-red-300" : "text-copy-muted"}`} aria-live="polite">{state.text}</span> : null}
      <button type="button" className="btn-primary" disabled={state.busy} onClick={run}>{state.busy ? "Checking…" : "Check all pages now"}</button>
    </div>
  );
}

export function SmartHealthPage({ story }: { story: HealthStory }) {
  const [all, setAll] = useState(false);
  const fixes = all ? story.fixes : story.fixes.slice(0, 12);
  const last = story.ai[0];
  return (
    <div className="flex flex-col gap-3.5" aria-label="Site health and AI answers">
      <PageHead eyebrow="Marketing · Google search" title="Site health and AI answers" headline={story.headline} right={story.checkHost ? <SiteCheckButton host={story.checkHost} /> : undefined} />
      <RankCards ranks={story.ranks} />
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section id="fixes" className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Pages to fix</h2><p className="text-[12.5px] text-copy-muted">{story.crawl.at ? `From the check on ${new Date(story.crawl.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${n(story.crawl.fetched)} of ${n(story.crawl.known)} pages looked at` : "No site check yet"}</p></div>
          {story.fixes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr><th className={thL}>Page</th><th className={thL}>Problem</th><th className={thL}>Now</th><th className={thL}>Fix</th></tr></thead>
                <tbody>
                  {fixes.map((f, i) => (
                    <tr key={`${f.path}-${f.problem}-${i}`}>
                      <td className={tdL}><span className="font-semibold text-copy-strong">{f.label}</span><span className="block text-[11.5px] text-copy-subtle">{f.path}</span></td>
                      <td className={tdL}><span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${f.severity === "high" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>{f.problem}</span></td>
                      <td className={`${tdL} tabular-nums text-copy-muted`}>{f.now}</td>
                      <td className={`${tdL} text-copy`}>{f.fix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {story.fixes.length > 12 ? <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[12.5px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{all ? "Show fewer" : `Show all ${story.fixes.length}`}</button> : null}
            </div>
          ) : <p className="text-[13px] text-copy-muted">No problems found on the pages checked.</p>}
        </section>
        <div className="flex flex-col gap-3.5">
          <section id="ai" className={card}>
            <div><h2 className="text-[16px] font-extrabold text-copy-strong">AI answers</h2><p className="text-[12.5px] text-copy-muted">{n(story.aiVisits)} visits from ChatGPT and other assistants in 30 days · {n(story.aiEnquiries)} {story.aiEnquiries === 1 ? "enquiry" : "enquiries"}</p></div>
            {last ? (
              <div className="flex flex-col gap-2 text-[13px]">
                <p className="text-copy-muted">Last question asked ({new Date(last.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}):</p>
                <p className="rounded-lg bg-surface-muted px-3 py-2 italic text-copy-strong">“{last.question}”</p>
                <p><span className={`font-bold ${last.mentioned ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{last.mentioned ? "You were mentioned" : "You weren’t mentioned"}</span>{last.others.length ? <span className="text-copy-muted">. Named instead: {last.others.join(", ")}.</span> : null}</p>
                {story.ai.length > 1 ? <p className="text-[12px] text-copy-subtle">{n(story.ai.length)} checks so far.</p> : null}
              </div>
            ) : <p className="text-[13px] text-copy-muted">AI answers haven’t been checked yet.</p>}
          </section>
          <section className={card}>
            <h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2>
            <SignalList signals={story.signals} />
          </section>
        </div>
      </div>
      <p className="text-[12.5px] text-copy-muted">Need the raw numbers? <Link href="/seo/technical?classic=1" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">Technical checks →</Link> · <Link href="/seo/ai-answer-visibility" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">AI answer checks →</Link></p>
    </div>
  );
}
