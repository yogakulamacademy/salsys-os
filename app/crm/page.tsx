import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  Database,
  MessageSquareMore,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';

import styles from './crm-command-center.module.css';
import { getAdmissionsSnapshot } from '@/lib/admissions-data';
import {
  getDashboardSnapshot,
  type DashboardRevenueSummary,
  type DashboardSource,
} from '@/lib/dashboard-data';
import {
  getDashboardPeriodAnalytics,
  type DashboardPeriodAnalytics,
  type DashboardPeriodRevenue,
} from '@/lib/dashboard-period-data';
import { getPipelineSnapshot } from '@/lib/pipeline-data';
import {
  ACTIVE_OPPORTUNITY_STAGES,
  opportunityStageLabel,
} from '@/lib/crm/canonical-metrics';

type PriorityRow = {
  lead_id: string;
  owner_user_id: string | null;
  owner_name: string | null;
};

type OwnerWorkloadRow = {
  owner_user_id: string | null;
  owner_name: string | null;
  active_leads: number | string | null;
};

type FollowUpRow = {
  due_at: string | null;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type PeriodPreset = '7d' | '30d' | '90d' | 'ytd';

export default async function CrmCommandCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const period = parsePeriod(one(params.period));

  const [admissions, dashboard, periodAnalytics, pipeline] = await Promise.all([
    getAdmissionsSnapshot(),
    getDashboardSnapshot(),
    getDashboardPeriodAnalytics({ period }),
    getPipelineSnapshot(),
  ]);

  const priorities = admissions.priorityQueue as PriorityRow[];
  const ownerWorkload = admissions.ownerWorkload as OwnerWorkloadRow[];
  const followups = admissions.followups as FollowUpRow[];
  const reviewCount = dashboard.metrics.priority || priorities.length;
  const openCount = dashboard.metrics.activePipeline;
  const paymentCount = dashboard.metrics.paymentPending;
  const unassignedCount = resolveUnassignedCount(ownerWorkload, priorities);
  const needsReply = admissions.needsReplyTotal ?? 0;
  const unread = admissions.unreadTotal ?? 0;
  const overdueFollowups = followups.filter((row) => isPast(row.due_at)).length;
  const sourceRows = dashboard.sources.slice(0, 6);
  const topSource = sourceRows[0] ?? null;
  const maxSource = Math.max(1, ...sourceRows.map((row) => row.leads));
  const stageRows = ACTIVE_OPPORTUNITY_STAGES.map((stage) => ({
    stage,
    count: dashboard.counts[stage] ?? 0,
  }));
  const maxStage = Math.max(1, ...stageRows.map((row) => row.count));
  const bottleneck = pipeline.agingSummary
    .filter((row) => row.stuck > 0 || row.warning > 0)
    .slice()
    .sort(
      (left, right) =>
        right.stuck - left.stuck ||
        right.warning - left.warning ||
        right.oldestDays - left.oldestDays,
    )[0] ?? null;
  const primaryRevenue = pickPrimaryRevenue(periodAnalytics.revenue);

  const leadMovement = movementCopy(
    'Opportunity creation',
    periodAnalytics.leads.current,
    periodAnalytics.leads.previous,
    periodAnalytics.leads.changePercent,
  );
  const enrollmentMovement = movementCopy(
    'Enrollment movement',
    periodAnalytics.enrollments.current,
    periodAnalytics.enrollments.previous,
    periodAnalytics.enrollments.changePercent,
  );

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div>
          <div className={styles.kicker}>SALSYSOS / CRM OPERATIONS</div>
          <h1>Sales Command Center</h1>
          <p>What changed, where work is getting stuck, and which decision deserves attention next.</p>
        </div>
        <div className={styles.introActions}>
          <Link href="/crm/performance" className={styles.button}>
            <Activity size={14} /> Sales performance
          </Link>
          <Link href="/opportunities" className={styles.buttonPrimary}>
            <Users size={14} /> Open opportunities
          </Link>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="eyebrow">Change window</div>
          <div className="mt-1 text-[13px] font-semibold text-copy-strong">{periodAnalytics.period.label}</div>
          <div className="mt-1 text-[11px] text-copy-subtle">
            Compared with {periodAnalytics.period.previousLabel}. Equal-length period, observed CRM evidence only.
          </div>
        </div>
        <div className="flex flex-wrap gap-1 rounded-ui border border-line bg-surface-soft p-1">
          {(['7d', '30d', '90d', 'ytd'] as const).map((preset) => (
            <Link
              key={preset}
              href={`/crm?period=${preset}`}
              className={`rounded-md px-3 py-2 text-[11px] font-semibold transition ${
                period === preset
                  ? 'bg-brand-700 text-white'
                  : 'text-copy-muted hover:bg-surface hover:text-copy-strong'
              }`}
            >
              {periodLabel(preset)}
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.commandHero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>CURRENT SALES BRIEF</div>
          <h2>
            {briefHeadline({ needsReply, overdueFollowups, reviewCount, bottleneck })}
          </h2>
          <p>
            {briefDetail({
              needsReply,
              overdueFollowups,
              unassignedCount,
              bottleneck,
              periodAnalytics,
            })}
          </p>
          <div className={styles.commandActions}>
            <Link href="/work-queue" className={styles.buttonPrimary}>
              Work the next action <ArrowRight size={13} />
            </Link>
            <Link href="/crm/performance" className={styles.buttonAlt}>
              Inspect performance
            </Link>
          </div>
        </div>

        <div className={styles.heroFlow} aria-label="CRM operating flow">
          <HeroNode icon={<TrendingUp size={16} />} title="Observe" detail="What changed" />
          <span className={styles.heroConnector} aria-hidden="true" />
          <HeroNode icon={<AlertTriangle size={16} />} title="Diagnose" detail="Where it is stuck" />
          <span className={styles.heroConnector} aria-hidden="true" />
          <HeroNode icon={<Check size={16} />} title="Act" detail="Human decision" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Period change summary">
        <ChangeCard
          label="New opportunities"
          value={periodAnalytics.available.leads ? periodAnalytics.leads.current.toLocaleString('en-IN') : '—'}
          change={periodAnalytics.available.leads ? periodAnalytics.leads.changePercent : null}
          detail={
            periodAnalytics.available.leads
              ? `${periodAnalytics.leads.previous.toLocaleString('en-IN')} in the previous period`
              : 'Lead-period evidence unavailable'
          }
          href="/opportunities"
        />
        <ChangeCard
          label="Qualified rate"
          value={
            periodAnalytics.available.leads && periodAnalytics.leads.conversionRate != null
              ? `${periodAnalytics.leads.conversionRate.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`
              : '—'
          }
          change={null}
          detail={
            periodAnalytics.available.leads
              ? `${periodAnalytics.leads.qualified.toLocaleString('en-IN')} of ${periodAnalytics.leads.current.toLocaleString('en-IN')} new opportunities are currently qualified+`
              : 'Qualification evidence unavailable'
          }
          href="/crm/performance?period="
          period={period}
        />
        <ChangeCard
          label="Enrollments"
          value={periodAnalytics.available.enrollments ? periodAnalytics.enrollments.current.toLocaleString('en-IN') : '—'}
          change={periodAnalytics.available.enrollments ? periodAnalytics.enrollments.changePercent : null}
          detail={
            periodAnalytics.available.enrollments
              ? `${periodAnalytics.enrollments.previous.toLocaleString('en-IN')} in the previous period`
              : 'Enrollment-history evidence unavailable'
          }
          href="/crm/performance?period="
          period={period}
        />
        <ChangeCard
          label="Verified collections"
          value={
            primaryRevenue
              ? formatMoney(primaryRevenue.current, primaryRevenue.currency)
              : periodAnalytics.available.revenue
                ? 'No collection'
                : '—'
          }
          change={primaryRevenue?.changePercent ?? null}
          detail={
            primaryRevenue
              ? `${formatMoney(primaryRevenue.previous, primaryRevenue.currency)} in the previous period${periodAnalytics.revenue.length > 1 ? ' · currencies remain separate' : ''}`
              : periodAnalytics.available.revenue
                ? 'No verified paid/refunded movement in this window'
                : 'Verified payment evidence unavailable'
          }
          href="/crm/performance?period="
          period={period}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <div className="eyebrow">What changed</div>
              <h2 className="section-title mt-1">Period movement that changes the decision</h2>
              <p className="mt-1 text-[12px] text-copy-subtle">A delta is shown only when the immediately previous equal-length period provides a valid baseline.</p>
            </div>
            <Link href={`/crm/performance?period=${period}`} className="text-[11px] font-semibold text-brand-700 hover:underline">
              Full performance <ArrowRight size={11} className="inline" />
            </Link>
          </div>
          <div className="divide-y divide-line">
            <MovementRow movement={leadMovement} />
            <MovementRow movement={enrollmentMovement} />
            <MovementRow
              movement={{
                title: 'Qualification quality',
                value:
                  periodAnalytics.leads.conversionRate == null
                    ? 'No qualification rate available'
                    : `${periodAnalytics.leads.conversionRate.toLocaleString('en-IN', { maximumFractionDigits: 1 })}% of new opportunities are currently qualified+`,
                note: `${periodAnalytics.leads.qualified.toLocaleString('en-IN')} qualified+ from ${periodAnalytics.leads.current.toLocaleString('en-IN')} new opportunities in this window.`,
                direction: 'neutral',
              }}
            />
            <MovementRow
              movement={{
                title: 'Operational load',
                value: `${needsReply.toLocaleString('en-IN')} need reply · ${overdueFollowups.toLocaleString('en-IN')} follow-ups overdue`,
                note: unread > 0 ? `${unread.toLocaleString('en-IN')} unread inbound conversations are included in the current reply pressure.` : 'No unread inbound count is currently reported.',
                direction: needsReply > 0 || overdueFollowups > 0 ? 'down' : 'neutral',
              }}
            />
          </div>
        </section>

        <section className="rounded-panel border border-line bg-surface p-5 shadow-xs">
          <div className="eyebrow">Primary bottleneck</div>
          <h2 className="section-title mt-1">Where work is slowing down</h2>
          <div className="mt-4 space-y-3">
            {bottleneck ? (
              <BottleneckSignal
                title={`${opportunityStageLabel(bottleneck.stage)} is the strongest stage-aging bottleneck`}
                detail={`${bottleneck.stuck.toLocaleString('en-IN')} stuck · ${bottleneck.warning.toLocaleString('en-IN')} warning · oldest ${bottleneck.oldestDays.toLocaleString('en-IN')}d.`}
                href={`/opportunities?surface=pipeline&stage=${encodeURIComponent(bottleneck.stage)}`}
                action="Inspect stage"
                attention={bottleneck.stuck > 0}
              />
            ) : (
              <BottleneckSignal
                title="No stage-aging bottleneck is currently recorded"
                detail={`Median stage age is ${pipeline.metrics.medianStageAgeDays.toFixed(1)}d across the active pipeline.`}
                href="/opportunities?surface=pipeline"
                action="Open pipeline"
              />
            )}
            <BottleneckSignal
              title={needsReply > 0 ? `${needsReply.toLocaleString('en-IN')} conversations need a human reply` : 'Reply queue is currently clear'}
              detail={unread > 0 ? `${unread.toLocaleString('en-IN')} unread inbound conversations are waiting in Inbox.` : 'No unread inbound pressure is currently reported.'}
              href="/work-queue?tab=reply"
              action="Review replies"
              attention={needsReply > 0}
            />
            <BottleneckSignal
              title={unassignedCount > 0 ? `${unassignedCount.toLocaleString('en-IN')} opportunities lack an owner` : 'Open opportunity ownership is currently covered'}
              detail="Unassigned work is harder to progress and easier to miss during hand-offs."
              href="/opportunities?owner=unassigned"
              action="Assign owners"
              attention={unassignedCount > 0}
            />
          </div>
        </section>
      </section>

      <section className={styles.stats} aria-label="CRM current state">
        <StatCard
          href="/opportunities"
          label="Open opportunities"
          value={openCount}
          detail={`From ${dashboard.metrics.total} CRM opportunity records`}
          icon={<Users size={15} />}
        />
        <StatCard
          href="/work-queue"
          label="Priority reviews"
          value={reviewCount}
          detail="Explainable CRM priority evidence"
          icon={<Activity size={15} />}
        />
        <StatCard
          href="/work-queue?tab=payment"
          label="Payment-stage opportunities"
          value={paymentCount}
          detail="Balances remain separate from stage"
          icon={<WalletCards size={15} />}
        />
        <StatCard
          href="/opportunities?owner=unassigned"
          label="Unassigned opportunities"
          value={unassignedCount}
          detail="Assign ownership to move work"
          icon={<AlertTriangle size={15} />}
        />
      </section>

      <section className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.kicker}>DECISION SIGNALS</div>
              <h2>Where intervention is concentrated</h2>
              <p>Summary signals only. Open the canonical workspace to work the underlying records.</p>
            </div>
            <Link href="/work-queue" className={styles.nakedLink}>
              Work queue <ArrowRight size={12} />
            </Link>
          </div>

          <div>
            <DecisionSignal
              value={reviewCount}
              title="Priority review load"
              detail="Ranked opportunities currently need human review."
              href="/work-queue"
              action="Open queue"
            />
            <DecisionSignal
              value={overdueFollowups}
              title="Follow-up debt"
              detail="Scheduled sales actions are already past their due time."
              href="/work-queue?tab=followups"
              action="Clear overdue"
            />
            <DecisionSignal
              value={paymentCount}
              title="Payment-stage pressure"
              detail="Opportunities are currently closest to enrollment."
              href="/work-queue?tab=payment"
              action="Review payment"
            />
            {topSource ? (
              <DecisionSignal
                value={topSource.leads}
                title={`${pretty(topSource.source)} is the largest current source`}
                detail="Current CRM opportunities share this source label; this is not campaign ROI proof."
                href={`/opportunities?source=${encodeURIComponent(topSource.source)}`}
                action="Inspect source"
              />
            ) : null}
          </div>

          <div className={styles.panelFoot}>
            <span>Signals summarize canonical CRM evidence</span>
            <span>Drill down to act</span>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.kicker}>ACQUISITION</div>
              <h2>Where current opportunities came from</h2>
              <p>Current CRM source labels, not campaign ROI attribution.</p>
            </div>
            <Link href="/opportunities?surface=quality" className={styles.nakedLink}>
              Data quality <ArrowRight size={12} />
            </Link>
          </div>
          <div className={styles.panelBody}>
            {sourceRows.length ? (
              sourceRows.map((source) => (
                <SourceRow key={source.source} source={source} max={maxSource} />
              ))
            ) : (
              <div className={styles.emptyNote}>
                <Database size={18} />
                <div>
                  <strong>Source distribution is unavailable.</strong>
                  No source labels were returned by the current CRM snapshot.
                </div>
              </div>
            )}
            <div className={styles.chartNote}>
              Source is not proof of a campaign match. Unknown remains unknown.
            </div>
          </div>
        </section>
      </section>

      <section className={styles.gridEqual}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.kicker}>PIPELINE</div>
              <h2>Current opportunity distribution</h2>
              <p>Use stage count with aging evidence; volume alone can hide stalled work.</p>
            </div>
            <Link href="/opportunities?surface=pipeline" className={styles.nakedLink}>
              Pipeline view <ArrowRight size={12} />
            </Link>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.stageStrip}>
              {stageRows.map((row) => (
                <Link
                  key={row.stage}
                  href={`/opportunities?surface=pipeline&stage=${encodeURIComponent(row.stage)}`}
                  className={styles.stageCard}
                >
                  <small>{opportunityStageLabel(row.stage)}</small>
                  <b>{row.count}</b>
                  <div className={styles.mutedBar}>
                    <span style={{ width: `${Math.max(2, (row.count / maxStage) * 100)}%` }} />
                  </div>
                </Link>
              ))}
            </div>
            <div className={styles.chartNote}>
              {pipeline.metrics.stuckLeads.toLocaleString('en-IN')} stuck · {pipeline.metrics.warningLeads.toLocaleString('en-IN')} warning · {pipeline.metrics.medianStageAgeDays.toFixed(1)}d median stage age.
            </div>
          </div>
        </section>

        <RevenueReadiness revenue={dashboard.revenueSummary} periodRevenue={periodAnalytics.revenue} />
      </section>
    </div>
  );
}

