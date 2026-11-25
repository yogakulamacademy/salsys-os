import Link from "next/link";

import {
  dataLayers, groupAdsByCreative, pctText, rankSignals,
  type DataLayer, type EnrolmentIntelligence,
} from "@/lib/enrolment-intelligence";

// "What makes people enrol" (owner-approved mockup Personas v3, 25 Nov 2026):
// ranked suggestions, the end-to-end path of everyone who reached payment,
// which signals predict it, which ads bring people who move forward, and how
// complete each data layer is. Everything is computed from live data.

const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs";
const label = "text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted";

function Why({ title, children, tone = "brand" }: { title: string; children: React.ReactNode; tone?: "brand" | "amber" }) {
  const cls = tone === "amber"
    ? "border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300"
    : "border-brand-100 bg-brand-50/60 text-brand-700 dark:border-brand-900/50 dark:bg-brand-950/20 dark:text-brand-300";
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 ${cls}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.08em]">{title}</div>
      <p className="mt-0.5 text-[13.5px] leading-5 text-copy-strong">{children}</p>
    </div>
  );
}

function Meter({ rows, max }: { rows: Array<{ label: string; value: number; text: string; tone: string }>; max: number }) {
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[150px_minmax(0,1fr)_56px] items-center gap-2.5 text-[12.5px]">
          <span className="truncate text-copy-muted">{r.label}</span>
          <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className={`block h-full rounded ${r.tone}`} style={{ width: `${max ? Math.min(100, (r.value / max) * 100) : 0}%` }} /></span>
          <strong className="text-right tabular-nums text-copy-strong">{r.text}</strong>
        </div>
      ))}
    </div>
  );
}

