import Link from "next/link";

import { EnrolmentIntelligenceSection } from "@/components/personas/enrolment-intelligence";
import { PersonaButton } from "@/components/personas/persona-buttons";
import { EmptyState, PageHeader } from "@/components/ui";
import { labelTopic, MIN_STRONG, personaAdvice, type PersonaTraits } from "@/lib/course-persona";
import { listCoursePersonas } from "@/lib/course-persona-data";
import { getEnrolmentIntelligence } from "@/lib/enrolment-intelligence-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

// Personas (owner-approved mockup, 20 Nov 2026): an ideal persona per course,
// learned from people who reached a good outcome; a manager approves it and
// only approved personas score leads (Fit).

const pct = (n: number) => `${Math.round(n * 100)}%`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Bar({ label, share, tone = "bg-brand-600" }: { label: string; share: number; tone?: string }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)_44px] items-center gap-3 text-[13px]">
      <span className="truncate text-copy">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-surface-muted"><span className={`block h-full rounded-full ${tone}`} style={{ width: pct(Math.min(1, share)) }} /></span>
      <span className="text-right font-semibold tabular-nums text-copy-strong">{pct(share)}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-copy-muted">{title}</div>
      {children}
    </div>
  );
}

export default async function PersonasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage } = await supabase.rpc("can_manage_organization", { p_organization_id: organizationId });
  const manager = canManage === true;
  const [personas, intelligence] = await Promise.all([
    listCoursePersonas(supabase, organizationId),
    getEnrolmentIntelligence(createAdminClient(), organizationId),
  ]);

  const approvedCount = personas.filter((p) => p.approved_traits).length;
  const strongTotal = personas.reduce((s, p) => s + ((p.draft_traits as PersonaTraits).outcome === "strong" ? p.draft_sample_size : 0), 0);
  const allProvisional = personas.length > 0 && personas.every((p) => (p.draft_traits as PersonaTraits).outcome !== "strong");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Personas"
        description={
          <span className="text-[15px] leading-7 text-copy">
            An <strong className="font-semibold text-copy-strong">ideal persona for each course</strong>, learned from the people who reached Qualified or beyond.{" "}
            {personas.length ? (
              <>
                <strong className="font-semibold text-copy-strong">{personas.length} course{personas.length === 1 ? " has" : "s have"} enough people to learn from</strong>;{" "}
                {approvedCount ? `${approvedCount} ${approvedCount === 1 ? "is" : "are"} approved and scoring leads.` : "approve one to start Fit scores."}
              </>
            ) : "Nothing learned yet."}
          </span>
        }
        actions={manager ? (
          <div className="flex gap-2">
            <PersonaButton kind="refresh" label={personas.length ? "Re-learn all" : "Learn personas now"} primary={!personas.length} />
            {personas.length ? <PersonaButton kind="approve-all" label="Approve all drafts" primary /> : null}
          </div>
        ) : undefined}
      />

      {intelligence ? <EnrolmentIntelligenceSection data={intelligence} /> : null}

      <h2 className="pt-2 text-[18px] font-extrabold text-copy-strong">Course personas</h2>

      {!personas.length ? (
        <EmptyState
          title="No personas yet"
          description={manager ? "Learn them from your leads: each course with at least 5 people who reached Qualified or beyond gets a persona." : "A manager can learn personas from your leads."}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_400px]">
          {[0, 1].map((col) => (
            <div key={col} className="flex min-w-0 flex-col gap-4">
              {personas.filter((_, i) => i % 2 === col).map((row) => {
                const t = row.draft_traits as PersonaTraits;
                const pendingDraft = !row.approved_at || (row.draft_computed_at != null && row.draft_computed_at > row.approved_at);
                const known = t.countries.filter((c) => c.value);
                return (
                  <article key={row.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-[16px] font-bold text-copy-strong">{row.courseName}</h2>
                        <p className="text-[12.5px] text-copy-muted">
                          Learned from <strong className="text-copy">{row.draft_sample_size} people</strong> {t.outcome === "strong" ? "who paid or enrolled" : "who reached Qualified or beyond"}
                        </p>
                      </div>
                      {row.approved_traits && !pendingDraft ? (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Approved</span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{row.approved_traits ? "New draft · needs approval" : "Draft · needs approval"}</span>
                      )}
                    </div>

                    {t.channels.length ? (
                      <Section title="How they find you">{t.channels.slice(0, 3).map((c) => <Bar key={c.value} label={cap(c.value)} share={c.share} />)}</Section>
                    ) : null}
                    {t.topics.length ? (
                      <Section title="What they ask before joining">{t.topics.slice(0, 5).map((c) => <Bar key={c.value} label={cap(labelTopic(c.value))} share={c.share} tone="bg-blue-600" />)}</Section>
                    ) : null}
                    <Section title="Where they're from">
                      <p className="text-[13px] text-copy">
                        {known.length ? known.slice(0, 4).map((c) => `${c.value.replace(/\b\w/g, (x) => x.toUpperCase())} ${pct(c.share)}`).join(" · ") : "Mostly not recorded yet."}
                      </p>
                    </Section>
                    <Section title="On the website">
                      <p className="text-[13px] text-copy-muted">
                        {t.websiteSample >= 3
                          ? `${pct(t.behaviour.sawPrice)} looked at prices · ${pct(t.behaviour.cameBack)} came back · ${pct(t.behaviour.readTwoMinutes)} read 2+ minutes (${t.websiteSample} linked to visits)`
                          : "Too few linked to website visits yet (course links will fix this)."}
                      </p>
                    </Section>
                    <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-3 dark:border-brand-900/50 dark:bg-brand-950/20">
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">What this means for sales</div>
                      <p className="mt-1 text-[13.5px] leading-5 text-copy-strong">{personaAdvice(t)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {manager && pendingDraft ? <PersonaButton kind="approve" personaId={row.id} label="Approve persona" primary /> : null}
                      <Link href={`/leads?course=${encodeURIComponent(row.courseName)}`} className="btn-secondary">See their leads</Link>
                      <span className="ml-auto text-[12px] text-copy-subtle">{row.draft_computed_at ? `Learned ${new Date(row.draft_computed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}

          <aside className="flex flex-col gap-4">
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">How the Fit score works</h2>
              <p className="mt-2 text-[13px] leading-5 text-copy">Each lead is compared with the approved persona of the course they want. Points for each match, weighted by how common it is among people who joined:</p>
              <dl className="mt-2">
                {[["Asked what joiners ask", "up to 25"], ["Came through the same channel", "up to 15"], ["From the same country", "up to 20"], ["Looked at prices · came back · read in depth · reached out", "up to 40"]].map(([a, b]) => (
                  <div key={a} className="flex justify-between gap-3 border-t border-line py-2 text-[13px] first:border-t-0">
                    <dt className="text-copy">{a}</dt><dd className="shrink-0 font-semibold text-copy-strong">{b}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[12.5px] text-copy-muted"><strong>Interest</strong> = how keen they are now. <strong>Fit</strong> = how much they look like people who join. Both show on Re-engaged and Customer 360.</p>
            </section>
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Honest about the data</h2>
              <p className="mt-2 text-[13px] leading-5 text-copy">
                {allProvisional
                  ? <>Few people have paid or enrolled so far, so every persona is <strong>provisional</strong>: it also learns from Qualified and High-intent leads. Once a course has {MIN_STRONG} real conversions, it learns from those only.</>
                  : <>{strongTotal} real conversions feed the personas marked as learned from people who paid or enrolled.</>}{" "}
                Your past-student list will make this much sharper.
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