function HeroNode({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className={styles.heroNode}>
      <div className={styles.heroDot}>{icon}</div>
      <b>{title}</b>
      <small>{detail}</small>
    </div>
  );
}

function ChangeCard({
  label,
  value,
  change,
  detail,
  href,
  period,
}: {
  label: string;
  value: string;
  change: number | null;
  detail: string;
  href: string;
  period?: PeriodPreset;
}) {
  const resolvedHref = period ? `${href}${period}` : href;
  return (
    <Link href={resolvedHref} className="rounded-panel border border-line bg-surface p-4 shadow-xs transition hover:border-line-strong hover:shadow-sm">
      <div className="text-[11px] font-semibold text-copy-muted">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-[27px] font-semibold tracking-tight text-copy-strong">{value}</div>
        <DeltaBadge change={change} />
      </div>
      <div className="mt-2 text-[10px] leading-4 text-copy-subtle">{detail}</div>
    </Link>
  );
}

function DeltaBadge({ change }: { change: number | null }) {
  if (change == null) {
    return <span className="rounded-full bg-surface-soft px-2 py-1 text-[9px] font-semibold text-copy-subtle">No baseline</span>;
  }

  if (change === 0) {
    return <span className="rounded-full bg-surface-soft px-2 py-1 text-[9px] font-semibold text-copy-muted">No change</span>;
  }

  const positive = change > 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {positive ? '+' : ''}{change.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%
    </span>
  );
}

