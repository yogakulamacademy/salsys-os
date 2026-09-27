import Link from 'next/link';

import {
  AlarmClock,
  ArrowRight,
  BadgeIndianRupee,
  CalendarClock,
  Flame,
  Megaphone,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import {
  completeAdmissionFollowUpAction,
  snoozeAdmissionFollowUpAction,
} from '@/app/admissions/actions';

type FollowUpRow = {
  task_id: string;
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  title: string | null;
  due_at: string | null;
  current_stage: string | null;
  intent: string | null;
  current_contact_channel: string | null;
};

type JourneyRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string | null;
  behaviour_temperature: string | null;
  engagement_score: number | string | null;
  total_sessions: number | string | null;
  sessions_after_lead: number | string | null;
  is_reengaged: boolean | null;
  last_visit_at: string | null;
  last_session_source: string | null;
  behaviour_reason: string | null;
};

type RevenueRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string | null;
  potential_value: number | string | null;
  currency: string | null;
  net_paid: number | string | null;
  outstanding_balance: number | string | null;
  payment_status: string | null;
};

type PaidMediaRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  platform_label: string | null;
  campaign_name: string | null;
  current_stage: string | null;
  behaviour_temperature: string | null;
  engagement_score: number | string | null;
  payment_status: string | null;
  revenue_inr: number | string | null;
  revenue_usd: number | string | null;
  allocated_acquisition_cost: number | string | null;
  acquisition_currency: string | null;
  country: string | null;
  first_paid_touch_at: string | null;
};

type NewLeadRow = {
  id: string;
  lead_code: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  current_stage: string | null;
  first_touch_source: string | null;
  preferred_location: string | null;
  created_at: string | null;
};

type SearchParams = {
  notice?: string | string[];
  error?: string | string[];
};

