import Link from "next/link";

import { clearConflictsAction } from "@/app/data-quality/actions";
import { dismissIdentityResolutionConflictInline, mergeIdentityResolutionConflictInline } from "@/app/data-quality/inline-actions";
import { FillCourseTable } from "@/components/data-quality/fill-course-table";
import { SubmitButton } from "@/components/submit-button";
import { ToastForm } from "@/components/toast-form";
import { PageHeader } from "@/components/ui";
import { courseSuggestions, dqHeadline, pct, pctText } from "@/lib/data-quality";
import { getDataQuality } from "@/lib/data-quality-data";
import { mentionedCourse } from "@/lib/person-checks";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

// Data quality, a CRM tab for admins (owner-approved mockup, 25 Nov 2026):
// ranked fixes with their evidence, four coverage numbers, and a worklist.
// Every number comes from data_quality_v1 over all open enquiries.

type Tab = "fill" | "same" | "noclue" | "owner";
type Props = { searchParams: Promise<{ tab?: string | string[]; merge?: string | string[] }> };

type LiveConflict = { id: string; lead_id: string; person_id: string | null; conflict_type: string; candidate_person_ids: string[] | null; evidence: Record<string, unknown> | null; detected_at: string | null };

const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs";
const n = (x: number) => x.toLocaleString("en-IN");
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const STAGE: Record<string, string> = { new: "New", contacted: "Contacted", engaged: "Engaged", qualified: "Qualified", high_intent: "High intent", payment_pending: "Payment pending", nurture: "Nurture", not_now: "Not now" };
const ID_TYPE: Record<string, string> = { phone: "Phone", whatsapp: "WhatsApp", email: "Email", instagram: "Instagram" };

function Bars({ rows }: { rows: Array<{ label: string; value: number; tone: string }> }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[160px_minmax(0,1fr)_52px] items-center gap-2.5 text-[12.5px]">
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

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-xs">
      <span className="text-[12.5px] font-semibold text-copy-muted">{label}</span>
      <span className="text-[28px] font-extrabold tracking-tight text-copy-strong tabular-nums">{value}</span>
      <span className="truncate text-[12px] text-copy-muted">{sub}</span>
    </div>
  );
}

/**
 * Same-person review. Reads open checks live under the user's own access, and
 * keeps the safety rules: exact values are not shown, merging needs two
 * clicks and only for a single candidate, and nothing merges automatically.
 */
