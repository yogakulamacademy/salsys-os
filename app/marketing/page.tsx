import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  Megaphone,
  MousePointerClick,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';

import { getCampaignsWorkspace } from '@/lib/campaigns-data';
import { getFunnelWorkspace } from '@/lib/funnel-data';
import { getRevenueWorkspace } from '@/lib/revenue-data';
import type { CampaignWorkspaceRow } from '@/components/campaigns-workspace';

import styles from './marketing-command-center.module.css';

type UnknownRecord = Record<string, unknown>;

type AcquisitionRow = {
  name: string;
  leads: number;
  qualified: number;
  enrolled: number;
};

type DailySignal = {
  sessions: number;
  leads: number;
  qualified: number;
  enrolled: number;
};

type Movement = {
  current: number;
  previous: number;
  delta: number | null;
};

type AttentionItem = {
  score: number;
  tone: 'critical' | 'warning' | 'positive' | 'neutral';
  title: string;
  detail: string;
  href: string;
  label: string;
};

export default async function MarketingCommandCenterPage() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [campaigns, funnel, revenue] = await Promise.all([
    getCampaignsWorkspace({
      query: '',
      platform: 'all',
      outcome: 'all',
      sortMode: 'spend_desc',
      page: 1,
      pageSize: 50,
    }),
    getFunnelWorkspace(),
    getRevenueWorkspace(currentMonth),
  ]);

  const overview = asRecord(funnel.funnel.overview);
  const sources = normalizeSources(funnel.funnel.sources);
  const totalLeads = positiveNumber(overview.leads, campaigns.summary.leads);
  const qualified = positiveNumber(overview.qualified_leads, campaigns.summary.qualified);
  const enrolled = positiveNumber(overview.enrolled_leads, campaigns.summary.enrolled);
  const traffic = positiveNumber(overview.sessions, campaigns.summary.clicks);
  const highIntent = sumCampaign(campaigns.campaigns, 'highIntent');
  const paymentPending = sumCampaign(campaigns.campaigns, 'paymentPending');
  const spendInr = campaigns.summary.spendByCurrency.INR ?? 0;
  const revenueInr = revenue.totalsByCurrency.find((row) => row.currency.toUpperCase() === 'INR')?.actual ?? campaigns.summary.revenueInr;
  const revenueUsd = revenue.totalsByCurrency.find((row) => row.currency.toUpperCase() === 'USD')?.actual ?? campaigns.summary.revenueUsd;
  const roasComplete = campaigns.campaigns.length > 0 && campaigns.campaigns.every((row) => row.roas !== null && row.spendCurrency.toUpperCase() === 'INR');
  const roas = roasComplete && spendInr > 0 ? revenueInr / spendInr : null;

  const sourceRows = sources.length ? sources : fallbackAcquisition(campaigns.campaigns);
  const maxLeadVolume = Math.max(1, ...sourceRows.map((row) => row.leads));
  const topCampaigns = [...campaigns.campaigns]
    .sort((a, b) => b.enrolled - a.enrolled || b.qualified - a.qualified || b.leads - a.leads)
    .slice(0, 5);
  const poorCampaign = campaigns.campaigns
    .filter((row) => row.spend > 0 && row.qualified === 0)
    .sort((a, b) => b.spend - a.spend)[0];
  const missingRoas = campaigns.campaigns.filter((row) => row.spend > 0 && row.roas === null).length;
  const strongest = [...campaigns.campaigns]
    .filter((row) => row.cac !== null && row.enrolled > 0)
    .sort((a, b) => (a.cac ?? Number.POSITIVE_INFINITY) - (b.cac ?? Number.POSITIVE_INFINITY))[0];

  const movement = buildMovement(funnel.funnel.daily);
  const evidenceKnown = campaigns.summary.campaigns > 0
    ? Math.max(0, campaigns.summary.campaigns - missingRoas)
    : 0;
  const evidenceCoverage = campaigns.summary.campaigns > 0
    ? (evidenceKnown / campaigns.summary.campaigns) * 100
    : null;
  const attention = buildAttentionQueue({
    poorCampaign,
    missingRoas,
    strongest,
    movement,
    campaignCount: campaigns.summary.campaigns,
  });
  const primaryAttention = attention[0] ?? null;
  const warnings = [campaigns.warning, funnel.warning, revenue.warning].filter(Boolean) as string[];

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div>
          <div className={styles.kicker}>SALSYSOS / GROWTH OPERATIONS</div>
          <h1>Marketing Command Center</h1>
          <p>See what is driving demand, where conversion is breaking, and what deserves attention next.</p>
        </div>
        <div className={styles.introActions}>
          <Link href="/analytics" className={styles.button}>
            <ShieldCheck size={14} /> Data health
          </Link>
          <Link href="/campaigns" className={styles.buttonPrimary}>
            <Megaphone size={14} /> Open campaigns
          </Link>
        </div>
      </header>

      {warnings.length ? (
        <div className={styles.warning}>
          <AlertTriangle size={15} />
          <span>{warnings[0]}</span>
        </div>
      ) : null}

      <section className={styles.commandHero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>YOUR DAILY GROWTH BRIEF</div>
          <h2>
            {primaryAttention ? primaryAttention.title : 'Growth evidence is stable.'}
            <br />
            {primaryAttention ? 'Improve the signal before scaling spend.' : 'Keep acquisition and conversion evidence clean.'}
          </h2>
          <p>
            Growth priorities are derived from observed acquisition, funnel and attribution evidence. They support human decisions and do not change campaign budgets, audiences, ads, or customer-visible actions automatically.
          </p>
          <div className={styles.commandActions}>
            <Link href={primaryAttention?.href ?? '/campaigns'} className={styles.buttonPrimary}>
              Review growth priorities <ArrowRight size={13} />
            </Link>
            <Link href="/campaigns" className={styles.buttonAlt}>
              Review campaigns
            </Link>
          </div>
        </div>

        <div className={styles.heroFlow} aria-label="Growth operating flow">
          <HeroNode icon={<MousePointerClick size={16} />} title="Acquire" detail="Demand signals" />
          <span className={styles.heroConnector} aria-hidden="true" />
          <HeroNode icon={<Activity size={16} />} title="Convert" detail="Lead quality" />
          <span className={styles.heroConnector} aria-hidden="true" />
          <HeroNode icon={<Check size={16} />} title="Grow" detail="Human decision" />
        </div>
      </section>

      <section className={styles.stats} aria-label="Marketing summary">
        <StatCard
          href="/campaigns"
          label="Ad spend"
          value={formatMoney(spendInr, 'INR', true)}
          detail="Observed paid-media spend · INR"
          icon={<WalletCards size={15} />}
        />
        <StatCard
          href="/acquisition"
          label="New leads"
          value={formatNumber(totalLeads)}
          detail="Observed CRM lead volume"
          icon={<Users size={15} />}
        />
        <StatCard
          href="/funnel"
          label="Qualified leads"
          value={formatNumber(qualified)}
          detail={`${formatPercent(qualified, totalLeads)} of observed leads`}
          icon={<Activity size={15} />}
        />
        <StatCard
          href="/revenue"
          label="Revenue"
          value={formatMoney(revenueInr, 'INR', true)}
          detail={revenueUsd > 0 ? `Plus ${formatMoney(revenueUsd, 'USD', true)} kept separate` : 'Verified CRM-collected INR'}
          icon={<BarChart3 size={15} />}
        />
      </section>

      <section className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.kicker}>PRIORITY INTELLIGENCE</div>
              <h2>Growth priority queue</h2>
              <p>Ranked investigations from current marketing evidence. Human review required.</p>
            </div>
            <Link href="/analytics" className={styles.nakedLink}>
              Full analysis <ArrowRight size={12} />
            </Link>
          </div>

          <div>
            {attention.length ? (
              attention.slice(0, 5).map((item, index) => (
                <PriorityItem key={`${item.title}-${index}`} item={item} rank={index + 1} />
              ))
            ) : (
              <div className={styles.panelBody}>
                <div className={styles.emptyNote}>
                  <TrendingUp size={18} />
                  <div>
                    <strong>No urgent growth investigation is supported.</strong>
                    Current acquisition and conversion evidence does not surface a priority exception.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={styles.panelFoot}>
            <span>Observed marketing evidence · no automatic budget changes</span>
            <span>{attention.length} signal{attention.length === 1 ? '' : 's'} in scope</span>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.kicker}>ACQUISITION</div>
              <h2>Where demand is coming from</h2>
              <p>Lead volume and downstream quality by observed source.</p>
            </div>
            <Link href="/attribution" className={styles.nakedLink}>
              Attribution <ArrowRight size={12} />
            </Link>
          </div>
          <div className={styles.panelBody}>
            {sourceRows.length ? (
              sourceRows.slice(0, 7).map((row) => (
                <SourceRow key={row.name} row={row} max={maxLeadVolume} />
              ))
            ) : (
              <div className={styles.emptyNote}>
                <Megaphone size={18} />
                <div>
                  <strong>Acquisition evidence is unavailable.</strong>
                  No source-level lead evidence was returned in the current scope.
                </div>
              </div>
            )}
            <div className={styles.chartNote}>
              Source labels are observed evidence. Missing source evidence remains unknown rather than inferred.
            </div>
          </div>
        </section>
      </section>

      <section className={styles.gridEqual}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.kicker}>CONVERSION</div>
              <h2>Marketing funnel</h2>
              <p>Observed movement from traffic to enrollment.</p>
            </div>
            <Link href="/funnel" className={styles.nakedLink}>
              Open funnel <ArrowRight size={12} />
            </Link>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.funnel}>
              <FunnelRow label="Traffic" value={traffic} base={traffic} />
              <FunnelRow label="Lead" value={totalLeads} base={traffic} />
              <FunnelRow label="Qualified" value={qualified} base={totalLeads} />
              <FunnelRow label="High intent" value={highIntent} base={totalLeads} />
              <FunnelRow label="Payment pending" value={paymentPending} base={totalLeads} />
              <FunnelRow label="Enrolled" value={enrolled} base={totalLeads} />
            </div>
            <div className={styles.chartNote}>
              Counts are observed states and milestones. Bars show stage share and do not imply causal attribution.
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.kicker}>EVIDENCE QUALITY</div>
              <h2>Growth data readiness</h2>
              <p>Know what is reliable before making a scaling decision.</p>
            </div>
            <Link href="/attribution" className={styles.nakedLink}>
              Inspect evidence <ArrowRight size={12} />
            </Link>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.readinessLead}>
              <ShieldCheck size={18} />
              <div>
                <strong>{evidenceCoverage === null ? 'Campaign coverage is unknown.' : `${evidenceCoverage.toFixed(0)}% campaign efficiency coverage.`}</strong>
                <span>{missingRoas > 0 ? `${missingRoas} campaign${missingRoas === 1 ? '' : 's'} still lack complete ROAS evidence.` : 'Comparable campaign efficiency evidence is available for the current scope.'}</span>
              </div>
            </div>
            <div className={styles.evidenceList}>
              <EvidenceRow label="Paid ROAS" value={roas === null ? 'Partial' : `${roas.toFixed(1)}×`} tone={roas === null ? 'warning' : 'good'} />
              <EvidenceRow label="Enrolled" value={formatNumber(enrolled)} />
              <EvidenceRow label="Lead momentum" value={movement.leads.delta === null ? 'Not enough history' : shortDelta(movement.leads.delta)} tone={movement.leads.delta !== null && movement.leads.delta < -10 ? 'warning' : 'neutral'} />
              <EvidenceRow label="Qualified momentum" value={movement.qualified.delta === null ? 'Not enough history' : shortDelta(movement.qualified.delta)} tone={movement.qualified.delta !== null && movement.qualified.delta < -10 ? 'warning' : 'neutral'} />
              <EvidenceRow label="Cross-currency revenue" value={revenueUsd > 0 ? 'Kept separate' : 'INR only in scope'} />
            </div>
          </div>
        </section>
      </section>

      <section className={styles.gridEqual}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.kicker}>CAMPAIGN PERFORMANCE</div>
              <h2>Top performers</h2>
              <p>Ranked by observed enrollment outcomes in the current campaign scope.</p>
            </div>
            <Link href="/campaigns" className={styles.nakedLink}>
              All campaigns <ArrowRight size={12} />
            </Link>
          </div>
          <div>
            {topCampaigns.length ? topCampaigns.map((row, index) => (
              <CampaignRow key={row.id} row={row} rank={index + 1} />
            )) : (
              <div className={styles.panelBody}>
                <div className={styles.emptyNote}>
                  <Megaphone size={18} />
                  <div>
                    <strong>No connected campaign rows are available.</strong>
                    Connect or sync paid-media campaign evidence to populate this section.
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.kicker}>MOMENTUM</div>
              <h2>What changed</h2>
              <p>Recent half of the observed daily period versus the prior half.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.momentumGrid}>
              <MomentumCard label="Sessions" movement={movement.sessions} />
              <MomentumCard label="Leads" movement={movement.leads} />
              <MomentumCard label="Qualified" movement={movement.qualified} />
              <MomentumCard label="Enrolled" movement={movement.enrolled} />
            </div>
            <div className={styles.chartNote}>
              Movement is descriptive evidence only. It does not prove campaign causality or recommend an autonomous budget change.
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}

