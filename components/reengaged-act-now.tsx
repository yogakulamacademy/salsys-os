import Link from "next/link";

import { ReengageDraft } from "@/components/reengaged-draft";
import type { FitResult } from "@/lib/course-persona";
import { suggestNextStep, type InterestProfile } from "@/lib/interest-profile";

export type ActNowLead = {
  leadId: string;
  name: string;
  stage: string;
  source: string | null;
  personId: string | null;
  profile: InterestProfile;
  fit?: FitResult | null;
};

const FIT_STYLE: Record<FitResult["band"], string> = {
  strong: "bg-emerald-50 text-emerald-800 border-emerald-200",
  good: "bg-teal-50 text-teal-800 border-teal-200",
  some: "bg-slate-50 text-slate-700 border-slate-200",
  weak: "bg-slate-50 text-slate-500 border-slate-200",
};

/** How much the lead looks like people who join the course (approved persona). */
export function FitBadge({ fit }: { fit: FitResult | null | undefined }) {
  if (!fit) return null;
  return (
    <span
      title={fit.reasons.length ? fit.reasons.map((r) => `${r.text} (+${r.points})`).join("\n") : "Little in common with people who joined yet"}
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${FIT_STYLE[fit.band]}`}
    >
      Fit {fit.score}
    </span>
  );
}

const BAND_STYLE: Record<InterestProfile["interestBand"], string> = {
  hot: "bg-red-50 text-red-700 border-red-200",
  warm: "bg-orange-50 text-orange-700 border-orange-200",
  cool: "bg-blue-50 text-blue-700 border-blue-200",
  cold: "bg-slate-50 text-slate-600 border-slate-200",
};

const BAND_LABEL: Record<InterestProfile["interestBand"], string> = { hot: "Hot", warm: "Warm", cool: "Cool", cold: "Cold" };

export function InterestBadge({ profile }: { profile: InterestProfile | undefined }) {
  if (!profile) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BAND_STYLE[profile.interestBand]}`}>
        {BAND_LABEL[profile.interestBand]}
      </span>
      <span className="text-sm font-bold text-slate-800">{profile.interestScore}</span>
    </span>
  );
}

