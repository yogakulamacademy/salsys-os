import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Gauge,
  ShieldAlert,
  UsersRound,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { getAdmissionsSnapshot } from '@/lib/admissions-data';

type SlaOverviewRow = {
  leads_7d: number | string | null;
  responded_7d: number | string | null;
  responded_on_time_7d: number | string | null;
  responded_late_7d: number | string | null;
  breached_now: number | string | null;
  open_now: number | string | null;
  awaiting_human_response: number | string | null;
  avg_response_minutes: number | string | null;
  median_response_minutes: number | string | null;
  p90_response_minutes: number | string | null;
  on_time_response_rate_percent: number | string | null;
};

type OwnerWorkloadRow = {
  owner_user_id: string | null;
  owner_name: string | null;
  owner_role: string | null;
  active_leads: number | string | null;
  needs_reply: number | string | null;
  overdue_followups: number | string | null;
  payment_pending: number | string | null;
  critical_priority: number | string | null;
  high_priority: number | string | null;
  action_load: number | string | null;
};

type BatchCapacityRow = {
  batch_id: string;
  course_name: string | null;
  batch_code: string | null;
  location: string | null;
  start_date: string | null;
  capacity: number | string | null;
  enrolled_count: number | string | null;
  payment_pending: number | string | null;
  hot_prospects: number | string | null;
  needs_reply: number | string | null;
  calculated_seats_remaining: number | string | null;
  capacity_status: string | null;
};