function HeroNode({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className={styles.heroNode}>
      <div className={styles.heroDot}>{icon}</div>
      <b>{title}</b>
      <small>{detail}</small>
    </div>
  );
}

function StatCard({ href, label, value, detail, icon }: { href: string; label: string; value: string; detail: string; icon: React.ReactNode }) {
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

function PriorityItem({ item, rank }: { item: AttentionItem; rank: number }) {
  return (
    <div className={styles.queueItem}>
      <div className={styles.queueScore}>
        {Math.round(item.score)}
        <small>score</small>
      </div>
      <div className={styles.queueMain}>
        <div className={styles.queueTitleLine}>
          <strong>{item.title}</strong>
          <span className={tonePill(item.tone)}>{priorityLabel(item.tone)}</span>
        </div>
        <p>{item.detail}</p>
      </div>
      <div className={styles.queueActions}>
        <Link href={item.href} className={styles.smallButton}>
          {item.label} <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

function SourceRow({ row, max }: { row: AcquisitionRow; max: number }) {
  const width = Math.max(row.leads ? 4 : 0, (row.leads / max) * 100);
  return (
    <Link href={`/attribution?q=${encodeURIComponent(row.name)}`} className={styles.sourceRow}>
      <span>{row.name}</span>
      <div className={styles.mutedBar}><span style={{ width: `${width}%` }} /></div>
      <b>{formatNumber(row.leads)}</b>
      <small>{formatNumber(row.qualified)} qual.</small>
    </Link>
  );
}

function FunnelRow({ label, value, base }: { label: string; value: number; base: number }) {
  const width = base > 0 ? Math.max(value > 0 ? 3 : 0, Math.min(100, (value / base) * 100)) : 0;
  return (
    <div className={styles.funnelRow}>
      <span>{label}</span>
      <div className={styles.funnelBar}><i style={{ width: `${width}%` }} /></div>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function EvidenceRow({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'warning' | 'good' }) {
  return (
    <div className={styles.evidenceRow}>
      <span>{label}</span>
      <span className={tone === 'warning' ? styles.pillAmber : tone === 'good' ? styles.pill : styles.pillGray}>{value}</span>
    </div>
  );
}

function CampaignRow({ row, rank }: { row: CampaignWorkspaceRow; rank: number }) {
  return (
    <Link href={`/campaigns?q=${encodeURIComponent(row.name)}`} className={styles.campaignRow}>
      <div className={styles.rank}>{String(rank).padStart(2, '0')}</div>
      <div className={styles.campaignMain}>
        <strong>{row.name}</strong>
        <span>{row.leads} leads · {row.qualified} qualified · {row.cac === null ? 'CAC unavailable' : `${formatMoney(row.cac, row.spendCurrency)} CAC`}</span>
      </div>
      <div className={styles.campaignOutcome}>
        <strong>{row.enrolled}</strong>
        <small>enrolled</small>
      </div>
      <ArrowRight size={13} className={styles.rowArrow} />
    </Link>
  );
}

function MomentumCard({ label, movement }: { label: string; movement: Movement }) {
  const down = movement.delta !== null && movement.delta < 0;
  return (
    <div className={styles.momentumCard}>
      <div className={styles.momentumIcon}>{down ? <TrendingDown size={14} /> : <TrendingUp size={14} />}</div>
      <span>{label}</span>
      <strong>{movement.delta === null ? '—' : shortDelta(movement.delta)}</strong>
      <small>{movement.delta === null ? 'Not enough history' : `${formatNumber(movement.current)} recent vs ${formatNumber(movement.previous)} prior`}</small>
    </div>
  );
}

function buildMovement(rows: unknown[]) {
  const daily = rows.map(asRecord).map((row) => ({
    sessions: numberValue(row.sessions, row.visitors, row.traffic),
    leads: numberValue(row.leads, row.lead_count, row.crm_leads),
    qualified: numberValue(row.qualified, row.qualified_leads, row.qualified_count),
    enrolled: numberValue(row.enrolled, row.enrolled_leads, row.enrolled_count),
  })).filter((row) => row.sessions > 0 || row.leads > 0 || row.qualified > 0 || row.enrolled > 0);

  const split = Math.floor(daily.length / 2);
  if (split < 2) return emptyMovement();
  const previous = daily.slice(0, split);
  const current = daily.slice(split);

  return {
    sessions: movementFor(previous, current, 'sessions'),
    leads: movementFor(previous, current, 'leads'),
    qualified: movementFor(previous, current, 'qualified'),
    enrolled: movementFor(previous, current, 'enrolled'),
  };
}

function movementFor(previous: DailySignal[], current: DailySignal[], key: keyof DailySignal): Movement {
  const previousValue = previous.reduce((sum, row) => sum + row[key], 0);
  const currentValue = current.reduce((sum, row) => sum + row[key], 0);
  const delta = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : null;
  return { current: currentValue, previous: previousValue, delta };
}

function emptyMovement() {
  const empty = { current: 0, previous: 0, delta: null } satisfies Movement;
  return { sessions: { ...empty }, leads: { ...empty }, qualified: { ...empty }, enrolled: { ...empty } };
}

function buildAttentionQueue({ poorCampaign, missingRoas, strongest, movement, campaignCount }: { poorCampaign?: CampaignWorkspaceRow; missingRoas: number; strongest?: CampaignWorkspaceRow; movement: ReturnType<typeof buildMovement>; campaignCount: number }): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (poorCampaign) {
    items.push({
      score: 100 + Math.min(50, poorCampaign.spend / 1000),
      tone: 'critical',
      title: 'Spend without qualified outcomes',
      detail: `${poorCampaign.name} · ${formatMoney(poorCampaign.spend, poorCampaign.spendCurrency)} spend · ${poorCampaign.leads} leads · 0 qualified.`,
      href: '/campaigns',
      label: 'Review',
    });
  }

  if (movement.qualified.delta !== null && movement.qualified.delta <= -15) {
    items.push({
      score: 92 + Math.min(30, Math.abs(movement.qualified.delta)),
      tone: 'critical',
      title: 'Qualification momentum declined',
      detail: `${formatDelta(movement.qualified.delta, 'Qualified outcomes')} versus the prior half of the observed period. Check lead quality and admissions handling before increasing budget.`,
      href: '/funnel',
      label: 'Review',
    });
  } else if (movement.leads.delta !== null && movement.leads.delta <= -15) {
    items.push({
      score: 84 + Math.min(30, Math.abs(movement.leads.delta)),
      tone: 'warning',
      title: 'Lead momentum declined',
      detail: `${formatDelta(movement.leads.delta, 'Leads')} versus the prior half of the observed period. Review acquisition mix and campaign delivery.`,
      href: '/analytics',
      label: 'Review',
    });
  }

  if (missingRoas > 0) {
    items.push({
      score: 70 + Math.min(20, missingRoas * 2),
      tone: 'warning',
      title: 'Campaign efficiency has incomplete evidence',
      detail: `${missingRoas} of ${campaignCount || missingRoas} campaign${campaignCount === 1 ? '' : 's'} do not have enough known revenue/spend evidence for ROAS.`,
      href: '/attribution',
      label: 'Review',
    });
  }

  if (strongest) {
    items.push({
      score: 45 + Math.min(20, strongest.enrolled * 2),
      tone: 'positive',
      title: 'Potential scale opportunity',
      detail: `${strongest.name} · ${strongest.enrolled} enrolled · ${strongest.cac === null ? 'CAC unavailable' : `${formatMoney(strongest.cac, strongest.spendCurrency)} CAC`}. Review marginal efficiency before increasing spend.`,
      href: '/campaigns',
      label: 'Inspect',
    });
  }

  return items.sort((a, b) => b.score - a.score);
}

function normalizeSources(rows: unknown[]): AcquisitionRow[] {
  return rows.map(asRecord).map((row) => ({
    name: stringValue(row.source, row.first_touch_source, row.channel, row.name) || 'Unknown',
    leads: numberValue(row.leads, row.lead_count),
    qualified: numberValue(row.qualified_leads, row.qualified, row.qualified_count),
    enrolled: numberValue(row.enrolled_leads, row.enrolled, row.enrolled_count),
  })).filter((row) => row.leads > 0 || row.qualified > 0 || row.enrolled > 0).sort((a, b) => b.leads - a.leads);
}

function fallbackAcquisition(rows: CampaignWorkspaceRow[]): AcquisitionRow[] {
  const grouped = new Map<string, AcquisitionRow>();
  for (const row of rows) {
    const key = row.platform || 'Unknown';
    const current = grouped.get(key) ?? { name: key, leads: 0, qualified: 0, enrolled: 0 };
    current.leads += row.leads;
    current.qualified += row.qualified;
    current.enrolled += row.enrolled;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.leads - a.leads);
}

function sumCampaign(rows: CampaignWorkspaceRow[], key: 'highIntent' | 'paymentPending') {
  return rows.reduce((sum, row) => sum + row[key], 0);
}

function tonePill(tone: AttentionItem['tone']) {
  if (tone === 'critical') return styles.pillRed;
  if (tone === 'warning') return styles.pillAmber;
  if (tone === 'positive') return styles.pill;
  return styles.pillGray;
}

function priorityLabel(tone: AttentionItem['tone']) {
  if (tone === 'critical') return 'High priority';
  if (tone === 'warning') return 'Review';
  if (tone === 'positive') return 'Opportunity';
  return 'Monitor';
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value ?? 0);
    if (Number.isFinite(number) && number !== 0) return number;
  }
  return 0;
}

function positiveNumber(primary: unknown, fallback: number) {
  const value = Number(primary ?? 0);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function stringValue(...values: unknown[]) {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value || 0);
}

function formatMoney(value: number, currency = 'INR', compact = false) {
  if (compact && Math.abs(value) >= 1000000) return `${currency === 'INR' ? '₹' : '$'}${(value / 1000000).toFixed(2)}M`;
  if (compact && Math.abs(value) >= 1000) return `${currency === 'INR' ? '₹' : '$'}${(value / 1000).toFixed(1)}K`;
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value || 0);
  } catch {
    return `${currency} ${formatNumber(value)}`;
  }
}

function formatPercent(value: number, denominator: number) {
  return denominator > 0 ? `${((value / denominator) * 100).toFixed(1)}%` : '—';
}

function formatDelta(delta: number, label: string) {
  if (delta === 0) return `${label} flat`;
  return `${label} ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)}%`;
}

function shortDelta(delta: number) {
  if (delta === 0) return 'Flat';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
}