export default async function AdmissionsDeskPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved =
    (await searchParams) ?? {};

  const notice = one(resolved.notice);
  const error = one(resolved.error);
  const supabase = await createClient();

  const {
    startUtc,
    endUtc,
    todayLabel,
  } = indiaDayBoundsUtc();

  const [
    followupsResult,
    hotJourneyResult,
    reengagedResult,
    paymentPendingResult,
    hotPaidMediaResult,
    newLeadsResult,
  ] = await Promise.all([
    supabase
      .from('v_followups_due')
      .select('*')
      .lte('due_at', endUtc)
      .order('due_at', { ascending: true })
      .limit(100),

    supabase
      .from('v_lead_journey_intelligence')
      .select('*')
      .eq('behaviour_temperature', 'hot')
      .neq('current_stage', 'enrolled')
      .order('engagement_score', { ascending: false })
      .limit(12),

    supabase
      .from('v_lead_journey_intelligence')
      .select('*')
      .eq('is_reengaged', true)
      .neq('current_stage', 'enrolled')
      .order('last_visit_at', {
        ascending: false,
        nullsFirst: false,
      })
      .limit(12),

    supabase
      .from('v_lead_revenue_status')
      .select('*')
      .eq('current_stage', 'payment_pending')
      .order('outstanding_balance', {
        ascending: false,
        nullsFirst: false,
      })
      .limit(20),

    supabase
      .from('v_paid_media_leads_ui')
      .select('*')
      .eq('behaviour_temperature', 'hot')
      .neq('current_stage', 'enrolled')
      .order('engagement_score', {
        ascending: false,
        nullsFirst: false,
      })
      .limit(12),

    supabase
      .from('leads')
      .select(
        'id,lead_code,display_name,first_name,last_name,current_stage,first_touch_source,preferred_location,created_at'
      )
      .eq('current_stage', 'new')
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  const errors = [
    followupsResult.error,
    hotJourneyResult.error,
    reengagedResult.error,
    paymentPendingResult.error,
    hotPaidMediaResult.error,
    newLeadsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(
      `Unable to load Admissions Desk: ${errors
        .map((error) => error?.message)
        .join(' | ')}`
    );
  }

  const followups =
    (followupsResult.data ?? []) as FollowUpRow[];

  const hotJourney =
    (hotJourneyResult.data ?? []) as JourneyRow[];

  const reengaged =
    (reengagedResult.data ?? []) as JourneyRow[];

  const paymentPending =
    (paymentPendingResult.data ?? []) as RevenueRow[];

  const hotPaidMedia =
    (hotPaidMediaResult.data ?? []) as PaidMediaRow[];

  const newLeads =
    (newLeadsResult.data ?? []) as NewLeadRow[];

  const overdue = followups.filter((row) =>
    Boolean(
      row.due_at &&
      new Date(row.due_at).getTime() <
        new Date(startUtc).getTime()
    )
  );

  const dueToday = followups.filter((row) => {
    if (!row.due_at) return false;

    const time = new Date(row.due_at).getTime();

    return (
      time >= new Date(startUtc).getTime() &&
      time <= new Date(endUtc).getTime()
    );
  });

  const priorityLeadIds = new Set<string>();

  for (const row of overdue) {
    if (row.lead_id) priorityLeadIds.add(row.lead_id);
  }

  for (const row of hotJourney) {
    if (row.lead_id) priorityLeadIds.add(row.lead_id);
  }

  for (const row of paymentPending) {
    if (row.lead_id) priorityLeadIds.add(row.lead_id);
  }

  for (const row of reengaged) {
    if (row.lead_id) priorityLeadIds.add(row.lead_id);
  }

  const outstandingInr = paymentPending
    .filter(
      (row) =>
        row.currency?.toUpperCase() === 'INR'
    )
    .reduce(
      (total, row) =>
        total + toNumber(row.outstanding_balance),
      0
    );

  const outstandingUsd = paymentPending
    .filter(
      (row) =>
        row.currency?.toUpperCase() === 'USD'
    )
    .reduce(
      (total, row) =>
        total + toNumber(row.outstanding_balance),
      0
    );

  return (
    <>
      <PageHeader
        title="Admissions Desk"
        description={`Your daily admissions workspace for ${todayLabel}: follow-ups, hot leads, paid-media opportunities, payment-pending prospects and re-engaged visitors.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/follow-ups"
              className="btn-secondary"
            >
              <CalendarClock size={16} />
              All follow-ups
            </Link>

            <Link
              href="/paid-media-leads"
              className="btn-secondary"
            >
              <Megaphone size={16} />
              Paid media
            </Link>
          </div>
        }
      />

      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {notice === 'followup-completed'
            ? 'Follow-up completed.'
            : notice === 'followup-snoozed'
              ? 'Follow-up snoozed until tomorrow at 10:00 AM.'
              : 'Admissions Desk updated.'}
        </div>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          icon={<AlarmClock size={17} />}
          label="Overdue follow-ups"
          value={formatNumber(overdue.length)}
          sub="Needs action first"
          emphasis={overdue.length > 0}
        />

        <MetricCard
          icon={<CalendarClock size={17} />}
          label="Due today"
          value={formatNumber(dueToday.length)}
          sub="Scheduled follow-ups"
        />

        <MetricCard
          icon={<Flame size={17} />}
          label="Hot leads"
          value={formatNumber(hotJourney.length)}
          sub="Based on website behaviour"
        />

        <MetricCard
          icon={<RefreshCw size={17} />}
          label="Re-engaged"
          value={formatNumber(reengaged.length)}
          sub="Returned after becoming a lead"
        />

        <MetricCard
          icon={<BadgeIndianRupee size={17} />}
          label="Payment pending"
          value={formatNumber(paymentPending.length)}
          sub={`${formatMoney(
            outstandingInr,
            'INR'
          )} + ${formatMoney(
            outstandingUsd,
            'USD'
          )} outstanding`}
        />

        <MetricCard
          icon={<Sparkles size={17} />}
          label="Needs attention"
          value={formatNumber(priorityLeadIds.size)}
          sub="Unique priority leads"
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <QueueCard
          title="Overdue follow-ups"
          description="Work these first. Old follow-ups are the easiest place for warm leads to get lost."
          empty="No overdue follow-ups."
          action={
            <Link
              href="/follow-ups"
              className="text-xs font-bold text-brand"
            >
              Open follow-ups
            </Link>
          }
        >
          {overdue.slice(0, 10).map((row) => (
            <FollowUpActionRow
              key={row.task_id}
              row={row}
              tone="urgent"
            />
          ))}
        </QueueCard>

        <QueueCard
          title="Due today"
          description="Follow-ups scheduled for today in India time."
          empty="Nothing else due today."
        >
          {dueToday.slice(0, 10).map((row) => (
            <FollowUpActionRow
              key={row.task_id}
              row={row}
            />
          ))}
        </QueueCard>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <QueueCard
          title="Hot leads"
          description="High website engagement that may justify immediate admissions follow-up."
          empty="No hot leads right now."
          action={
            <Link
              href="/re-engaged"
              className="text-xs font-bold text-brand"
            >
              Journey intelligence
            </Link>
          }
        >
          {hotJourney.map((row) => (
            <LeadQueueRow
              key={row.lead_id}
              leadId={row.lead_id}
              leadName={row.lead_name}
              leadCode={row.lead_code}
              primary={`${formatNumber(
                row.engagement_score
              )}/100 engagement score`}
              secondary={`${formatNumber(
                row.total_sessions
              )} sessions · ${pretty(
                row.current_stage || 'new'
              )}`}
              meta={row.behaviour_reason || 'Hot behaviour'}
              tone="hot"
            />
          ))}
        </QueueCard>

        <QueueCard
          title="Hot paid-media leads"
          description="High-engagement prospects whose acquisition journey started from paid media."
          empty="No hot paid-media leads right now."
          action={
            <Link
              href="/paid-media-leads?temperature=hot"
              className="text-xs font-bold text-brand"
            >
              Open paid-media queue
            </Link>
          }
        >
          {hotPaidMedia.map((row) => (
            <LeadQueueRow
              key={row.lead_id}
              leadId={row.lead_id}
              leadName={row.lead_name}
              leadCode={row.lead_code}
              primary={
                row.campaign_name ||
                row.platform_label ||
                'Paid media'
              }
              secondary={`${row.platform_label || 'Paid Media'} · ${pretty(
                row.current_stage || 'new'
              )}`}
              meta={`${row.country || 'Unknown country'} · Score ${formatNumber(
                row.engagement_score
              )}`}
              tone="paid"
            />
          ))}
        </QueueCard>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <QueueCard
          title="Payment pending"
          description="Prospects already near conversion, with remaining balance visible."
          empty="No payment-pending leads."
          action={
            <Link
              href="/pipeline"
              className="text-xs font-bold text-brand"
            >
              Open pipeline
            </Link>
          }
        >
          {paymentPending.map((row) => (
            <LeadQueueRow
              key={row.lead_id}
              leadId={row.lead_id}
              leadName={row.lead_name}
              leadCode={row.lead_code}
              primary={
                row.outstanding_balance == null ||
                !row.currency
                  ? 'Balance unavailable'
                  : `${formatMoney(
                      row.outstanding_balance,
                      row.currency
                    )} outstanding`
              }
              secondary={`${pretty(
                row.payment_status || 'unpaid'
              )} · ${formatMoney(
                row.net_paid,
                row.currency || 'USD'
              )} received`}
              meta={
                row.potential_value == null ||
                !row.currency
                  ? 'Potential value not set'
                  : `Potential ${formatMoney(
                      row.potential_value,
                      row.currency
                    )}`
              }
              tone="payment"
            />
          ))}
        </QueueCard>

        <QueueCard
          title="Re-engaged leads"
          description="Existing leads who came back to the website after enquiry."
          empty="No re-engaged leads right now."
          action={
            <Link
              href="/re-engaged"
              className="text-xs font-bold text-brand"
            >
              View all re-engaged
            </Link>
          }
        >
          {reengaged.map((row) => (
            <LeadQueueRow
              key={row.lead_id}
              leadId={row.lead_id}
              leadName={row.lead_name}
              leadCode={row.lead_code}
              primary={`${formatNumber(
                row.sessions_after_lead
              )} post-lead sessions`}
              secondary={`${pretty(
                row.last_session_source || 'direct'
              )} · Score ${formatNumber(
                row.engagement_score
              )}`}
              meta={
                row.last_visit_at
                  ? `Last visit ${formatDateTime(
                      row.last_visit_at
                    )}`
                  : 'Last visit unavailable'
              }
              tone="reengaged"
            />
          ))}
        </QueueCard>
      </section>

      <section className="card-pad mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow">
              Fresh enquiries
            </div>
            <div className="section-title mt-1">
              New leads waiting to be worked
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              New CRM leads that have not yet moved into Contacted.
            </p>
          </div>

          <Link
            href="/leads"
            className="text-xs font-bold text-brand"
          >
            All leads
          </Link>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {newLeads.length === 0 ? (
            <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400 lg:col-span-2">
              No new leads waiting right now.
            </div>
          ) : (
            newLeads.map((row) => (
              <LeadQueueRow
                key={row.id}
                leadId={row.id}
                leadName={leadName(row)}
                leadCode={row.lead_code}
                primary={
                  row.first_touch_source
                    ? `Source: ${pretty(
                        row.first_touch_source
                      )}`
                    : 'Source unavailable'
                }
                secondary={
                  row.preferred_location ||
                  'Location not selected'
                }
                meta={
                  row.created_at
                    ? `Created ${formatDateTime(
                        row.created_at
                      )}`
                    : 'Created date unavailable'
                }
              />
            ))
          )}
        </div>
      </section>
    </>
  );
}

function FollowUpActionRow({
  row,
  tone = 'default',
}: {
  row: FollowUpRow;
  tone?: 'default' | 'urgent';
}) {
  const toneClasses =
    tone === 'urgent'
      ? 'border-red-100 bg-red-50/60'
      : 'border-slate-100 bg-slate-50/70';

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClasses}`}>
      <div className="flex items-start justify-between gap-4">
        <Link
          href={`/leads/${row.lead_id}`}
          className="group min-w-0 flex-1"
        >
          <div className="truncate text-sm font-bold text-slate-800 group-hover:text-brand">
            {row.lead_name || row.lead_code || 'Lead'}
          </div>

          <div className="mt-0.5 text-[10px] font-medium text-slate-400">
            {row.lead_code || '—'}
          </div>

          <div className="mt-2 text-xs font-semibold text-slate-600">
            {row.title || 'Follow up'}
          </div>

          <div className="mt-0.5 text-[11px] text-slate-500">
            {pretty(row.current_stage || 'new')} ·{' '}
            {pretty(row.current_contact_channel || 'other')}
          </div>

          <div
            className={`mt-1 text-[10px] ${
              tone === 'urgent'
                ? 'font-bold text-red-500'
                : 'text-slate-400'
            }`}
          >
            {row.due_at
              ? `Due ${formatDateTime(row.due_at)}`
              : 'Due date unavailable'}
          </div>
        </Link>

        <Link
          href={`/leads/${row.lead_id}`}
          className="mt-1 shrink-0 text-slate-300 hover:text-brand"
          aria-label="Open lead"
        >
          <ArrowRight size={15} />
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-black/5 pt-3">
        <form action={completeAdmissionFollowUpAction}>
          <input type="hidden" name="task_id" value={row.task_id} />
          <input type="hidden" name="lead_id" value={row.lead_id} />

          <button
            type="submit"
            className="inline-flex rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-700"
          >
            Complete
          </button>
        </form>

        <form action={snoozeAdmissionFollowUpAction}>
          <input type="hidden" name="task_id" value={row.task_id} />
          <input type="hidden" name="lead_id" value={row.lead_id} />

          <button
            type="submit"
            className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Snooze to tomorrow
          </button>
        </form>

        <Link
          href={`/conversations?lead=${row.lead_id}`}
          className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
        >
          Conversation
        </Link>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  emphasis = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        emphasis
          ? 'border-red-100 bg-red-50/60'
          : 'border-slate-100 bg-white'
      }`}
    >
      <div
        className={`flex items-center gap-2 text-xs font-semibold ${
          emphasis
            ? 'text-red-500'
            : 'text-slate-400'
        }`}
      >
        {icon}
        {label}
      </div>

      <div
        className={`mt-2 text-xl font-bold ${
          emphasis
            ? 'text-red-700'
            : 'text-slate-800'
        }`}
      >
        {value}
      </div>

      <div className="mt-1 text-[11px] text-slate-400">
        {sub}
      </div>
    </div>
  );
}

function QueueCard({
  title,
  description,
  empty,
  action,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children)
    ? children
    : [children];

  const hasItems = items.some(Boolean);

  return (
    <section className="card-pad">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="section-title">
            {title}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {description}
          </p>
        </div>

        {action}
      </div>

      <div className="mt-4 space-y-2">
        {hasItems ? (
          children
        ) : (
          <div className="rounded-xl bg-slate-50 px-4 py-7 text-center text-sm text-slate-400">
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}

function LeadQueueRow({
  leadId,
  leadName,
  leadCode,
  primary,
  secondary,
  meta,
  tone = 'default',
}: {
  leadId: string;
  leadName: string | null;
  leadCode: string | null;
  primary: string;
  secondary: string;
  meta: string;
  tone?:
    | 'default'
    | 'urgent'
    | 'hot'
    | 'paid'
    | 'payment'
    | 'reengaged';
}) {
  const toneClasses: Record<string, string> = {
    default:
      'border-slate-100 bg-slate-50/70',
    urgent:
      'border-red-100 bg-red-50/60',
    hot:
      'border-orange-100 bg-orange-50/55',
    paid:
      'border-violet-100 bg-violet-50/50',
    payment:
      'border-amber-100 bg-amber-50/55',
    reengaged:
      'border-emerald-100 bg-emerald-50/45',
  };

  return (
    <Link
      href={`/leads/${leadId}`}
      className={`group flex items-start justify-between gap-4 rounded-xl border px-4 py-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm ${
        toneClasses[tone]
      }`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-slate-800">
          {leadName || leadCode || 'Lead'}
        </div>

        <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
          {leadCode || '—'}
        </div>

        <div className="mt-2 text-xs font-semibold text-slate-600">
          {primary}
        </div>

        <div className="mt-0.5 text-[11px] text-slate-500">
          {secondary}
        </div>

        <div className="mt-1 text-[10px] text-slate-400">
          {meta}
        </div>
      </div>

      <ArrowRight
        size={15}
        className="mt-1 shrink-0 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
      />
    </Link>
  );
}

function indiaDayBoundsUtc() {
  const now = new Date();
  const offsetMs =
    5.5 * 60 * 60 * 1000;

  const indiaClock =
    new Date(now.getTime() + offsetMs);

  const year =
    indiaClock.getUTCFullYear();
  const month =
    indiaClock.getUTCMonth();
  const day =
    indiaClock.getUTCDate();

  const start =
    new Date(
      Date.UTC(
        year,
        month,
        day,
        0,
        0,
        0,
        0
      ) - offsetMs
    );

  const end =
    new Date(
      Date.UTC(
        year,
        month,
        day,
        23,
        59,
        59,
        999
      ) - offsetMs
    );

  const todayLabel =
    new Intl.DateTimeFormat(
      'en-IN',
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }
    ).format(now);

  return {
    startUtc:
      start.toISOString(),
    endUtc:
      end.toISOString(),
    todayLabel,
  };
}

function leadName(
  row: NewLeadRow
) {
  return (
    row.display_name ||
    [row.first_name, row.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    row.lead_code ||
    'Lead'
  );
}

function toNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  const parsed =
    Number(value ?? 0);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  return new Intl.NumberFormat(
    'en-IN',
    {
      maximumFractionDigits: 0,
    }
  ).format(toNumber(value));
}

function formatMoney(
  value:
    | number
    | string
    | null
    | undefined,
  currency: string
) {
  try {
    return new Intl.NumberFormat(
      currency.toUpperCase() ===
        'INR'
        ? 'en-IN'
        : 'en-US',
      {
        style: 'currency',
        currency:
          currency.toUpperCase(),
        maximumFractionDigits: 2,
      }
    ).format(toNumber(value));
  } catch {
    return `${currency} ${toNumber(
      value
    ).toFixed(2)}`;
  }
}

function formatDateTime(
  value:
    | string
    | null
    | undefined
) {
  if (!value) return '—';

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    }
  ).format(date);
}

function one(
  value: string | string[] | undefined
) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function pretty(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}
