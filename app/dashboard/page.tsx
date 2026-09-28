import Link from 'next/link';
import {
  ArrowRight,
  ClipboardCheck,
  ContactRound,
  Flame,
  ListTodo,
  MessageSquareMore,
  MessagesSquare,
  UserCheck,
} from 'lucide-react';
import { DashboardInsights } from '@/components/dashboard-insights';
import { LeadsTable } from '@/components/leads-table';
import { PageHeader, StatCard } from '@/components/ui';
import {
  getDashboardSourceBreakdown,
  getFollowUps,
  getLeads,
  getPipelineCounts,
  isMockMode,
} from '@/lib/data';

export default async function DashboardPage() {
  const [leads, counts, sources, followups] = await Promise.all([
    getLeads(),
    getPipelineCounts(),
    getDashboardSourceBreakdown(),
    getFollowUps(),
  ]);

  const total = Object.values(counts).reduce(
    (sum, value) => sum + value,
    0
  );

  const qualified =
    counts.qualified +
    counts.high_intent +
    counts.payment_pending +
    counts.enrolled;

  const unanswered = leads.filter(
    (lead) => !lead.lastContactedAt && lead.stage === 'new'
  ).length;

  const priorityCount =
    counts.high_intent + counts.payment_pending;

  const mock = isMockMode();

  const pipeline = [
    { stage: 'New', leads: counts.new },
    { stage: 'Contacted', leads: counts.contacted },
    { stage: 'Engaged', leads: counts.engaged },
    { stage: 'Qualified', leads: counts.qualified },
    { stage: 'High intent', leads: counts.high_intent },
    { stage: 'Payment', leads: counts.payment_pending },
    { stage: 'Enrolled', leads: counts.enrolled },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Growth command center"
        title="Admissions at a glance"
        description="One view of lead volume, funnel movement, acquisition quality and the leads that need attention now."
        actions={
          <>
            <span
              className={`rounded-xl px-3 py-2 text-xs font-bold ${
                mock
                  ? 'bg-orange-50 text-orange-700'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {mock ? 'Mock data' : 'Supabase live'}
            </span>

            <Link className="btn-primary" href="/leads">
              View all leads
              <ArrowRight size={15} />
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="animate-rise stagger-1">
          <StatCard
            label="Total leads"
            value={total.toLocaleString()}
            note="active + historical funnel"
            icon={<ContactRound size={19} />}
          />
        </div>

        <div className="animate-rise stagger-2">
          <StatCard
            label="Qualified+"
            value={qualified.toLocaleString()}
            note={
              total
                ? `${Math.round((qualified / total) * 100)}% of leads`
                : 'No leads yet'
            }
            icon={<UserCheck size={19} />}
          />
        </div>

        <div className="animate-rise stagger-3">
          <StatCard
            label="High intent"
            value={counts.high_intent.toLocaleString()}
            note="active high-intent stage"
            icon={<Flame size={19} />}
          />
        </div>

        <div className="animate-rise stagger-4">
          <StatCard
            label="Follow-ups due"
            value={followups.length.toLocaleString()}
            note="open tasks due now"
            icon={<ListTodo size={19} />}
          />
        </div>

        <div className="animate-rise stagger-5">
          <StatCard
            label="Uncontacted"
            value={unanswered.toLocaleString()}
            note="new leads awaiting first touch"
            icon={<MessageSquareMore size={19} />}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <div className="animate-rise stagger-2">
          <DashboardInsights
            pipeline={pipeline}
            sources={sources}
          />
        </div>

        <section className="card-pad animate-rise stagger-3">
          <div>
            <div className="eyebrow">Action center</div>
            <div className="section-title mt-1">Work that matters now</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Jump directly into the queues most likely to move admissions.
            </p>
          </div>

          <div className="mt-5 space-y-3">
            <ActionLink
              href="/admissions"
              icon={<ClipboardCheck size={17} />}
              label="Priority admissions"
              value={priorityCount}
              note="high intent + payment pending"
            />

            <ActionLink
              href="/follow-ups"
              icon={<ListTodo size={17} />}
              label="Follow-ups due"
              value={followups.length}
              note="open tasks requiring action"
            />

            <ActionLink
              href="/conversations"
              icon={<MessagesSquare size={17} />}
              label="Uncontacted leads"
              value={unanswered}
              note="new leads waiting for first response"
            />
          </div>

          <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
              Qualification rate
            </div>

            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="text-3xl font-black tracking-tight text-slate-900">
                {total
                  ? `${Math.round((qualified / total) * 100)}%`
                  : '—'}
              </div>

              <Link
                href="/funnel"
                className="text-xs font-bold text-brand hover:underline"
              >
                Open funnel →
              </Link>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-brand transition-all duration-700"
                style={{
                  width: `${
                    total
                      ? Math.min(
                          100,
                          Math.round((qualified / total) * 100)
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="card mt-4 overflow-hidden animate-rise stagger-4">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="eyebrow">Priority</div>
            <div className="section-title mt-1">
              Leads needing attention
            </div>
          </div>

          <Link
            className="text-sm font-semibold text-brand hover:underline"
            href="/leads"
          >
            All leads →
          </Link>
        </div>

        <LeadsTable
          leads={leads
            .filter((lead) =>
              [
                'high_intent',
                'payment_pending',
                'qualified',
              ].includes(lead.stage)
            )
            .slice(0, 6)}
          compact
        />
      </section>
    </>
  );
}

function ActionLink({
  href,
  icon,
  label,
  value,
  note,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-white">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-slate-800">
          {label}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate-400">
          {note}
        </div>
      </div>

      <div className="text-lg font-black tracking-tight text-slate-900">
        {value.toLocaleString()}
      </div>

      <ArrowRight
        size={15}
        className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand"
      />
    </Link>
  );
}