export default async function SalesPerformancePage() {
  const snapshot = await getAdmissionsSnapshot();
  const sla = snapshot.slaOverview as SlaOverviewRow | null;
  const owners = snapshot.ownerWorkload as OwnerWorkloadRow[];
  const batches = snapshot.batchCapacity as BatchCapacityRow[];

  const responded = numberValue(sla?.responded_7d);
  const breached = numberValue(sla?.breached_now);
  const awaiting = numberValue(sla?.awaiting_human_response);
  const openSla = numberValue(sla?.open_now);
  const onTime = responded > 0 ? numberValue(sla?.on_time_response_rate_percent) : null;
  const totalActionLoad = owners.reduce((sum, row) => sum + numberValue(row.action_load), 0);
  const overloadedOwner = owners
    .slice()
    .sort((left, right) => numberValue(right.action_load) - numberValue(left.action_load))[0] ?? null;
  const pressureBatch = batches
    .filter((row) => row.calculated_seats_remaining != null)
    .slice()
    .sort((left, right) => numberValue(left.calculated_seats_remaining) - numberValue(right.calculated_seats_remaining))[0] ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales Command Center · Performance"
        title="Sales performance"
        description="Management intelligence for response speed, team workload and upcoming batch pressure. Operational records stay in Work Queue and Opportunities."
        actions={
          <Link href="/crm" className="btn-secondary">
            <ArrowLeft size={14} /> Command Center
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Gauge size={16} />}
          label="On-time response"
          value={onTime == null ? '—' : `${formatDecimal(onTime)}%`}
          note={responded > 0 ? `${responded.toLocaleString('en-IN')} measured responses` : 'Baseline not available yet'}
          tone={onTime != null && onTime < 80 ? 'attention' : 'neutral'}
        />
        <Metric
          icon={<Clock3 size={16} />}
          label="Median first response"
          value={responded > 0 ? formatMinutes(sla?.median_response_minutes) : '—'}
          note={`${openSla.toLocaleString('en-IN')} currently open`}
        />
        <Metric
          icon={<ShieldAlert size={16} />}
          label="Breached now"
          value={breached.toLocaleString('en-IN')}
          note={`${awaiting.toLocaleString('en-IN')} awaiting human response`}
          tone={breached > 0 ? 'attention' : 'neutral'}
        />
        <Metric
          icon={<UsersRound size={16} />}
          label="Team action load"
          value={totalActionLoad.toLocaleString('en-IN')}
          note={overloadedOwner ? `${overloadedOwner.owner_name || 'Unassigned'} carries the largest current load` : 'No workload evidence available'}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <div className="eyebrow">Team workload</div>
              <h2 className="section-title mt-1">Where action is concentrated</h2>
              <p className="mt-1 text-[12px] text-copy-subtle">Compare active opportunities with reply, overdue and payment pressure instead of using lead count alone.</p>
            </div>
            <Link href="/work-queue" className="text-[11px] font-semibold text-brand-700 hover:underline">Open work queue</Link>
          </div>

          {owners.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead className="border-b border-line bg-surface-soft">
                  <tr>
                    <Header>Owner</Header>
                    <Header>Active</Header>
                    <Header>Needs reply</Header>
                    <Header>Overdue</Header>
                    <Header>Payment</Header>
                    <Header>Priority</Header>
                    <Header>Action load</Header>
                  </tr>
                </thead>
                <tbody>
                  {owners.map((row) => {
                    const priority = numberValue(row.critical_priority) + numberValue(row.high_priority);
                    const load = numberValue(row.action_load);
                    return (
                      <tr key={row.owner_user_id || 'unassigned'} className="border-b border-line last:border-b-0 hover:bg-surface-soft/70">
                        <td className="px-4 py-3.5">
                          <div className="text-[12px] font-semibold text-copy-strong">{row.owner_name || 'Unassigned'}</div>
                          <div className="mt-0.5 text-[10px] text-copy-subtle">{pretty(row.owner_role || 'No role')}</div>
                        </td>
                        <Cell value={numberValue(row.active_leads)} />
                        <Cell value={numberValue(row.needs_reply)} attention={numberValue(row.needs_reply) > 0} />
                        <Cell value={numberValue(row.overdue_followups)} attention={numberValue(row.overdue_followups) > 0} />
                        <Cell value={numberValue(row.payment_pending)} />
                        <Cell value={priority} attention={priority > 0} />
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${load > 8 ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>
                            {load.toLocaleString('en-IN')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="No team workload evidence is available yet." />
          )}
        </section>

        <section className="rounded-panel border border-line bg-surface p-5 shadow-xs">
          <div className="eyebrow">Management signal</div>
          <h2 className="section-title mt-1">What deserves attention</h2>
          <div className="mt-4 space-y-3">
            <Signal
              title={breached > 0 ? `${breached} response deadlines are breached` : 'Response SLA has no current breach'}
              detail={breached > 0 ? 'Open the reply queue before adding more acquisition volume.' : 'Keep watching the open response queue as new demand arrives.'}
              href="/work-queue?tab=reply"
              action="Review replies"
              attention={breached > 0}
            />
            <Signal
              title={overloadedOwner ? `${overloadedOwner.owner_name || 'Unassigned'} has the largest action load` : 'No owner concentration detected'}
              detail={overloadedOwner ? `${numberValue(overloadedOwner.action_load)} current actions across replies, follow-ups, payments and priority work.` : 'Owner workload appears unavailable in the current snapshot.'}
              href="/opportunities?owner=unassigned"
              action="Review ownership"
              attention={Boolean(overloadedOwner && numberValue(overloadedOwner.action_load) > 8)}
            />
            <Signal
              title={pressureBatch ? `${pressureBatch.course_name || pressureBatch.batch_code || 'Upcoming batch'} has the least recorded capacity` : 'Batch pressure is not measurable yet'}
              detail={pressureBatch ? `${numberValue(pressureBatch.calculated_seats_remaining)} seats remaining · ${numberValue(pressureBatch.hot_prospects)} hot prospects.` : 'Capacity appears once course schedule data is available.'}
              href="/course-management"
              action="Open courses"
            />
          </div>
        </section>
      </section>

      <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs" id="batch-pressure">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <div className="eyebrow">Upcoming batch pressure</div>
            <h2 className="section-title mt-1">Demand versus remaining capacity</h2>
            <p className="mt-1 text-[12px] text-copy-subtle">Use capacity, payment-stage demand and hot prospects together. A hot prospect is not treated as an enrollment.</p>
          </div>
          <Link href="/course-management" className="text-[11px] font-semibold text-brand-700 hover:underline">Course management</Link>
        </div>

        {batches.length ? (
          <div className="divide-y divide-line">
            {batches.slice(0, 10).map((row) => {
              const capacity = numberValue(row.capacity);
              const enrolled = numberValue(row.enrolled_count);
              const remaining = row.calculated_seats_remaining == null ? null : numberValue(row.calculated_seats_remaining);
              const utilization = capacity > 0 ? Math.min(100, Math.max(0, (enrolled / capacity) * 100)) : 0;
              return (
                <div key={row.batch_id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(260px,1.4fr)_minmax(220px,.8fr)_90px_90px_100px] lg:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-copy-strong">{row.course_name || row.batch_code || 'Batch'}</div>
                    <div className="mt-1 text-[11px] text-copy-subtle">{[row.batch_code, row.location, formatDate(row.start_date)].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-copy-subtle"><span>Observed enrollment</span><span>{enrolled}/{capacity || '—'}</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-brand-600" style={{ width: `${utilization}%` }} /></div>
                  </div>
                  <Mini label="Payment" value={numberValue(row.payment_pending)} />
                  <Mini label="Hot" value={numberValue(row.hot_prospects)} />
                  <Mini label="Seats open" value={remaining} />
                </div>
              );
            })}
          </div>
        ) : (
          <Empty text="No upcoming batch capacity evidence is available yet." />
        )}
      </section>
    </div>
  );
}

function Metric({ icon, label, value, note, tone = 'neutral' }: { icon: React.ReactNode; label: string; value: string; note: string; tone?: 'neutral' | 'attention' }) {
  return (
    <div className={`rounded-panel border bg-surface p-4 shadow-xs ${tone === 'attention' ? 'border-amber-200' : 'border-line'}`}>
      <div className="flex items-center justify-between gap-3 text-copy-subtle"><span className="text-[11px] font-semibold">{label}</span>{icon}</div>
      <div className={`mt-2 text-[26px] font-semibold tracking-tight ${tone === 'attention' ? 'text-amber-700' : 'text-copy-strong'}`}>{value}</div>
      <div className="mt-1 text-[10px] leading-4 text-copy-subtle">{note}</div>
    </div>
  );
}

function Signal({ title, detail, href, action, attention = false }: { title: string; detail: string; href: string; action: string; attention?: boolean }) {
  return (
    <Link href={href} className={`block rounded-ui border p-3.5 transition hover:bg-surface-soft ${attention ? 'border-amber-200 bg-amber-50/50' : 'border-line bg-surface-soft/50'}`}>
      <div className="text-[12px] font-semibold text-copy-strong">{title}</div>
      <div className="mt-1 text-[11px] leading-5 text-copy-muted">{detail}</div>
      <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-700">{action} <ArrowRight size={11} /></div>
    </Link>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-[10px] font-semibold text-copy-subtle">{children}</th>;
}

function Cell({ value, attention = false }: { value: number; attention?: boolean }) {
  return <td className={`px-4 py-3.5 text-[12px] font-medium ${attention ? 'text-amber-700' : 'text-copy-muted'}`}>{value.toLocaleString('en-IN')}</td>;
}

function Mini({ label, value }: { label: string; value: number | null }) {
  return <div><div className="text-[10px] text-copy-subtle">{label}</div><div className="mt-1 text-[12px] font-semibold text-copy-strong">{value == null ? '—' : value.toLocaleString('en-IN')}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="px-5 py-8 text-[12px] text-copy-muted">{text}</div>;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDecimal(value: number) {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

function formatMinutes(value: number | string | null | undefined) {
  const minutes = numberValue(value);
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return `${hours.toLocaleString('en-IN', { maximumFractionDigits: 1 })}h`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function pretty(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