function pretty(value: string) {
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function signals(p: InterestProfile): string[] {
  const out: string[] = [];
  if (p.visits) out.push(`${p.visits} visit${p.visits > 1 ? "s" : ""}`);
  if (p.pagesViewed) out.push(`${p.pagesViewed} pages`);
  if (p.priceViews) out.push(`Saw price ×${p.priceViews}`);
  if (p.returnedAfterDays != null) out.push(`Back after ${p.returnedAfterDays} days`);
  if (p.readingMinutes >= 1) out.push(`${p.readingMinutes} min reading`);
  for (const t of p.topics.slice(0, 2)) out.push(`Asked: ${t.label}`);
  if (p.courses[0]) out.push(p.courses[0].name);
  return out.slice(0, 6);
}

/** Coverage: how many leads tracking can see. Explains why most cards are empty. */
export function TrackingCoverage({ linked, total }: { linked: number; total: number }) {
  const pct = total ? Math.round((linked / total) * 1000) / 10 : 0;
  return (
    <section className="card-pad mt-4" data-testid="tracking-coverage">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="xl:w-[300px] xl:flex-none">
          <div className="section-title">What tracking can see</div>
          <div className="mt-1 text-xs text-slate-500">
            {linked.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} leads ({pct}%) are linked to website visits
          </div>
        </div>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
          <span className="block h-full rounded-full bg-violet-600" style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <div className="text-xs leading-5 text-slate-600 xl:w-[460px] xl:flex-none">
          Send course links from the Inbox: when a lead opens one, their website visits are linked and show up here.
        </div>
      </div>
    </section>
  );
}

/** "Act now": the people most worth contacting, with why and a suggested next step. */
export function ActNow({ leads, compact = false }: { leads: ActNowLead[]; compact?: boolean }) {
  if (!leads.length) return null;
  return (
    <section data-testid="act-now">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Act now</div>
          <div className="section-title mt-1">
            {leads.length} {leads.length === 1 ? "person is" : "people are"} worth contacting now
          </div>
        </div>
        <span className="text-xs text-slate-500">Sorted by interest · last 30 days</span>
      </div>
      <div className={`grid gap-4 lg:grid-cols-2 ${compact ? "" : "2xl:grid-cols-3"}`}>
        {leads.map((lead) => {
          const p = lead.profile;
          const step = suggestNextStep(p);
          return (
            <article key={lead.leadId} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold text-slate-900">{lead.name || "Lead"}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {[lead.source ? pretty(lead.source) : null, pretty(lead.stage || "new"), p.courses[0]?.name].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  <FitBadge fit={lead.fit} />
                  <InterestBadge profile={p} />
                </span>
              </div>

              {p.reasons.length ? (
                <div className="text-[13px] leading-5 text-slate-700">
                  <strong>Why now:</strong> {p.reasons.slice(0, 3).map((r) => r.text.toLowerCase()).join(", ")}.
                </div>
              ) : null}

              <div className="flex flex-wrap gap-1.5">
                {signals(p).map((s) => (
                  <span key={s} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-semibold capitalize text-slate-700">{s}</span>
                ))}
              </div>

              {step ? (
                <div className={`rounded-xl border px-3 py-2.5 text-[13px] leading-5 ${step.needsPerson ? "border-amber-200 bg-amber-50 text-amber-800" : "border-violet-200 bg-violet-50 text-violet-900"}`}>
                  <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-80">{step.needsPerson ? "For a person" : "Suggested next step"}</div>
                  <div className="mt-0.5 font-semibold">{step.action}</div>
                  <div className="mt-0.5 text-[12px] opacity-80">{step.why}</div>
                </div>
              ) : null}

              <div className="mt-auto flex flex-wrap items-center gap-2">
                {step?.needsPerson ? (
                  <Link href={`/conversations?lead=${lead.leadId}`} className="btn-primary">Open conversation</Link>
                ) : (
                  <>
                    <ReengageDraft leadId={lead.leadId} />
                    <Link href={`/conversations?lead=${lead.leadId}`} className="btn-secondary">Open conversation</Link>
                  </>
                )}
                {lead.personId ? (
                  <Link href={`/customer-360/${lead.personId}?opportunity=${lead.leadId}`} className="btn-secondary">Open profile</Link>
                ) : (
                  <Link href={`/leads/${lead.leadId}`} className="btn-secondary">Open lead</Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** What the drafting AI is held to on this page; each rule is enforced in code. */
export function ReengageRules() {
  const rules = [
    "Drafts only: a person reviews and sends every message from the Inbox",
    "Instagram only within 24 h of their last message; after that, a WhatsApp template or email",
    "Never offers a discount, scholarship or special price, and never sends a payment link",
    "Discount and scholarship questions go to a person",
    "Never mentions that it saw their website visits",
    "Leads marked Lost 4 times stay out",
  ];
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Rules the AI follows</h2>
      <ul className="mt-2">
        {rules.map((rule) => (
          <li key={rule} className="flex gap-2.5 border-t border-line py-2 text-[13px] leading-5 text-copy first:border-t-0">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
            {rule}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** People who went quiet and then came back (visited or wrote again). */
export function CameBack({ leads }: { leads: { leadId: string; name: string; detail: string }[] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Came back after going quiet</h2>
      <p className="mt-1 text-[12px] text-copy-muted">Came back to the website after becoming a lead.</p>
      {leads.length ? (
        <ul className="mt-2">
          {leads.map((lead) => (
            <li key={lead.leadId} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-copy-strong">{lead.name}</span>
                <span className="block truncate text-[12px] text-copy-muted">{lead.detail}</span>
              </span>
              <Link href={`/conversations?lead=${lead.leadId}`} className="shrink-0 rounded-lg bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-100">Open</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-copy-muted">Nobody yet.</p>
      )}
    </section>
  );
}
