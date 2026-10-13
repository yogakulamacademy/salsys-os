import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Clock3,
  ContactRound,
  MessageCircle,
  Phone,
  Sparkles,
  TimerReset,
  UserRound,
  UsersRound,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';

type NumberLike = number | string | null;

type OverviewRow = {
  accessible_leads: NumberLike;
  contacted_leads: NumberLike;
  never_contacted_leads: NumberLike;
  total_contacts: NumberLike;
  outbound_contacts: NumberLike;
  inbound_contacts: NumberLike;
  successful_contacts: NumberLike;
  enrolled_leads: NumberLike;
  median_first_response_minutes: NumberLike;
  median_first_inbound_response_minutes: NumberLike;
  avg_attempts_before_enrollment: NumberLike;
  avg_contacts_before_enrollment: NumberLike;
  avg_contacts_before_first_payment: NumberLike;
};

type EmployeeRow = {
  employee_user_id: string;
  employee_name: string | null;
  contacted_leads: NumberLike;
  total_contacts: NumberLike;
  successful_contacts: NumberLike;
  successful_contact_rate_pct: NumberLike;
  phone_contacts: NumberLike;
  whatsapp_contacts: NumberLike;
  total_call_seconds: NumberLike;
  contacted_leads_later_enrolled: NumberLike;
  last_contact_at: string | null;
};

type ChannelRow = {
  method: string;
  contacted_leads: NumberLike;
  total_contacts: NumberLike;
  outbound_contacts: NumberLike;
  inbound_contacts: NumberLike;
  successful_contact_rate_pct: NumberLike;
  contacted_leads_later_enrolled: NumberLike;
};

type OutcomeRow = {
  outcome: string;
  leads: NumberLike;
  total_contacts: NumberLike;
  leads_later_enrolled: NumberLike;
  later_enrolled_observed_pct: NumberLike;
};

type TimeRow = {
  iso_day_of_week: NumberLike;
  day_name: string | null;
  hour_of_day: NumberLike;
  contacted_leads: NumberLike;
  total_contacts: NumberLike;
  successful_contacts: NumberLike;
  successful_contact_rate_pct: NumberLike;
};

type LeadRow = {
  lead_id: string;
  lead_code: string;
  lead_name: string | null;
  owner_name: string | null;
  current_stage: string;
  course_name: string | null;
  country: string | null;
  total_contacts: NumberLike;
  outbound_contacts: NumberLike;
  inbound_contacts: NumberLike;
  successful_contacts: NumberLike;
  first_response_minutes: NumberLike;
  last_contact_at: string | null;
  is_enrolled: boolean | null;
};

