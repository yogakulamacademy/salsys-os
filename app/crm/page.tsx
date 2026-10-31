import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  Database,
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

export default async function CrmCommandCenterPage() {
  const [admissions, dashboard] = await Promise.all([
    getAdmissionsSnapshot(),
    getDashboardSnapshot(),
  ]);

  const priorities = admissions.priorityQueue as PriorityRow[];
  const ownerWorkload = admissions.ownerWorkload as OwnerWorkloadRow[];
  const reviewCount = dashboard.metrics.priority || priorities.length;
  const openCount = dashboard.metrics.activePipeline;
  const paymentCount = dashboard.metrics.paymentPending;
  const unassignedCount = resolveUnassignedCount(ownerWorkload, priorities);
  const sourceRows = dashboard.sources.slice(0, 6);
  const topSource = sourceRows[0] ?? null;
  const maxSource = Math.max(1, ...sourceRows.map((row) => row.leads));
  const stageRows = ACTIVE_OPPORTUNITY_STAGES.map((stage) => ({
    stage,
    count: dashboard.counts[stage] ?? 0,
  }));
  const maxStage = Math.max(1, ...stageRows.map((row) => row.count));

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div>
          <div className={styles.kicker}>SALSYSOS / CRM OPERATIONS</div>
          <h1>Sales Command Center</h1>
          <p>A focused view of what needs action, what is moving, and what is missing.</p>
        </div>
        <div className={styles.introActions}>
          <Link href="/opportunities?surface=quality" className={styles.button}>
            <AlertTriangle size={14} /> Data health
          </Link>
          <Link href="/opportunities" className={styles.buttonPrimary}>
            <Users size={14} /> Open opportunities
          </Link>
        </div>
      </header>

      <section className={styles.commandHero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>YOUR DAILY SALES BRIEF</div>
          <h2>
            {reviewCount} opportunities need a closer look.
            <br />
            Give the next action a clear owner.
          </h2>
          <p>
            Review priorities come from the CRM&apos;s current operational evidence and remain decision-support hints. They do not execute stage changes, messages, payments, or customer-visible actions.
          </p>
          <div className={styles.commandActions}>
            <Link href="/work-queue" className={styles.buttonPrimary}>
              Open work queue <ArrowRight size={13} />
            </Link>
            <Link href="/opportunities" className={styles.buttonAlt}>
              Review opportunities
            </Link>
          </div>
        </div>

        <div className={styles.heroFlow} aria-label="CRM operating flow">
          <HeroNode icon={<Users size={16} />} title="Capture" detail="Opportunity context" />
          <span className={styles.heroConnector} aria-hidden="true" />
          <HeroNode icon={<Activity size={16} />} title="Prioritize" detail="Explain the signal" />
          <span className={styles.heroConnector} aria-hidden="true" />
          <HeroNode icon={<Check size={16} />} title="Act" detail="Human decision" />
        </div>
      </section>

      <section className={styles.stats} aria-label="CRM summary">
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
              value={unassignedCount}
              title="Ownership gap"
              detail="Open opportunities do not yet have a clear owner."
              href="/opportunities?owner=unassigned"
              action="Assign owners"
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
                title={`${pretty(topSource.source)} is the largest source`}
                detail="Current CRM opportunities share this source label."
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
              <h2>Where these opportunities came from</h2>
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
              <p>Click a stage to inspect the underlying opportunities.</p>
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
                  href={`/opportunities?stage=${encodeURIComponent(row.stage)}`}
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
              Current-stage snapshot, not a historical conversion funnel. Click any stage to inspect records.
            </div>
          </div>
        </section>

        <RevenueReadiness revenue={dashboard.revenueSummary} />
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

function RevenueReadiness({ revenue }: { revenue: DashboardRevenueSummary[] }) {
  const rows = revenue.filter((row) => row.currency);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <div className={styles.kicker}>REVENUE INTELLIGENCE</div>
          <h2>Commercial data readiness</h2>
          <p>Separate sales stages from verified cash collection.</p>
        </div>
      </div>
      <div className={styles.panelBody}>
        {rows.length ? (
          <>
            <div className={styles.emptyNote}>
              <WalletCards size={18} />
              <div>
                <strong>Verified commercial evidence is available.</strong>
                Values remain separated by currency. CRM stage counts are not treated as payment proof.
              </div>
            </div>
            <div className={styles.evidence}>
              <div className={styles.currencyList}>
                {rows.map((row) => (
                  <div key={row.currency} className={styles.currencyLine}>
                    <span>{row.currency} collected</span>
                    <strong>{formatMoney(row.collected, row.currency)}</strong>
                  </div>
                ))}
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

function resolveUnassignedCount(ownerRows: OwnerWorkloadRow[], priorities: PriorityRow[]) {
  const ownerRow = ownerRows.find((row) => !row.owner_user_id && !row.owner_name);
  const ownerCount = ownerRow ? numericOrNull(ownerRow.active_leads) : null;
  if (ownerCount != null) return ownerCount;
  return priorities.filter((row) => !row.owner_user_id && !row.owner_name).length;
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