function SameList({ live, names, testLeads, canReview, mergeId }: {
  live: LiveConflict[]; names: Map<string, string>; testLeads: Set<string>; canReview: boolean; mergeId: string | null;
}) {
  return (
    <div>
      <div className="border-b border-line bg-surface-soft px-4 py-2.5">
        <h2 className="text-[13px] font-bold text-copy-strong">Identity conflict review</h2>
        <p className="text-[12.5px] text-copy-muted">A contact detail on one person already belongs to another. Exact value is intentionally not shown in this queue.</p>
      </div>
      {!live.length ? <p className="px-4 py-8 text-center text-[13px] text-copy-muted">No same-person checks are open.</p> : null}
      {live.map((c) => {
        const candidateIds = c.candidate_person_ids ?? [];
        const firstCandidateId = candidateIds[0] ?? null;
        const idType = String(c.evidence?.identifier_type ?? "");
        const mergeConfirmationOpen = mergeId === c.id;
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-3 text-[13px] first:border-t-0">
            <div className="min-w-[220px] flex-1">
              <Link href={`/leads/${c.lead_id}`} className="font-bold text-copy-strong hover:underline">{names.get(c.lead_id) ?? "Lead"}</Link>
              {testLeads.has(c.lead_id) ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-bold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Test lead</span> : null}
              <p className="text-[12.5px] text-copy-muted">
                Their {ID_TYPE[idType] ?? "contact detail"} already belongs to another person
                {c.detected_at ? ` · since ${new Date(c.detected_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                {candidateIds.length > 1 ? ` · ${candidateIds.length} possible matches` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.person_id ? <Link href={`/customer-360/${c.person_id}?opportunity=${c.lead_id}`} className="btn-secondary h-8 px-3 text-[12.5px]">This person</Link> : null}
              {firstCandidateId ? <Link href={`/customer-360/${firstCandidateId}`} className="btn-secondary h-8 px-3 text-[12.5px]">The other person</Link> : null}
              {canReview ? (
                <>
                  <ToastForm action={dismissIdentityResolutionConflictInline}>
                    <input type="hidden" name="conflict_id" value={c.id} />
                    <button type="submit" className="btn-secondary h-8 px-3 text-[12.5px]">Dismiss as distinct</button>
                  </ToastForm>
                  {candidateIds.length === 1 ? (
                    mergeConfirmationOpen ? (
                      <>
                        <ToastForm action={mergeIdentityResolutionConflictInline}>
                          <input type="hidden" name="conflict_id" value={c.id} />
                          <button type="submit" className="btn-primary h-8 px-3 text-[12.5px]">Confirm same person & merge</button>
                        </ToastForm>
                        <Link href="/data-quality?tab=same#worklist" className="btn-secondary h-8 px-3 text-[12.5px]">Cancel merge</Link>
                      </>
                    ) : (
                      <Link href={`/data-quality?tab=same&merge=${encodeURIComponent(c.id)}#worklist`} className="btn-secondary h-8 px-3 text-[12.5px]">Same person</Link>
                    )
                  ) : candidateIds.length > 1 ? (
                    <span className="self-center text-[12px] font-semibold text-copy-muted">Multi-candidate review only</span>
                  ) : null}
                </>
              ) : <span className="self-center text-[12px] font-semibold text-copy-muted">Manager review required</span>}
            </div>
            {mergeConfirmationOpen ? (
              <p className="w-full text-[12px] text-copy-muted">Compare both people first. Both enquiries are kept. The database still blocks the merge if active privacy, legal or ad-delivery state makes it unsafe.</p>
            ) : null}
          </div>
        );
      })}
      <p className="border-t border-line px-4 py-2.5 text-[12px] text-copy-muted">No automatic merge from this workspace: every merge is a person’s decision, two clicks, one possible match at a time.</p>
    </div>
  );
}