type Movement = {
  title: string;
  value: string;
  note: string;
  direction: 'up' | 'down' | 'neutral';
};

function MovementRow({ movement }: { movement: Movement }) {
  const icon = movement.direction === 'up'
    ? <TrendingUp size={15} className="text-emerald-600" />
    : movement.direction === 'down'
      ? <TrendingDown size={15} className="text-rose-600" />
      : <Activity size={15} className="text-copy-subtle" />;

  return (
    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[36px_minmax(180px,.7fr)_minmax(0,1.3fr)] sm:items-center">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-soft">{icon}</span>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">{movement.title}</div>
        <div className="mt-1 text-[12px] font-semibold text-copy-strong">{movement.value}</div>
      </div>
      <div className="text-[11px] leading-5 text-copy-muted">{movement.note}</div>
    </div>
  );
}

function BottleneckSignal({
  title,
  detail,
  href,
  action,
  attention = false,
}: {
  title: string;
  detail: string;
  href: string;
  action: string;
  attention?: boolean;
}) {
  return (
    <Link href={href} className={`block rounded-ui border p-3.5 transition hover:bg-surface-soft ${attention ? 'border-amber-200 bg-amber-50/50' : 'border-line bg-surface-soft/50'}`}>
      <div className="text-[12px] font-semibold text-copy-strong">{title}</div>
      <div className="mt-1 text-[11px] leading-5 text-copy-muted">{detail}</div>
      <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-700">{action} <ArrowRight size={11} /></div>
    </Link>
  );
}

