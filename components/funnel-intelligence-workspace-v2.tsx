"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { MarketingInspector } from "@/components/marketing/marketing-inspector";
import type {
  FunnelDailyEvidence,
  FunnelIntelligenceWorkspace,
  FunnelJourney,
  FunnelSourceEvidence,
  FunnelStage,
} from "@/lib/funnel-intelligence-data";

type TrendMetric = "sessions" | "leads" | "qualified" | "enrolled";
type InspectorState =
  | { kind: "stage"; stage: FunnelStage; previous: FunnelStage | null; journey: FunnelJourney }
  | { kind: "source"; source: FunnelSourceEvidence; totalLeads: number }
  | { kind: "day"; row: FunnelDailyEvidence }
  | null;

export function FunnelIntelligenceWorkspaceV2({ workspace }: { workspace: FunnelIntelligenceWorkspace }) {
  if (!workspace.status.available || !workspace.overview) {
    return <UnavailableState message={workspace.status.message} />;
  }

  return <AvailableWorkspace workspace={workspace} />;
}

function AvailableWorkspace({ workspace }: { workspace: FunnelIntelligenceWorkspace }) {
  const overview = workspace.overview!;
  const [journeyKey, setJourneyKey] = useState(workspace.journeys[0]?.key ?? "business");
  const [selectedSource, setSelectedSource] = useState(workspace.sources[0]?.source ?? "");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("leads");
  const [inspector, setInspector] = useState<InspectorState>(null);

  const journey = workspace.journeys.find((item) => item.key === journeyKey) ?? workspace.journeys[0];
  const source = workspace.sources.find((item) => item.source === selectedSource) ?? workspace.sources[0];
  const topSources = useMemo(() => [...workspace.sources].sort((a, b) => {
    if (b.enrolled !== a.enrolled) return b.enrolled - a.enrolled;
    if (b.qualified !== a.qualified) return b.qualified - a.qualified;
    return b.leads - a.leads;
  }), [workspace.sources]);
  const coverage = normalizeCoverage(workspace.measurement?.first_touch_coverage ?? null);
  const largestDrop = useMemo(() => findLargestComparableDrop(journey), [journey]);

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="CRM leads" value={overview.leads} note={`${workspace.status.window_days}-day cohort`} icon={<UsersRound size={16} />} />
        <Kpi label="Qualified" value={overview.qualified} note={rateLabel(overview.qualified, overview.leads, "of leads")} icon={<Target size={16} />} />
        <Kpi label="Paid" value={overview.paid} note={rateLabel(overview.paid, overview.leads, "of leads")} icon={<CircleDollarSign size={16} />} />
        <Kpi label="Enrolled" value={overview.enrolled} note={rateLabel(overview.enrolled, overview.leads, "of leads")} icon={<CheckCircle2 size={16} />} />
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-2xl border border-[#dfe6df] bg-white p-4 shadow-[0_10px_28px_rgba(16,45,39,.05)] sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.16em] text-[#8a978a]">Priority investigation</div>
              <h2 className="mt-1 text-base font-semibold tracking-[-.02em] text-[#102d27]">
                {largestDrop ? `${largestDrop.from.label} → ${largestDrop.to.label}` : "No dominant comparable drop"}
              </h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#758279]">
                {largestDrop
                  ? `${largestDrop.lost.toLocaleString("en-IN")} ${largestDrop.from.unit} did not continue into the next comparable stage. This is an observed gap, not a diagnosed cause.`
                  : "No adjacent stage with the same counting unit stands out enough to diagnose first. Use source quality and evidence coverage instead."}
              </p>
            </div>
            {largestDrop ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black text-amber-700">{largestDrop.rate.toFixed(1)}% continue</span> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/attribution" className="btn-primary">Inspect attribution <ArrowRight size={13} /></Link>
            <Link href="/tracking/data-coverage" className="btn-secondary">Check evidence coverage</Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[#dfe6df] bg-[#f7faf6] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.14em] text-[#628574]"><ShieldCheck size={13} /> Measurement confidence</div>
          <div className="mt-2 text-2xl font-semibold tracking-[-.04em] text-[#102d27]">{coverage == null ? "Unknown" : `${coverage.toFixed(0)}%`}</div>
          <p className="mt-1 text-[10px] leading-5 text-[#758279]">
            {coverage == null
              ? "No reliable first-touch denominator is available for this cohort."
              : `${workspace.measurement?.known_first_touch.toLocaleString("en-IN") ?? 0} of ${workspace.measurement?.total_leads.toLocaleString("en-IN") ?? 0} leads have known first-touch evidence.`}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#dfe6df] bg-white shadow-[0_10px_28px_rgba(16,45,39,.045)]">
        <div className="border-b border-[#e7ece7] p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.16em] text-[#8a978a]">Conversion path</div>
              <h2 className="mt-1 text-base font-semibold tracking-[-.02em] text-[#102d27]">Choose a journey and inspect any stage</h2>
            </div>
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[#f1f5f0] p-1">
              {workspace.journeys.map((item) => (
                <button key={item.key} type="button" onClick={() => setJourneyKey(item.key)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${item.key === journey?.key ? "bg-white text-[#102d27] shadow-sm" : "text-[#758279] hover:text-[#102d27]"}`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {journey ? <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#758279]">{journey.description}</p> : null}
        </div>

        {journey ? (
          <div className="p-4 sm:p-5">
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-[780px] items-stretch gap-2">
                {journey.stages.map((stage, index) => {
                  const previous = index > 0 ? journey.stages[index - 1] : null;
                  const comparable = Boolean(previous && previous.unit === stage.unit && previous.count > 0);
                  const rate = comparable && previous ? (stage.count / previous.count) * 100 : null;
                  return (
                    <div key={`${journey.key}-${stage.key}`} className="flex min-w-0 flex-1 items-center gap-2">
                      <button type="button" onClick={() => setInspector({ kind: "stage", stage, previous, journey })} className="group min-w-[108px] flex-1 rounded-xl border border-[#e1e7e1] bg-[#fafcf9] px-3 py-4 text-left transition hover:-translate-y-0.5 hover:border-[#cbd9cd] hover:bg-white hover:shadow-[0_8px_22px_rgba(16,45,39,.07)]">
                        <span className="block text-[8px] font-black uppercase tracking-[.12em] text-[#95a095]">Step {index + 1}</span>
                        <span className="mt-1 block text-[11px] font-semibold text-[#40594f]">{stage.label}</span>
                        <span className="mt-2 block text-xl font-semibold tracking-[-.04em] text-[#102d27]">{stage.count.toLocaleString("en-IN")}</span>
                        <span className="mt-1 block text-[9px] text-[#8a978a]">{rate == null ? (index === 0 ? "Journey entry" : stage.unit !== previous?.unit ? `Now counting ${stage.unit}` : "No denominator") : `${rate.toFixed(1)}% from previous`}</span>
                      </button>
                      {index < journey.stages.length - 1 ? <ArrowRight size={13} className="shrink-0 text-[#c4cec5]" /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
        <div className="rounded-2xl border border-[#dfe6df] bg-white p-4 shadow-[0_10px_28px_rgba(16,45,39,.045)] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.16em] text-[#8a978a]">Source performance</div>
              <h2 className="mt-1 text-sm font-semibold text-[#102d27]">Where downstream outcomes actually came from</h2>
              <p className="mt-1 text-[10px] text-[#758279]">Select a source, then open its full evidence inspector.</p>
            </div>
            <Link href="/attribution" className="text-[10px] font-semibold text-[#2d6754] hover:underline">Compare models →</Link>
          </div>

          <div className="mt-4 space-y-1">
            {topSources.slice(0, 12).map((item) => {
              const selected = source?.source === item.source;
              const share = overview.leads > 0 ? (item.leads / overview.leads) * 100 : 0;
              return (
                <button key={item.source} type="button" onClick={() => setSelectedSource(item.source)} className={`grid w-full grid-cols-[minmax(120px,220px)_1fr_88px_80px] items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${selected ? "bg-[#f1f7f2]" : "hover:bg-[#f8faf7]"}`}>
                  <span className="truncate text-[11px] font-semibold text-[#203b32]">{item.source || "Unknown"}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-[#edf1ec]"><span className="block h-full rounded-full bg-[#6c9a80]" style={{ width: `${Math.max(2, Math.min(100, share))}%` }} /></span>
                  <span className="text-right text-[10px] font-semibold text-[#40594f]">{item.qualified} qual.</span>
                  <span className="text-right text-[10px] font-semibold text-[#102d27]">{item.enrolled} enr.</span>
                </button>
              );
            })}
          </div>

          {source ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[#e7ece7] pt-4">
              <button type="button" onClick={() => setInspector({ kind: "source", source, totalLeads: overview.leads })} className="btn-primary">Inspect {source.source} <ArrowRight size={13} /></button>
              <Link href={`/attribution?q=${encodeURIComponent(source.source)}`} className="btn-secondary">Compare attribution</Link>
              <Link href="/paid-media-leads" className="btn-secondary">Open generated leads</Link>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[#dfe6df] bg-white p-4 shadow-[0_10px_28px_rgba(16,45,39,.045)] sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.16em] text-[#8a978a]">Evidence health</div>
              <div className="mt-1 text-sm font-semibold text-[#102d27]">Can we trust this diagnosis?</div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${coverage != null && coverage >= 80 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{coverage == null ? "Unknown" : coverage >= 80 ? "Strong" : "Partial"}</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Evidence label="Known first touch" value={workspace.measurement?.known_first_touch ?? 0} />
            <Evidence label="Unknown first touch" value={workspace.measurement?.unknown_first_touch ?? 0} />
            <Evidence label="Web-linked leads" value={workspace.measurement?.web_linked_leads ?? 0} />
            <Evidence label="Form-submit sessions" value={workspace.measurement?.form_submit_sessions ?? 0} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/tracking/data-coverage" className="btn-secondary">Data coverage</Link>
            <Link href="/tracking/conversion-health" className="btn-secondary">Conversion health</Link>
          </div>
        </div>
      </section>

      <TrendPanel daily={workspace.daily} metric={trendMetric} onMetric={setTrendMetric} onInspect={(row) => setInspector({ kind: "day", row })} />

      <div className="rounded-xl border border-[#e2e8e1] bg-[#f8faf7] px-4 py-3 text-[10px] leading-5 text-[#758279]">
        Sessions, leads and payments use different counting units. SalsysOS calculates conversion only where adjacent stages are comparable, keeps INR and USD separate, and does not infer missing evidence.
      </div>

      {inspector ? <FunnelInspector state={inspector} onClose={() => setInspector(null)} /> : null}
    </div>
  );
}

function FunnelInspector({ state, onClose }: { state: Exclude<InspectorState, null>; onClose: () => void }) {
  if (state.kind === "source") {
    const item = state.source;
    const qualRate = item.leads > 0 ? (item.qualified / item.leads) * 100 : null;
    const enrollRate = item.leads > 0 ? (item.enrolled / item.leads) * 100 : null;
    const share = state.totalLeads > 0 ? (item.leads / state.totalLeads) * 100 : null;
    const revenue = formatRevenue(item.revenue_inr, item.revenue_usd);
    const statusTone = item.enrolled > 0 ? "positive" as const : item.leads > 0 && item.qualified === 0 ? "watch" as const : "neutral" as const;
    return (
      <MarketingInspector
        open
        onClose={onClose}
        eyebrow="Funnel source inspector"
        title={item.source || "Unknown source"}
        subtitle="Observed CRM outcomes from this first-touch source in the current funnel cohort."
        statusLabel={item.enrolled > 0 ? "Converting" : item.leads > 0 ? "Needs follow-through" : "Low evidence"}
        statusTone={statusTone}
        whatHappened={`${item.leads.toLocaleString("en-IN")} leads are attributed to this source, with ${item.qualified.toLocaleString("en-IN")} qualified and ${item.enrolled.toLocaleString("en-IN")} enrolled.`}
        whyItMatters={item.enrolled > 0
          ? "This source has downstream enrollment evidence, so it deserves more weight than traffic-only performance. Compare attribution models before changing budget because first-touch credit is only one view of the journey."
          : item.qualified > 0
            ? "The source is producing qualified demand but enrollment evidence has not caught up yet. The next question is whether follow-up, payment or timing is limiting progression."
            : "The source has lead volume without qualified outcomes in the current cohort. Review lead quality and attribution coverage before scaling or cutting spend."}
        metrics={[
          { label: "Leads", value: item.leads.toLocaleString("en-IN"), note: share == null ? "Share unavailable" : `${share.toFixed(1)}% of cohort leads` },
          { label: "Qualified", value: item.qualified.toLocaleString("en-IN"), note: qualRate == null ? "No lead denominator" : `${qualRate.toFixed(1)}% of source leads` },
          { label: "Enrolled", value: item.enrolled.toLocaleString("en-IN"), note: enrollRate == null ? "No lead denominator" : `${enrollRate.toFixed(1)}% of source leads` },
          { label: "Paid", value: item.paid.toLocaleString("en-IN") },
          { label: "CRM revenue", value: revenue, note: "Currencies kept separate" },
        ]}
        evidence={[
          { label: "Lead → qualified", value: qualRate == null ? "—" : `${qualRate.toFixed(1)}%`, detail: "Observed CRM stage progression.", tone: qualRate != null && qualRate > 0 ? "positive" : "watch" },
          { label: "Lead → enrolled", value: enrollRate == null ? "—" : `${enrollRate.toFixed(1)}%`, detail: "Observed enrollment progression.", tone: enrollRate != null && enrollRate > 0 ? "positive" : "watch" },
          { label: "Revenue evidence", value: revenue, detail: "INR and USD are not combined.", tone: item.revenue_inr > 0 || item.revenue_usd > 0 ? "positive" : "neutral" },
        ]}
        recommendedAction={item.enrolled > 0
          ? "Compare this source across attribution models and inspect the actual generated leads before considering a scale decision."
          : item.qualified > 0
            ? "Open generated leads and payment/re-engagement views to see where qualified demand is stalling."
            : "Inspect lead quality and measurement coverage before changing campaign or channel investment."}
        related={[
          { label: "Attribution evidence", href: `/attribution?q=${encodeURIComponent(item.source)}`, detail: "Compare first touch, creation, last marketing touch and current channel." },
          { label: "Generated leads", href: "/paid-media-leads", detail: "Inspect downstream CRM records." },
          { label: "Revenue", href: "/revenue", detail: "Review collected and pipeline value." },
        ]}
        actions={[
          { label: "Open attribution", href: `/attribution?q=${encodeURIComponent(item.source)}`, primary: true },
          { label: "Open leads", href: "/paid-media-leads" },
          { label: "Open revenue", href: "/revenue" },
        ]}
      />
    );
  }

  if (state.kind === "stage") {
    const { stage, previous, journey } = state;
    const comparable = Boolean(previous && previous.unit === stage.unit && previous.count > 0);
    const rate = comparable && previous ? (stage.count / previous.count) * 100 : null;
    const lost = comparable && previous ? Math.max(0, previous.count - stage.count) : null;
    const href = stageHref(stage, journey.key);
    return (
      <MarketingInspector
        open
        onClose={onClose}
        eyebrow="Funnel stage inspector"
        title={stage.label}
        subtitle={`${journey.label} · counting ${stage.unit}`}
        statusLabel={rate == null ? "Evidence boundary" : rate < 35 ? "High drop-off" : "Comparable"}
        statusTone={rate == null ? "neutral" : rate < 35 ? "risk" : "positive"}
        whatHappened={previous
          ? comparable
            ? `${stage.count.toLocaleString("en-IN")} of ${previous.count.toLocaleString("en-IN")} ${previous.unit} continued from ${previous.label} to ${stage.label}.`
            : `The journey changes counting units from ${previous.unit} to ${stage.unit} at this step, so SalsysOS is withholding a synthetic conversion rate.`
          : `${stage.count.toLocaleString("en-IN")} ${stage.unit} enter the selected journey at ${stage.label}.`}
        whyItMatters={rate == null
          ? "A unit boundary is a measurement boundary, not automatically a conversion problem. Diagnose with source, identity and event evidence instead of comparing unlike denominators."
          : rate < 35
            ? "This is a large observed drop between comparable stages. Investigate source quality, form or payment friction, follow-up and measurement gaps before assigning a cause."
            : "This transition has usable denominator evidence. Compare it with source quality and daily movement to decide whether it warrants action."}
        metrics={[
          { label: "Stage count", value: stage.count.toLocaleString("en-IN"), note: stage.unit },
          { label: "From previous", value: rate == null ? "Not comparable" : `${rate.toFixed(1)}%` },
          { label: "Observed loss", value: lost == null ? "—" : lost.toLocaleString("en-IN") },
        ]}
        evidence={[
          { label: "Counting unit", value: stage.unit, detail: previous ? `Previous stage counts ${previous.unit}.` : "Journey entry stage.", tone: comparable || !previous ? "positive" : "watch" },
          { label: "Comparable denominator", value: comparable ? "Yes" : "No", detail: comparable ? "Adjacent stages use the same counting unit." : "SalsysOS will not calculate conversion across unlike units.", tone: comparable ? "positive" : "neutral" },
        ]}
        recommendedAction={href
          ? "Open the matching CRM records, then compare source and attribution evidence before changing acquisition or follow-up strategy."
          : "Use the source and measurement panels in Funnel to diagnose this stage with supporting evidence."}
        related={[
          ...(href ? [{ label: "Matching CRM records", href, detail: `Open records corresponding to ${stage.label}.` }] : []),
          { label: "Attribution", href: "/attribution", detail: "Compare acquisition credit before diagnosing a source problem." },
          { label: "Conversion health", href: "/tracking/conversion-health", detail: "Check event-to-CRM reconciliation." },
        ]}
        actions={[
          ...(href ? [{ label: "Open matching records", href, primary: true }] : []),
          { label: "Inspect attribution", href: "/attribution" },
        ]}
      />
    );
  }

  const row = state.row;
  const leadRate = row.sessions > 0 ? (row.leads / row.sessions) * 100 : null;
  const qualRate = row.leads > 0 ? (row.qualified / row.leads) * 100 : null;
  const enrollRate = row.leads > 0 ? (row.enrolled / row.leads) * 100 : null;
  return (
    <MarketingInspector
      open
      onClose={onClose}
      eyebrow="Daily funnel evidence"
      title={formatDate(row.date)}
      subtitle="Observed daily movement in the current reporting window."
      statusLabel="Daily evidence"
      statusTone="neutral"
      whatHappened={`${row.sessions.toLocaleString("en-IN")} sessions produced ${row.leads.toLocaleString("en-IN")} leads, ${row.qualified.toLocaleString("en-IN")} qualified leads and ${row.enrolled.toLocaleString("en-IN")} enrollments.`}
      whyItMatters="One day can be noisy. Use this record to investigate spikes or drops, but compare surrounding days and attribution evidence before treating it as a trend."
      metrics={[
        { label: "Sessions", value: row.sessions.toLocaleString("en-IN") },
        { label: "Leads", value: row.leads.toLocaleString("en-IN"), note: leadRate == null ? "No session denominator" : `${leadRate.toFixed(1)}% of sessions` },
        { label: "Qualified", value: row.qualified.toLocaleString("en-IN"), note: qualRate == null ? "No lead denominator" : `${qualRate.toFixed(1)}% of leads` },
        { label: "Enrolled", value: row.enrolled.toLocaleString("en-IN"), note: enrollRate == null ? "No lead denominator" : `${enrollRate.toFixed(1)}% of leads` },
      ]}
      evidence={[
        { label: "Session → lead", value: leadRate == null ? "—" : `${leadRate.toFixed(1)}%`, tone: "neutral" },
        { label: "Lead → qualified", value: qualRate == null ? "—" : `${qualRate.toFixed(1)}%`, tone: qualRate != null && qualRate > 0 ? "positive" : "watch" },
        { label: "Lead → enrolled", value: enrollRate == null ? "—" : `${enrollRate.toFixed(1)}%`, tone: enrollRate != null && enrollRate > 0 ? "positive" : "watch" },
      ]}
      recommendedAction="Compare the surrounding days and source mix. If the movement is isolated, investigate the specific campaigns, sources or operational events active that day before changing strategy."
      related={[
        { label: "Attribution", href: "/attribution", detail: "See which sources received credit in the cohort." },
        { label: "Analytics", href: "/analytics", detail: "Compare traffic and engagement context." },
        { label: "Tracking health", href: "/tracking", detail: "Check whether event evidence was healthy." },
      ]}
      actions={[
        { label: "Open attribution", href: "/attribution", primary: true },
        { label: "Open analytics", href: "/analytics" },
      ]}
    />
  );
}

function TrendPanel({ daily, metric, onMetric, onInspect }: { daily: FunnelDailyEvidence[]; metric: TrendMetric; onMetric: (metric: TrendMetric) => void; onInspect: (row: FunnelDailyEvidence) => void }) {
  const max = Math.max(1, ...daily.map((row) => trendValue(row, metric)));
  return (
    <section className="rounded-2xl border border-[#dfe6df] bg-white p-4 shadow-[0_10px_28px_rgba(16,45,39,.045)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.16em] text-[#8a978a]">Daily movement</div>
          <h2 className="mt-1 text-sm font-semibold text-[#102d27]">Click any day to inspect the evidence</h2>
        </div>
        <div className="flex gap-1 rounded-xl bg-[#f1f5f0] p-1">
          {(["sessions", "leads", "qualified", "enrolled"] as TrendMetric[]).map((item) => <button key={item} type="button" onClick={() => onMetric(item)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold capitalize ${metric === item ? "bg-white text-[#102d27] shadow-sm" : "text-[#758279]"}`}>{item}</button>)}
        </div>
      </div>
      {daily.length ? (
        <div className="mt-5 overflow-x-auto pb-1">
          <div className="flex h-[190px] min-w-[680px] items-end gap-1.5 border-b border-[#edf1ec]">
            {daily.map((row) => {
              const value = trendValue(row, metric);
              return (
                <button key={row.date} type="button" onClick={() => onInspect(row)} title={`${formatDate(row.date)} · ${value.toLocaleString("en-IN")}`} className="group flex h-full min-w-[13px] flex-1 items-end rounded-t px-[1px] hover:bg-[#f7faf6]">
                  <span className="block w-full rounded-t bg-[#6c9a80] transition group-hover:bg-[#376b57]" style={{ height: `${value ? Math.max(3, (value / max) * 100) : 0}%` }} />
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex min-w-[680px] justify-between text-[9px] text-[#8a978a]"><span>{daily[0] ? formatShortDate(daily[0].date) : ""}</span><span>{daily.length ? formatShortDate(daily[daily.length - 1].date) : ""}</span></div>
        </div>
      ) : <div className="mt-4 rounded-xl border border-dashed border-[#dfe6df] px-4 py-10 text-center text-xs text-[#8a978a]">No daily funnel evidence yet.</div>}
    </section>
  );
}

function Evidence({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-[#e2e8e1] bg-[#fafcf9] p-3"><div className="text-[8px] font-black uppercase tracking-[.1em] text-[#95a095]">{label}</div><div className="mt-1 text-base font-semibold text-[#102d27]">{value.toLocaleString("en-IN")}</div></div>;
}

function Kpi({ label, value, note, icon }: { label: string; value: number; note: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-[#dfe6df] bg-white p-4 shadow-[0_8px_24px_rgba(16,45,39,.04)]"><div className="flex items-center justify-between gap-3"><span className="text-[9px] font-black uppercase tracking-[.12em] text-[#8a978a]">{label}</span><span className="text-[#9aaa9e]">{icon}</span></div><div className="mt-2 text-2xl font-semibold tracking-[-.04em] text-[#102d27]">{value.toLocaleString("en-IN")}</div><div className="mt-1 text-[10px] text-[#758279]">{note}</div></div>;
}

function UnavailableState({ message }: { message?: string }) {
  return <section className="rounded-2xl border border-amber-200 bg-white p-6"><div className="max-w-2xl"><div className="text-sm font-semibold text-[#102d27]">Conversion data is temporarily unavailable</div><p className="mt-1 text-xs leading-5 text-[#758279]">{message ?? "SalsysOS is not treating unavailable reporting as zero performance."}</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => window.location.reload()} className="btn-primary">Try again</button><Link href="/tracking/data-coverage" className="btn-secondary">Check measurement</Link></div></div></section>;
}

function findLargestComparableDrop(journey: FunnelJourney | undefined) {
  if (!journey) return null;
  const candidates = journey.stages.flatMap((stage, index) => {
    if (index === 0) return [];
    const previous = journey.stages[index - 1];
    if (previous.unit !== stage.unit || previous.count <= 0) return [];
    return [{ from: previous, to: stage, rate: (stage.count / previous.count) * 100, lost: Math.max(0, previous.count - stage.count) }];
  });
  return [...candidates].sort((a, b) => a.rate - b.rate)[0] ?? null;
}

function normalizeCoverage(value: number | null) { if (value == null || !Number.isFinite(value)) return null; return value <= 1 ? value * 100 : value; }
function rateLabel(value: number, total: number, suffix: string) { return total > 0 ? `${((value / total) * 100).toFixed(1)}% ${suffix}` : "No denominator"; }
function trendValue(row: FunnelDailyEvidence, metric: TrendMetric) { if (metric === "sessions") return row.sessions; if (metric === "qualified") return row.qualified; if (metric === "enrolled") return row.enrolled; return row.leads; }
function stageHref(stage: FunnelStage, journeyKey: string) { if (stage.key.includes("qualified")) return "/leads?stage=qualified"; if (stage.key.includes("enrolled")) return "/leads?stage=enrolled"; if (stage.key.includes("paid") || stage.key.includes("payment")) return "/revenue"; if (stage.key.includes("lead") || journeyKey === "business") return "/leads"; return null; }
function formatRevenue(inr: number, usd: number) { const values: string[] = []; if (inr > 0) values.push(new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(inr)); if (usd > 0) values.push(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(usd)); return values.join(" · ") || "—"; }
function formatDate(value: string) { const date = new Date(`${value.slice(0, 10)}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date); }
function formatShortDate(value: string) { const date = new Date(`${value.slice(0, 10)}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(date); }