export default async function DataQualityPage({ searchParams }: Props) {
  const params = await searchParams;
  const loaded = await getDataQuality();
  if (!loaded) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Data quality" description="This page could not be loaded right now. Please refresh in a moment." />
      </div>
    );
  }
  const { data: d, courses } = loaded;

  // Same-person checks, read live under the user's own access.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const organizationId = user ? await requireCurrentOrganizationId(supabase, user.id) : null;
  const [liveResult, reviewResult] = organizationId
    ? await Promise.all([
        supabase.from('identity_resolution_conflicts')
          .select("id,lead_id,person_id,conflict_type,candidate_person_ids,evidence,detected_at")
          .eq("organization_id", organizationId).eq('status', 'open')
          .order("detected_at", { ascending: false }).limit(50),
        supabase.rpc("can_administer_organization_crm", { p_organization_id: organizationId }),
      ])
    : [{ data: [] as LiveConflict[] }, { data: false }];
  const live = ((liveResult.data ?? []) as LiveConflict[]);
  const canReview = reviewResult.data === true;
  const conflictNames = new Map(d.conflicts.map((c) => [c.leadId, c.leadName]));
  const testLeads = new Set(d.conflicts.filter((c) => c.testLead).map((c) => c.leadId));
  const { fill, noClue } = courseSuggestions(d, courses, mentionedCourse);
  const fromAd = fill.filter((r) => r.source === "ad").length;
  const fromWords = fill.length - fromAd;
  const tabParam = one(params.tab);
  const tab: Tab = tabParam === "same" || tabParam === "noclue" || tabParam === "owner" ? tabParam : "fill";
  const mergeId = one(params.merge) ?? null;
  const owners = d.open - d.noOwner;
  const allTest = d.conflicts.length > 0 && d.conflicts.every((c) => c.testLead);
  const byLead = [...d.conflicts.reduce((m, c) => m.set(c.leadName, (m.get(c.leadName) ?? 0) + 1), new Map<string, number>())];

  const ranks: React.ReactNode[] = [];
  if (fill.length) {
    ranks.push(
      <Rank key="fill" rank={ranks.length + 1} impact={`${n(fill.length)} courses we can fill`} title={fromAd >= fromWords ? "Fill the course from the ad they clicked" : "Fill the course from what they wrote"}>
        <Bars rows={[
          { label: "From the ad they clicked", value: fromAd, tone: "bg-emerald-600" },
          { label: "From their own words", value: fromWords, tone: "bg-emerald-600" },
          { label: "No clue yet", value: noClue.length, tone: "bg-slate-300" },
        ]} />
        <p className="text-[13px] leading-5 text-copy">For these ads, <strong>90% or more of the people who came from them already have that course</strong>. Each suggestion shows its evidence; nothing changes until you press Fill.</p>
        <div className="mt-auto flex flex-wrap gap-2"><Link href="/data-quality?tab=fill#worklist" className="btn-primary">Review and fill {n(fill.length)}</Link></div>
        <p className="text-[11.5px] text-copy-subtle">Ad each person clicked · courses of others from the same ad</p>
      </Rank>,
    );
  }
  if (d.conflicts.length) {
    ranks.push(
      <Rank key="same" rank={ranks.length + 1} impact={`${n(d.conflicts.length)} same-person check${d.conflicts.length === 1 ? "" : "s"}`} title={allTest ? `All ${n(d.conflicts.length)} come from your own test leads` : "Check who might be the same person"}>
        <Bars rows={byLead.slice(0, 4).map(([label, value]) => ({ label, value, tone: "bg-orange-700" }))} />
        <p className="text-[13px] leading-5 text-copy">
          {allTest
            ? <>A phone, WhatsApp or email on a test lead already belongs to someone else. <strong>Clear them</strong> so they stop showing as identity problems.</>
            : <>A contact detail on one person already belongs to another. Compare both, then merge or keep them apart.</>}
        </p>
        <div className="mt-auto flex flex-wrap gap-2">
          {allTest ? (
            <ToastForm action={clearConflictsAction}>
              {d.conflicts.map((c) => <input key={c.id} type="hidden" name="conflict_id" value={c.id} />)}
              <SubmitButton pendingLabel="Clearing…" className="btn-primary">Clear the {n(d.conflicts.length)}</SubmitButton>
            </ToastForm>
          ) : null}
          <Link href="/data-quality?tab=same#worklist" className={allTest ? "btn-secondary" : "btn-primary"}>Compare first</Link>
        </div>
        <p className="text-[11.5px] text-copy-subtle">Open identity checks</p>
      </Rank>,
    );
  }
  if (d.noOwner) {
    ranks.push(
      <Rank key="owner" rank={ranks.length + 1} impact={`${n(d.noOwner)} without an owner`} title="Give leads an owner">
        <Bars rows={[{ label: "No owner", value: d.noOwner, tone: "bg-red-700" }, { label: "Has an owner", value: owners, tone: "bg-brand-600" }]} />
        <p className="text-[13px] leading-5 text-copy">Nobody is reminded about a lead with no owner. Owning leads by course gives each person a short list of their own.</p>
        <div className="mt-auto"><Link href="/team-performance" className="btn-primary">Assign owners</Link></div>
        <p className="text-[11.5px] text-copy-subtle">Open enquiries today</p>
      </Rank>,
    );
  }

  const tabs: Array<[Tab, string, number]> = [["fill", "Fill course", fill.length], ["same", "Same person?", d.conflicts.length], ["noclue", "No course, no clue", noClue.length], ["owner", "No owner", d.noOwner]];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Data quality"
        description={<span className="text-[15px] leading-7 text-copy"><strong className="font-semibold text-copy-strong">{dqHeadline(d, fill.length)}</strong></span>}
        actions={<><Link href="/customer-360" className="btn-secondary">Customer 360</Link>{fill.length ? <Link href="/data-quality?tab=fill#worklist" className="btn-primary">Review and fill {n(fill.length)}</Link> : null}</>}
      />

      {ranks.length ? <div className="grid gap-3.5 lg:grid-cols-3">{ranks}</div> : null}

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Identity confirmed" value={pctText(pct(d.personsVerified, d.persons))} sub={`${n(d.personsVerified)} of ${n(d.persons)} people`} />
        <Kpi label="Course known" value={pctText(pct(d.open - d.noCourse, d.open))} sub={`${n(d.open - d.noCourse)} of ${n(d.open)} open`} />
        <Kpi label="Value set" value={pctText(pct(d.open - d.noValue, d.open))} sub={`${n(d.open - d.noValue)} of ${n(d.open)} open`} />
        <Kpi label="Owner set" value={pctText(pct(owners, d.open))} sub={`${n(owners)} of ${n(d.open)} open`} />
      </div>

      <section id="worklist" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
        <nav aria-label="Worklist" className="flex flex-wrap gap-1 border-b border-line p-3">
          <div className="flex flex-wrap gap-0.5 rounded-xl bg-brand-50/70 p-1 dark:bg-brand-950/30">
            {tabs.map(([key, label, count]) => (
              <Link key={key} href={`/data-quality?tab=${key}#worklist`} aria-current={tab === key ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] ${tab === key ? "bg-brand-600 font-bold text-white" : "font-semibold text-copy-muted hover:text-copy-strong"}`}>
                {label} <span className="text-[12px] opacity-80">{n(count)}</span>
              </Link>
            ))}
          </div>
        </nav>

        {tab === "fill" ? <FillCourseTable rows={fill} /> : null}
        {tab === "same" ? <SameList live={live} names={conflictNames} testLeads={testLeads} canReview={canReview} mergeId={mergeId} /> : null}
        {tab === "noclue" ? (
          <div>
            <p className="border-b border-line bg-surface-soft px-4 py-2.5 text-[12.5px] text-copy-muted">They didn’t name a course and didn’t come from an ad we can trace. Ask which course they mean when you reply; the newest 60 are shown.</p>
            {noClue.slice(0, 60).map((l) => (
              <div key={l.leadId} className="grid grid-cols-[240px_110px_minmax(0,1fr)_90px] items-center gap-4 border-t border-line px-4 py-2.5 text-[13px] first:border-t-0">
                <Link href={`/conversations?lead=${l.leadId}`} className="truncate font-bold text-copy-strong hover:underline">{l.name}</Link>
                <span className="text-[12.5px] text-copy-muted">{STAGE[l.stage] ?? l.stage}</span>
                <span className="truncate text-copy">{l.lastIn ? `“${l.lastIn.replace(/\s+/g, " ")}”` : "No message yet"}</span>
                <Link href={`/conversations?lead=${l.leadId}`} className="btn-secondary h-8 px-3 text-[12.5px]">Open chat</Link>
              </div>
            ))}
          </div>
        ) : null}
        {tab === "owner" ? (
          <div>
            <p className="border-b border-line bg-surface-soft px-4 py-2.5 text-[12.5px] text-copy-muted">The newest 100 of {n(d.noOwner)} open enquiries without an owner. Assign them from Team performance, or from each lead.</p>
            {d.noOwnerSample.map((l) => (
              <div key={l.leadId} className="grid grid-cols-[240px_110px_minmax(0,1fr)_110px] items-center gap-4 border-t border-line px-4 py-2.5 text-[13px] first:border-t-0">
                <Link href={`/leads/${l.leadId}`} className="truncate font-bold text-copy-strong hover:underline">{l.name}</Link>
                <span className="text-[12.5px] text-copy-muted">{STAGE[l.stage] ?? l.stage}</span>
                <span className="truncate text-copy">{l.course ?? "Course not known yet"}</span>
                <Link href={`/leads/${l.leadId}`} className="btn-secondary h-8 px-3 text-[12.5px]">+ Assign</Link>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