export default async function ScopedContactIntelligencePage({
  organizationId,
}: {
  organizationId: string;
}) {
  const supabase = await createClient();

  const [
    overviewResult,
    employeeResult,
    channelResult,
    outcomeResult,
    timeResult,
    highTouchResult,
    neverContactedResult,
  ] = await Promise.all([
    supabase
      .from('v_contact_intelligence_overview_workspace')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('v_contact_intelligence_employee_workspace')
      .select('*')
      .eq('organization_id', organizationId)
      .order('total_contacts', { ascending: false }),
    supabase
      .from('v_contact_intelligence_channel_workspace')
      .select('*')
      .eq('organization_id', organizationId)
      .order('total_contacts', { ascending: false }),
    supabase
      .from('v_contact_intelligence_outcome_workspace')
      .select('*')
      .eq('organization_id', organizationId)
      .order('total_contacts', { ascending: false }),
    supabase
      .from('v_contact_intelligence_time_ist_workspace')
      .select('*')
      .eq('organization_id', organizationId)
      .order('total_contacts', { ascending: false })
      .limit(8),
    supabase
      .from('v_contact_intelligence_lead_workspace')
      .select(
        'lead_id,lead_code,lead_name,owner_name,current_stage,course_name,country,total_contacts,outbound_contacts,inbound_contacts,successful_contacts,first_response_minutes,last_contact_at,is_enrolled',
      )
      .eq('organization_id', organizationId)
      .gt('total_contacts', 0)
      .order('total_contacts', { ascending: false })
      .limit(8),
    supabase
      .from('v_contact_intelligence_lead_workspace')
      .select(
        'lead_id,lead_code,lead_name,owner_name,current_stage,course_name,country,total_contacts,outbound_contacts,inbound_contacts,successful_contacts,first_response_minutes,last_contact_at,is_enrolled',
      )
      .eq('organization_id', organizationId)
      .eq('total_contacts', 0)
      .order('lead_created_at', { ascending: false })
      .limit(8),
  ]);

  const errors = [
    ['Overview', overviewResult.error],
    ['Employee intelligence', employeeResult.error],
    ['Channel intelligence', channelResult.error],
    ['Outcome intelligence', outcomeResult.error],
    ['Contact timing', timeResult.error],
    ['High-touch leads', highTouchResult.error],
    ['Never-contacted leads', neverContactedResult.error],
  ]
    .filter(([, error]) => Boolean(error))
    .map(
      ([label, error]) =>
        `${label}: ${(error as { message?: string })?.message ?? 'Unknown error'}`,
    );

  const overview = (overviewResult.data ?? null) as OverviewRow | null;
  const employees = (employeeResult.data ?? []) as EmployeeRow[];
  const channels = (channelResult.data ?? []) as ChannelRow[];
  const outcomes = (outcomeResult.data ?? []) as OutcomeRow[];
  const timeSlots = (timeResult.data ?? []) as TimeRow[];
  const highTouchLeads = (highTouchResult.data ?? []) as LeadRow[];
  const neverContactedLeads = (neverContactedResult.data ?? []) as LeadRow[];

  const accessibleLeads = numberValue(overview?.accessible_leads);
  const contactedLeads = numberValue(overview?.contacted_leads);
  const totalContacts = numberValue(overview?.total_contacts);
  const successfulContacts = numberValue(overview?.successful_contacts);

  return (
    <>
      <PageHeader
        title="Contact Intelligence"
        description="Organization-scoped admissions contact activity, response speed, channel mix and lead-touch patterns."
        actions={
          <Link href="/team-performance" className="btn-secondary">
            <UsersRound size={15} />
            Team Performance
          </Link>
        }
      />

      <div className="mb-5 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-5 text-sky-800">
        <strong>Tenant-safe Reports view.</strong>{' '}
        Every query is explicitly scoped to the active organization. “Later enrolled” is observational journey data, not sole-credit attribution.
      </div>

      {errors.length > 0 && (
        <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-bold">Some Contact Intelligence data could not be loaded.</div>
          <div className="mt-2 space-y-1 text-xs">
            {errors.map((error) => <div key={error}>{error}</div>)}
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Contact coverage"
          value={`${percentage(contactedLeads, accessibleLeads).toFixed(1)}%`}
          sub={`${contactedLeads} of ${accessibleLeads} organization leads`}
          icon={<ContactRound size={18} />}
        />
        <KpiCard
          label="Successful outcomes"
          value={`${percentage(successfulContacts, totalContacts).toFixed(1)}%`}
          sub={`${successfulContacts} of ${totalContacts} recorded contacts`}
          icon={<Sparkles size={18} />}
        />
        <KpiCard
          label="Median first response"
          value={formatMinutes(overview?.median_first_response_minutes)}
          sub="Lead created → first outbound contact"
          icon={<TimerReset size={18} />}
        />
        <KpiCard
          label="Median reply response"
          value={formatMinutes(overview?.median_first_inbound_response_minutes)}
          sub="First inbound → next outbound contact"
          icon={<Clock3 size={18} />}
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SmallMetric
          label="Never contacted"
          value={numberValue(overview?.never_contacted_leads)}
          detail="Organization leads without a structured contact"
        />
        <SmallMetric
          label="Outbound contacts"
          value={numberValue(overview?.outbound_contacts)}
          detail="Recorded attempts from admissions"
        />
        <SmallMetric
          label="Inbound contacts"
          value={numberValue(overview?.inbound_contacts)}
          detail="Recorded replies and inbound touches"
        />
        <SmallMetric
          label="Known enrolled leads"
          value={numberValue(overview?.enrolled_leads)}
          detail="Enrollment known to the scoped analytics model"
        />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="card-pad">
          <SectionHeading
            eyebrow="Admissions team"
            title="Employee contact activity"
            detail="Attributed human contacts within the active organization."
          />

          {employees.length === 0 ? (
            <EmptyState text="No employee-attributed contact activity yet." />
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[10px] font-black uppercase tracking-[.12em] text-slate-400">
                    <th className="px-3 py-3">Employee</th>
                    <th className="px-3 py-3 text-right">Leads</th>
                    <th className="px-3 py-3 text-right">Contacts</th>
                    <th className="px-3 py-3 text-right">Successful</th>
                    <th className="px-3 py-3 text-right">Phone</th>
                    <th className="px-3 py-3 text-right">WhatsApp</th>
                    <th className="px-3 py-3 text-right">Later enrolled*</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((row) => (
                    <tr key={row.employee_user_id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500">
                            <UserRound size={16} />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-800">{row.employee_name || 'Unknown employee'}</div>
                            <div className="mt-0.5 text-[11px] text-slate-400">Last contact {formatDateTime(row.last_contact_at)}</div>
                          </div>
                        </div>
                      </td>
                      <NumberCell value={row.contacted_leads} />
                      <NumberCell value={row.total_contacts} />
                      <td className="px-3 py-4 text-right">
                        <div className="font-bold text-slate-800">{numberValue(row.successful_contacts)}</div>
                        <div className="mt-0.5 text-[10px] font-semibold text-emerald-600">{numberValue(row.successful_contact_rate_pct).toFixed(1)}%</div>
                      </td>
                      <NumberCell value={row.phone_contacts} />
                      <NumberCell value={row.whatsapp_contacts} />
                      <NumberCell value={row.contacted_leads_later_enrolled} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card-pad">
          <SectionHeading
            eyebrow="Journey benchmarks"
            title="Response & conversion context"
            detail="Organization-scoped operational baselines from recorded contact history."
          />
          <div className="mt-5 space-y-3">
            <BenchmarkRow label="Avg. attempts before enrollment" value={formatDecimal(overview?.avg_attempts_before_enrollment)} />
            <BenchmarkRow label="Avg. contacts before enrollment" value={formatDecimal(overview?.avg_contacts_before_enrollment)} />
            <BenchmarkRow label="Avg. contacts before first payment" value={formatDecimal(overview?.avg_contacts_before_first_payment)} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <div className="card-pad">
          <SectionHeading eyebrow="Channel mix" title="Contact methods" detail="Volume and observed outcomes by channel." />
          <div className="mt-5 space-y-3">
            {channels.length === 0 ? (
              <EmptyState text="No channel data available yet." />
            ) : channels.map((row) => (
              <div key={row.method} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ChannelIcon method={row.method} />
                    <div>
                      <div className="text-sm font-black text-slate-800">{pretty(row.method)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{numberValue(row.contacted_leads)} leads</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-slate-900">{numberValue(row.total_contacts)}</div>
                    <div className="text-[10px] font-semibold text-emerald-600">{numberValue(row.successful_contact_rate_pct).toFixed(1)}% successful</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Outbound" value={row.outbound_contacts} />
                  <MiniStat label="Inbound" value={row.inbound_contacts} />
                  <MiniStat label="Later enrolled*" value={row.contacted_leads_later_enrolled} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-pad">
          <SectionHeading eyebrow="Outcome mix" title="What happened after contact" detail="Structured contact outcomes within the active organization." />
          <div className="mt-5 space-y-3">
            {outcomes.length === 0 ? (
              <EmptyState text="No outcome data available yet." />
            ) : outcomes.map((row) => (
              <div key={row.outcome} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 p-4">
                <div>
                  <div className="text-sm font-bold text-slate-800">{pretty(row.outcome)}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{numberValue(row.leads)} leads · {numberValue(row.leads_later_enrolled)} later enrolled*</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-slate-900">{numberValue(row.total_contacts)}</div>
                  <div className="text-[10px] text-slate-400">{numberValue(row.later_enrolled_observed_pct).toFixed(1)}% observed</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <div className="card-pad">
          <SectionHeading eyebrow="India time" title="Most active contact windows" detail="Highest-volume recorded day/hour combinations." />
          <div className="mt-5 space-y-3">
            {timeSlots.length === 0 ? (
              <EmptyState text="Not enough contact-time data yet." />
            ) : timeSlots.map((row, index) => (
              <div key={`${row.iso_day_of_week}-${row.hour_of_day}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-xs font-black text-slate-500">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800">{row.day_name || 'Unknown'} · {formatHour(row.hour_of_day)}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{numberValue(row.contacted_leads)} leads · {numberValue(row.successful_contacts)} successful</div>
                </div>
                <div className="text-right text-base font-black text-slate-900">{numberValue(row.total_contacts)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-pad">
          <SectionHeading eyebrow="Lead journeys" title="High-touch leads" detail="Leads with the most structured contacts in this organization." />
          {highTouchLeads.length === 0 ? (
            <EmptyState text="No contacted leads available yet." />
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[10px] font-black uppercase tracking-[.12em] text-slate-400">
                    <th className="px-3 py-3">Lead</th>
                    <th className="px-3 py-3">Stage</th>
                    <th className="px-3 py-3 text-right">Contacts</th>
                    <th className="px-3 py-3 text-right">Outbound</th>
                    <th className="px-3 py-3 text-right">Inbound</th>
                  </tr>
                </thead>
                <tbody>
                  {highTouchLeads.map((row) => (
                    <tr key={row.lead_id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-4">
                        <div className="font-bold text-slate-800">{row.lead_name || row.lead_code}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">{row.lead_code}{row.course_name ? ` · ${row.course_name}` : ''}</div>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-600">{pretty(row.current_stage)}</td>
                      <NumberCell value={row.total_contacts} />
                      <NumberCell value={row.outbound_contacts} />
                      <NumberCell value={row.inbound_contacts} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 card-pad">
        <SectionHeading eyebrow="Coverage gap" title="Recently created leads with no structured contact" detail="Read-only reporting queue for the active organization." />
        {neverContactedLeads.length === 0 ? (
          <EmptyState text="Every organization lead currently has at least one structured contact." />
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {neverContactedLeads.map((row) => (
              <div key={row.lead_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-800">{row.lead_name || row.lead_code}</div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-400">{row.lead_code}</div>
                  </div>
                  <div className="grid h-8 w-8 place-items-center rounded-xl bg-orange-50 text-orange-600"><Activity size={15} /></div>
                </div>
                <div className="mt-4 text-xs text-slate-500">{pretty(row.current_stage)}{row.country ? ` · ${row.country}` : ''}</div>
                <div className="mt-2 text-[11px] text-slate-400">Owner: {row.owner_name || 'Unassigned'}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">
          * “Later enrolled” means a known enrollment occurred after a recorded touch. It does not assign exclusive conversion credit.
        </div>
      </section>
    </>
  );
}

function KpiCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="card-pad">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</div>
          <div className="mt-2 text-[11px] leading-5 text-slate-400">{sub}</div>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand">{icon}</div>
      </div>
    </div>
  );
}

function SmallMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-black text-slate-900">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-slate-400">{detail}</div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <div className="section-title mt-1">{title}</div>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

function BenchmarkRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-4">
      <div className="text-sm font-bold text-slate-800">{label}</div>
      <div className="shrink-0 text-base font-black text-slate-900">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: NumberLike }) {
  return (
    <div className="rounded-xl bg-white px-2 py-2">
      <div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-800">{numberValue(value)}</div>
    </div>
  );
}

function NumberCell({ value }: { value: NumberLike }) {
  return <td className="px-3 py-4 text-right text-sm font-bold text-slate-700">{numberValue(value)}</td>;
}

function ChannelIcon({ method }: { method: string }) {
  const className = method === 'whatsapp'
    ? 'bg-emerald-50 text-emerald-700'
    : method === 'phone' || method === 'sms'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-600';

  return (
    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${className}`}>
      {method === 'whatsapp' ? <MessageCircle size={16} /> : method === 'phone' || method === 'sms' ? <Phone size={16} /> : <Activity size={16} />}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">{text}</div>;
}

function numberValue(value: NumberLike | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function formatDecimal(value: NumberLike | undefined) {
  return value == null ? '—' : numberValue(value).toFixed(1);
}

function formatMinutes(value: NumberLike | undefined) {
  if (value == null) return '—';
  const minutes = numberValue(value);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) {
    const hours = minutes / 60;
    return `${hours.toFixed(hours >= 10 ? 0 : 1)} hr`;
  }
  const days = minutes / 1440;
  return `${days.toFixed(days >= 10 ? 0 : 1)} d`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function formatHour(value: NumberLike | undefined) {
  const hour = numberValue(value);
  const date = new Date(Date.UTC(2026, 0, 1, hour, 0, 0));
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    hour12: true,
    timeZone: 'UTC',
  }).format(date);
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