function Suggestion({ rank, impact, title, children, evidence, action, basis }: {
  rank: number; impact: string; title: string; children: React.ReactNode; evidence: React.ReactNode; action: React.ReactNode; basis: string;
}) {
  return (
    <article className={`${card} ${rank === 1 ? "border-brand-200 shadow-[0_8px_24px_rgba(87,67,197,0.10)]" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`grid size-6 place-items-center rounded-lg text-[12.5px] font-extrabold ${rank === 1 ? "bg-copy-strong text-surface" : "bg-brand-50 text-brand-700"}`}>{rank}</span>
        <span className="text-[12px] font-extrabold tracking-wide text-brand-700 dark:text-brand-300">{impact}</span>
      </div>
      <h3 className="text-[16px] font-extrabold leading-snug text-copy-strong">{title}</h3>
      {evidence}
      <p className="text-[13px] leading-5 text-copy">{children}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2">{action}</div>
      <p className="text-[11.5px] text-copy-subtle">{basis}</p>
    </article>
  );
}

const statusCls: Record<DataLayer["status"], string> = {
  live: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  partial: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  gap: "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300",
  missing: "bg-surface-muted text-copy-muted",
};
const barCls: Record<DataLayer["status"], string> = { live: "bg-emerald-600", partial: "bg-amber-600", gap: "bg-red-600", missing: "bg-line" };

const CHANNEL: Record<string, string> = { website: "Website (Google, ChatGPT or direct)", instagram: "Instagram ad or post", whatsapp: "WhatsApp", none: "Other" };

export function EnrolmentIntelligenceSection({ data }: { data: EnrolmentIntelligence }) {
  const o = data.outcomes;
  const { baseline, ranked } = rankSignals(data.signals);
  const baseRate = baseline?.rate ?? 0;
  const web = ranked.find((s) => s.key === "web");
  const fee = ranked.find((s) => s.key === "fee");
  const ads = groupAdsByCreative(data.ads).filter((a) => a.people >= 10).slice(0, 8);
  const bestAd = [...ads].sort((a, b) => b.qualified / b.people - a.qualified / a.people)[0];
  const worstAd = [...ads].sort((a, b) => a.qualified / a.people - b.qualified / b.people)[0];
  const layers = dataLayers(data);
  const channels = Object.entries(data.journey.byChannel).sort((a, b) => b[1] - a[1]);
  const byHand = data.journey.movedBy.human ?? 0;
  const byAi = data.journey.movedBy.ai ?? 0;
  const websitePayers = data.journey.byChannel.website ?? 0;
  const paidRecorded = o.paymentsPaid + o.enrollments;
  const maxRate = Math.max(0.01, ...ranked.filter((s) => s.reliable).map((s) => s.rate));

  return (
    <section className="space-y-4" aria-labelledby="enrol-heading">
      <div>
        <h2 id="enrol-heading" className="text-[18px] font-extrabold text-copy-strong">What makes people enrol</h2>
        <p className="mt-1 max-w-[1200px] text-[15px] leading-7 text-copy">
          The model can only learn from people who paid, and the CRM has <strong className="text-copy-strong">{o.wonOrEnrolled} marked won or enrolled and {paidRecorded} payments recorded as paid</strong>.
          {" "}Here is what the <strong className="text-copy-strong">{o.reachedPayment} people who reached payment</strong> have in common, and the data layers that will make this reliable.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr_1fr]">
        <Suggestion rank={1} impact="THE OUTCOME THE MODEL IS MISSING" title={`Mark the ${o.paymentPendingNow} at Payment pending as Paid or Not paid`}
          evidence={<Meter max={Math.max(o.paymentRecords, o.paymentPendingNow, 1)} rows={[
            { label: "Recorded as paid", value: paidRecorded, text: String(paidRecorded), tone: "bg-emerald-600" },
            { label: "Payment pending", value: o.paymentPendingNow, text: String(o.paymentPendingNow), tone: "bg-amber-600" },
            { label: "Payment records", value: o.paymentRecords, text: String(o.paymentRecords), tone: "bg-line" },
          ]} />}
          action={<Link href="/leads?stage=payment_pending" className="btn-primary">Go through the {o.paymentPendingNow}</Link>}
          basis="From payment records and the Payment pending stage">
          Every “Paid” becomes a real example of who enrols. <strong>{o.paymentRecords} payment records</strong> exist, {paidRecorded ? `${paidRecorded} marked paid` : "none marked paid"}.
        </Suggestion>

        <Suggestion rank={2} impact={bestAd && worstAd ? "WHICH AD BRINGS SERIOUS PEOPLE" : "AD TRACKING IS LIVE"}
          title={bestAd && worstAd && bestAd !== worstAd ? `“${bestAd.title}” brings ${Math.round((bestAd.qualified / bestAd.people) / Math.max(0.01, worstAd.qualified / worstAd.people))}× as many Qualified people as “${worstAd.title}”` : `${data.layers.ad.toLocaleString("en-IN")} people linked to the ad they clicked`}
          evidence={bestAd && worstAd ? <Meter max={1} rows={[
            { label: bestAd.title, value: bestAd.qualified / bestAd.people, text: pctText(bestAd.qualified / bestAd.people), tone: "bg-emerald-600" },
            { label: worstAd.title, value: worstAd.qualified / worstAd.people, text: pctText(worstAd.qualified / worstAd.people), tone: "bg-red-600" },
          ]} /> : null}
          action={<a href="#ads" className="btn-secondary">See every ad</a>}
          basis={`${data.layers.ad.toLocaleString("en-IN")} people · from the ad that started each Instagram chat`}>
          Share of each ad’s people who became Qualified. Once ad spend syncs again, this becomes <strong>cost per Qualified person</strong>.
        </Suggestion>

        {web && baseline ? (
          <Suggestion rank={3} impact={web.lift && web.lift >= 2 ? `${Math.round(web.lift)}× MORE LIKELY TO REACH PAYMENT` : "WEBSITE VISITORS"} title="People who visit the website reach payment far more often"
            evidence={<Meter max={Math.max(web.rate, baseRate, 0.01)} rows={[
              { label: "Visited the website", value: web.rate, text: pctText(web.rate, 1), tone: "bg-emerald-600" },
              { label: "Everyone", value: baseRate, text: pctText(baseRate, 1), tone: "bg-brand-300" },
            ]} />}
            action={<Link href="/leads?view=all" className="btn-secondary">See leads</Link>}
            basis={`${web.n} people with website visits · early signal`}>
            Sending the course page link in the first reply puts more people on this path, and every open is tracked.
          </Suggestion>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={card}>
          <div><h3 className={label}>How the {o.reachedPayment} got to payment · end to end</h3><p className="text-[12px] text-copy-muted">Everyone who reached Payment pending or beyond, from first contact to how they were moved</p></div>
          <div className="grid grid-cols-[1fr_24px_1fr] items-stretch gap-2">
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-copy-subtle">First contact</div>
              {channels.map(([ch, n]) => (
                <div key={ch} className="rounded-xl bg-surface-muted px-3 py-2">
                  <div className="text-[12.5px] font-semibold text-copy">{CHANNEL[ch] ?? ch}</div>
                  <div className="text-[20px] font-extrabold tabular-nums text-copy-strong">{n}</div>
                </div>
              ))}
            </div>
            <div className="grid place-items-center text-[18px] text-copy-subtle" aria-hidden>→</div>
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-copy-subtle">Moved to payment by</div>
              <div className="rounded-xl bg-copy-strong px-3 py-2 text-surface">
                <div className="text-[12.5px] font-semibold">The team, by hand</div>
                <div className="text-[20px] font-extrabold tabular-nums">{byHand}</div>
                <div className="text-[11.5px] opacity-80">usually after a call or WhatsApp the CRM can’t see</div>
              </div>
              <div className="rounded-xl bg-brand-600 px-3 py-2 text-white">
                <div className="text-[12.5px] font-semibold">The AI, from the chat</div>
                <div className="text-[20px] font-extrabold tabular-nums">{byAi}</div>
                <div className="text-[11.5px] opacity-80">e.g. “I’ve made the payment”</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="text-[12.5px] font-semibold text-emerald-800 dark:text-emerald-300">Marked won or enrolled</div>
                <div className="text-[20px] font-extrabold tabular-nums text-copy-strong">{o.wonOrEnrolled}</div>
              </div>
            </div>
          </div>
          <Why title="What this shows">
            <strong>{websitePayers} of {o.reachedPayment} started on the website</strong>
            {data.journey.websiteShareOfPeople != null ? <>, although website chats are only about {pctText(Number(data.journey.websiteShareOfPeople))} of people</> : null}.
            {" "}{byHand} were moved by hand, so the deciding step mostly happens <strong>outside the CRM</strong>. Logging calls closes that gap.
          </Why>
        </section>

        <section className={card}>
          <div><h3 className={label}>What predicts reaching payment</h3><p className="text-[12px] text-copy-muted">Share of people with each signal who reached Payment pending or beyond · people who first wrote 7–{data.days} days ago</p></div>
          <div className="space-y-1">
            {baseline ? (
              <div className="grid grid-cols-[200px_minmax(0,1fr)_56px_104px] items-center gap-2.5 border-y border-dashed border-brand-200 py-1.5 text-[13px]">
                <strong>Everyone</strong>
                <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded bg-brand-600" style={{ width: `${(baseRate / maxRate) * 100}%` }} /></span>
                <strong className="text-right tabular-nums">{pctText(baseRate, 1)}</strong>
                <span className="text-right text-[11.5px] text-copy-muted">n={baseline.n.toLocaleString("en-IN")}</span>
              </div>
            ) : null}
            {ranked.map((s) => {
              const tone = !s.reliable ? "bg-line" : (s.lift ?? 0) >= 2 ? "bg-emerald-600" : (s.lift ?? 1) < 0.8 ? "bg-red-600" : "bg-copy-subtle";
              return (
                <div key={s.key} className={`grid grid-cols-[200px_minmax(0,1fr)_56px_104px] items-center gap-2.5 py-0.5 text-[13px] ${s.reliable ? "" : "opacity-60"}`}>
                  <span className="truncate">{s.label}</span>
                  <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className={`block h-full rounded ${tone}`} style={{ width: `${Math.min(100, (s.rate / maxRate) * 100)}%` }} /></span>
                  <strong className="text-right tabular-nums">{pctText(s.rate, 1)}</strong>
                  <span className="text-right text-[11.5px] text-copy-muted">{s.lift != null ? `${s.lift.toFixed(1)}× · ` : ""}n={s.n}</span>
                </div>
              );
            })}
          </div>
          <Why title="Read with care" tone="amber">
            Only <strong>{o.reachedPayment} people</strong> have reached payment, so these are early signals, not proof. They firm up as payments get marked.
            {fee && fee.lift != null && fee.lift < 1 ? <> Asking the fee alone <strong>isn’t</strong> a buying signal ({pctText(fee.rate, 1)} vs {pctText(baseRate, 1)}).</> : null}
          </Why>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section id="ads" className={card}>
          <div><h3 className={label}>Which ad brings people who move forward</h3><p className="text-[12px] text-copy-muted">From the ad that started each Instagram chat · ads with 10+ people</p></div>
          {ads.length ? (
            <div>
              <div className="grid grid-cols-[minmax(0,1.6fr)_60px_minmax(0,1fr)_minmax(0,1fr)_56px] gap-2.5 pb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-copy-subtle">
                <span>Ad</span><span className="text-right">People</span><span>Qualified</span><span>High intent</span><span className="text-right">Payment</span>
              </div>
              {ads.map((a) => {
                const q = a.qualified / a.people; const h = a.highIntent / a.people;
                return (
                  <div key={a.adIds.join(",")} className="grid grid-cols-[minmax(0,1.6fr)_60px_minmax(0,1fr)_minmax(0,1fr)_56px] items-center gap-2.5 border-t border-line py-2 text-[13px]">
                    <span className="truncate font-semibold text-copy-strong" title={a.title ?? ""}>{a.title}</span>
                    <span className="text-right font-semibold tabular-nums">{a.people}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted"><span className={`block h-full ${q >= 0.3 ? "bg-emerald-600" : q < 0.15 ? "bg-red-600" : "bg-brand-600"}`} style={{ width: `${Math.min(100, q * 200)}%` }} /></span><strong className="w-9 text-right tabular-nums">{pctText(q)}</strong></span>
                    <span className="flex items-center gap-1.5"><span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted"><span className="block h-full bg-blue-600" style={{ width: `${Math.min(100, h * 500)}%` }} /></span><strong className="w-9 text-right tabular-nums">{pctText(h)}</strong></span>
                    <span className="text-right tabular-nums">{a.payment}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-[13px] text-copy-muted">No ad clicks linked yet. New ones appear within 5 minutes.</p>}
        </section>

        <section className={card}>
          <div><h3 className={label}>What the model learns from · {layers.length} data layers</h3><p className="text-[12px] text-copy-muted">Coverage = share of people from the last {data.days} days that the layer knows about</p></div>
          <div>
            {layers.map((l) => (
              <div key={l.key} className="grid grid-cols-[minmax(0,1.2fr)_170px_minmax(0,1fr)] items-center gap-3 border-t border-line py-2 first:border-t-0">
                <div className="min-w-0"><div className="text-[13.5px] font-semibold text-copy-strong">{l.name}</div><div className="truncate text-[11.5px] text-copy-muted">{l.what}</div></div>
                <div><div className="h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className={`h-full ${barCls[l.status]}`} style={{ width: `${Math.max(l.coverage > 0 ? 2 : 0, l.coverage * 100)}%` }} /></div><div className="mt-1 text-[11.5px] text-copy-muted">{l.count}</div></div>
                <span className={`justify-self-start rounded-lg px-2 py-1 text-[11.5px] font-semibold ${statusCls[l.status]}`}>{l.note}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