function StatCard({
  href,
  label,
  value,
  detail,
  icon,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className={styles.stat}>
      <div className={styles.statLabel}>
        <span>{label}</span>
        {icon}
      </div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statDesc}>{detail}</div>
    </Link>
  );
}

function DecisionSignal({
  value,
  title,
  detail,
  href,
  action,
}: {
  value: number;
  title: string;
  detail: string;
  href: string;
  action: string;
}) {
  return (
    <div className={styles.queueItem}>
      <div className={styles.queueScore} aria-label={`${value} records`}>
        {value.toLocaleString('en-IN')}
        <small>records</small>
      </div>
      <div className={styles.queueMain}>
        <div className={styles.queueTitleLine}>
          <strong>{title}</strong>
        </div>
        <p>{detail}</p>
      </div>
      <div className={styles.queueActions}>
        <Link href={href} className={styles.smallButton}>
          {action} <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

function SourceRow({ source, max }: { source: DashboardSource; max: number }) {
  const width = Math.max(4, (source.leads / max) * 100);
  return (
    <Link
      href={`/opportunities?source=${encodeURIComponent(source.source)}`}
      className={styles.sourceRow}
    >
      <span>{pretty(source.source)}</span>
      <div className={styles.mutedBar}>
        <span style={{ width: `${width}%` }} />
      </div>
      <b>{source.leads}</b>
    </Link>
  );
}

function RevenueReadiness({
  revenue,
  periodRevenue,
}: {
  revenue: DashboardRevenueSummary[];
  periodRevenue: DashboardPeriodRevenue[];
}) {
  const rows = revenue.filter((row) => row.currency);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <div className={styles.kicker}>REVENUE INTELLIGENCE</div>
          <h2>Verified collections and commercial readiness</h2>
          <p>Separate sales stages from verified cash collection; currencies are never combined.</p>
        </div>
      </div>
      <div className={styles.panelBody}>
        {rows.length ? (
          <>
            <div className={styles.emptyNote}>
              <CircleDollarSign size={18} />
              <div>
                <strong>Verified commercial evidence is available.</strong>
                Period movement appears only for currencies with paid/refunded evidence in the selected window.
              </div>
            </div>
            <div className={styles.evidence}>
              <div className={styles.currencyList}>
                {rows.map((row) => {
                  const periodRow = periodRevenue.find((item) => item.currency === row.currency);
                  return (
                    <div key={row.currency} className={styles.currencyLine}>
                      <span>{row.currency} collected</span>
                      <strong>
                        {formatMoney(row.collected, row.currency)}
                        {periodRow?.changePercent != null ? ` · ${signedPercent(periodRow.changePercent)} period` : ''}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <div className={styles.evidenceRow}>
                <span>Pipeline stage data</span>
                <span className={styles.pill}>Observed</span>
              </div>
              <div className={styles.evidenceRow}>
                <span>Cross-currency total</span>
                <span className={styles.pillGray}>Not combined</span>
              </div>
              <div className={styles.evidenceRow}>
                <span>Customer-visible financial action</span>
                <span className={styles.pillAmber}>Human controlled</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={styles.emptyNote}>
              <WalletCards size={18} />
              <div>
                <strong>Revenue trend unavailable in this snapshot.</strong>
                The current CRM evidence does not provide a verified revenue series that can be shown safely here.
              </div>
            </div>
            <div className={styles.evidence}>
              <div className={styles.evidenceRow}>
                <span>Pipeline stage data</span>
                <span className={styles.pill}>Observed</span>
              </div>
              <div className={styles.evidenceRow}>
                <span>Payment amount / balance</span>
                <span className={styles.pillAmber}>Unavailable</span>
              </div>
              <div className={styles.evidenceRow}>
                <span>Recognized revenue</span>
                <span className={styles.pillGray}>Unavailable</span>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function movementCopy(
  title: string,
  current: number,
  previous: number,
  change: number | null,
): Movement {
  if (change == null) {
    return {
      title,
      value: `${current.toLocaleString('en-IN')} now · no valid percentage baseline`,
      note: previous === 0 ? 'The previous equal-length period was zero, so a percentage increase would be misleading.' : `${previous.toLocaleString('en-IN')} in the previous period.`,
      direction: 'neutral',
    };
  }

  if (change === 0) {
    return {
      title,
      value: `${current.toLocaleString('en-IN')} · unchanged`,
      note: `The previous equal-length period also recorded ${previous.toLocaleString('en-IN')}.`,
      direction: 'neutral',
    };
  }

  return {
    title,
    value: `${current.toLocaleString('en-IN')} · ${signedPercent(change)}`,
    note: `${previous.toLocaleString('en-IN')} in the previous equal-length period.`,
    direction: change > 0 ? 'up' : 'down',
  };
}

function briefHeadline({
  needsReply,
  overdueFollowups,
  reviewCount,
  bottleneck,
}: {
  needsReply: number;
  overdueFollowups: number;
  reviewCount: number;
  bottleneck: { stage: string; stuck: number; warning: number; oldestDays: number } | null;
}) {
  if (needsReply > 0) return `${needsReply.toLocaleString('en-IN')} conversations need a reply before the queue grows.`;
  if (overdueFollowups > 0) return `${overdueFollowups.toLocaleString('en-IN')} follow-ups are already overdue.`;
  if (bottleneck?.stuck) return `${bottleneck.stuck.toLocaleString('en-IN')} opportunities are stuck in ${opportunityStageLabel(bottleneck.stage)}.`;
  if (reviewCount > 0) return `${reviewCount.toLocaleString('en-IN')} opportunities need a closer review.`;
  return 'No major action bottleneck is visible in the current CRM snapshot.';
}

function briefDetail({
  needsReply,
  overdueFollowups,
  unassignedCount,
  bottleneck,
  periodAnalytics,
}: {
  needsReply: number;
  overdueFollowups: number;
  unassignedCount: number;
  bottleneck: { stage: string; stuck: number; warning: number; oldestDays: number } | null;
  periodAnalytics: DashboardPeriodAnalytics;
}) {
  const parts: string[] = [];
  if (needsReply > 0) parts.push(`${needsReply.toLocaleString('en-IN')} need reply`);
  if (overdueFollowups > 0) parts.push(`${overdueFollowups.toLocaleString('en-IN')} overdue follow-ups`);
  if (unassignedCount > 0) parts.push(`${unassignedCount.toLocaleString('en-IN')} unassigned opportunities`);
  if (bottleneck) parts.push(`${opportunityStageLabel(bottleneck.stage)} has the strongest aging pressure`);
  if (periodAnalytics.leads.changePercent != null) parts.push(`new opportunity volume is ${signedPercent(periodAnalytics.leads.changePercent)} vs the previous period`);

  return parts.length
    ? `${parts.join(' · ')}. Use these as decision-support signals; SalsysOS does not auto-change stages, send messages or mark payments.`
    : 'Current operational evidence does not show a concentrated sales risk. Continue monitoring period movement and ownership rather than manufacturing urgency.';
}

function pickPrimaryRevenue(rows: DashboardPeriodRevenue[]) {
  return rows.find((row) => row.current !== 0) ?? rows[0] ?? null;
}

function resolveUnassignedCount(ownerRows: OwnerWorkloadRow[], priorities: PriorityRow[]) {
  const ownerRow = ownerRows.find((row) => !row.owner_user_id && !row.owner_name);
  const ownerCount = ownerRow ? numericOrNull(ownerRow.active_leads) : null;
  if (ownerCount != null) return ownerCount;
  return priorities.filter((row) => !row.owner_user_id && !row.owner_name).length;
}

function parsePeriod(value: string): PeriodPreset {
  return value === '7d' || value === '90d' || value === 'ytd' ? value : '30d';
}

function periodLabel(value: PeriodPreset) {
  if (value === '7d') return '7 days';
  if (value === '90d') return '90 days';
  if (value === 'ytd') return 'YTD';
  return '30 days';
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function isPast(value: string | null | undefined) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

function numericOrNull(value: number | string | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pretty(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function signedPercent(value: number) {
  return `${value > 0 ? '+' : ''}${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
}

function formatMoney(value: number | string | null | undefined, currency: string) {
  const amount = numericOrNull(value);
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-IN')}`;
  }
}
