import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Megaphone,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import type { CampaignWorkspaceRow } from '@/components/campaigns-workspace';
import { getCampaignsWorkspace } from '@/lib/campaigns-data';
import { getFunnelWorkspace } from '@/lib/funnel-data';
import { getRevenueWorkspace } from '@/lib/revenue-data';

import styles from './marketing-command-center.module.css';

type UnknownRecord = Record<string, unknown>;
type AcquisitionRow = { name: string; leads: number; qualified: number; enrolled: number };
type DailySignal = { sessions: number; leads: number; qualified: number; enrolled: number };
type Movement = { current: number; previous: number; delta: number | null };
type AttentionItem = {
  score: number;
  tone: 'critical' | 'warning' | 'positive' | 'neutral';
  title: string;
  detail: string;
  href: string;
  label: string;
};

export async function MarketingCommandCenterOverview() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [campaigns, funnel, revenue] = await Promise.all([
    getCampaignsWorkspace({ query: '', platform: 'all', outcome: 'all', sortMode: 'spend_desc', page: 1, pageSize: 50 }),
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
  const evidenceKnown = campaigns.summary.campaigns > 0 ? Math.max(0, campaigns.summary.campaigns - missingRoas) : 0;
  const evidenceCoverage = campaigns.summary.campaigns > 0 ? (evidenceKnown / campaigns.summary.campaigns) * 100 : null;
  const attention = buildAttentionQueue({ poorCampaign, missingRoas, strongest, movement, campaignCount: campaigns.summary.campaigns });
  const primaryAttention = attention[0] ?? null;
  const warnings = [campaigns.warning, funnel.warning, revenue.warning].filter(Boolean) as string[];

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div>
          <div className={styles.kicker}>SALSYSOS / GROWTH OPERATIONS</div>
          <h1>Marketing Command Center</h1>
          <p>See what needs attention today, how demand is moving, and where growth evidence is strong enough to act.</p>
        </div>
        <div className={styles.introActions}>
          <Link href="/marketing?view=analytics" className={styles.button}><ShieldCheck size={14} /> Data health</Link>
          <Link href="/marketing?view=campaigns" className={styles.buttonPrimary}><Megaphone size={14} /> Open campaigns</Link>
        </div>
      </header>

      {warnings.length ? <div className={styles.warning}><AlertTriangle size={15} /><span>{warnings[0]}</span></div> : null}

      <section className={styles.todayDeck}>
        <div className={styles.todayPrimary}>
          <div className={styles.kickerLight}>YOUR DAILY GROWTH BRIEF</div>
          <h2>{primaryAttention?.title ?? 'Growth evidence is stable.'}</h2>
          <p>{primaryAttention?.detail ?? 'Current acquisition and conversion evidence does not support an urgent exception. Keep lead quality, campaign efficiency, and downstream outcomes under review.'}</p>
          <div className={styles.todayActions}>
            <Link href={primaryAttention?.href ?? '/marketing?view=campaigns'} className={styles.heroPrimary}>Open growth priorities <ArrowRight size={13} /></Link>
            <Link href="/marketing?view=campaigns" className={styles.heroSecondary}>Review campaigns</Link>
          </div>
        </div>

        <div className={styles.growthPath} aria-label="Marketing decision path">
          <GrowthStep icon={<Megaphone size={18} />} title="Acquire" detail="Traffic and demand" />
          <span className={styles.pathConnector} aria-hidden="true" />
          <GrowthStep icon={<Activity size={18} />} title="Prioritize" detail="Lead quality and signal" />
          <span className={styles.pathConnector} aria-hidden="true" />
          <GrowthStep icon={<ShieldCheck size={18} />} title="Act" detail="Human growth decision" />
        </div>
      </section>

      <section className={styles.kpiGrid} aria-label="Marketing performance summary">
        <DecisionMetric label="Spend" value={formatMoney(spendInr, 'INR', true)} note="Observed paid media" />
        <DecisionMetric label="Leads" value={formatNumber(totalLeads)} note={`${formatPercent(qualified, totalLeads)} qualified`} />
        <DecisionMetric label="Qualified" value={formatNumber(qualified)} note={`${formatNumber(enrolled)} enrolled`} />
        <DecisionMetric label="Revenue" value={formatMoney(revenueInr, 'INR', true)} note={roas === null ? 'ROAS partial' : `${roas.toFixed(1)}× paid ROAS`} />
      </section>

      <section className={styles.operatingGrid}>
        <aside className={styles.priorityRail}>
          <div className={styles.sectionHeading}>
            <div>
              <div className={styles.kicker}>PRIORITY INTELLIGENCE</div>
              <h2>What needs action</h2>
            </div>
            <span className={styles.signalCount}>{attention.length}</span>
          </div>

          <div className={styles.priorityList}>
            {attention.length ? attention.slice(0, 5).map((item, index) => (
              <PriorityItem key={`${item.title}-${index}`} item={item} rank={index + 1} />
            )) : (
              <div className={styles.emptyState}>
                <TrendingUp size={18} />
                <strong>No urgent growth investigation.</strong>
                <span>Current evidence does not support an exception.</span>
              </div>
            )}
          </div>
          <Link href="/marketing?view=analytics" className={styles.railFooter}>View full analysis <ArrowRight size={12} /></Link>
        </aside>

        <section className={styles.journeySurface}>
          <div className={styles.journeyHeader}>
            <div>
              <div className={styles.kicker}>ACQUISITION → CONVERSION</div>
              <h2>How demand is moving</h2>
              <p>One connected view from traffic source to downstream CRM outcome.</p>
            </div>
            <Link href="/marketing?view=funnel" className={styles.nakedLink}>Open funnel <ArrowRight size={12} /></Link>
          </div>

          <div className={styles.journeyStages}>
            <JourneyStage label="Traffic" value={traffic} detail="Observed sessions" />
            <JourneyStage label="Leads" value={totalLeads} detail={traffic > 0 ? `${formatPercent(totalLeads, traffic)} of traffic` : 'Observed CRM leads'} />
            <JourneyStage label="Qualified" value={qualified} detail={`${formatPercent(qualified, totalLeads)} of leads`} />
            <JourneyStage label="High intent" value={highIntent} detail={`${formatPercent(highIntent, totalLeads)} of leads`} />
            <JourneyStage label="Payment pending" value={paymentPending} detail={`${formatPercent(paymentPending, totalLeads)} of leads`} />
            <JourneyStage label="Enrolled" value={enrolled} detail={`${formatPercent(enrolled, totalLeads)} of leads`} />
          </div>

          <div className={styles.journeyBottom}>
            <div className={styles.sourceBlock}>
              <div className={styles.subheading}><span>Where demand starts</span><Link href="/marketing?view=attribution">Attribution <ArrowRight size={11} /></Link></div>
              {sourceRows.length ? sourceRows.slice(0, 6).map((row) => <SourceRow key={row.name} row={row} max={maxLeadVolume} />) : <div className={styles.miniEmpty}>No source-level evidence available.</div>}
            </div>

            <div className={styles.readinessBlock}>
              <div className={styles.subheading}><span>Can we trust the signal?</span><Link href="/marketing?view=attribution">Inspect <ArrowRight size={11} /></Link></div>
              <div className={styles.readinessHero}>
                <ShieldCheck size={18} />
                <div>
                  <strong>{evidenceCoverage === null ? 'Coverage unknown' : `${evidenceCoverage.toFixed(0)}% campaign coverage`}</strong>
                  <span>{missingRoas > 0 ? `${missingRoas} campaigns still lack complete efficiency evidence.` : 'Campaign efficiency evidence is complete for the current scope.'}</span>
                </div>
              </div>
              <div className={styles.evidenceList}>
                <EvidenceRow label="Paid ROAS" value={roas === null ? 'Partial' : `${roas.toFixed(1)}×`} tone={roas === null ? 'warning' : 'good'} />
                <EvidenceRow label="Lead volume movement" value={movement.leads.delta === null ? 'No history' : shortDelta(movement.leads.delta)} />
                <EvidenceRow label="Qualified momentum" value={movement.qualified.delta === null ? 'No history' : shortDelta(movement.qualified.delta)} tone={movement.qualified.delta !== null && movement.qualified.delta < -10 ? 'warning' : 'neutral'} />
                <EvidenceRow label="Revenue scope" value={revenueUsd > 0 ? 'Multi-currency' : 'INR'} />
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className={styles.lowerGrid}>
        <section className={styles.campaignSurface}>
          <div className={styles.sectionHeadingWide}>
            <div>
              <div className={styles.kicker}>CAMPAIGN PERFORMANCE</div>
              <h2>What is actually producing outcomes</h2>
              <p>Ranked by observed enrollment, qualification and cost evidence.</p>
            </div>
            <Link href="/marketing?view=campaigns" className={styles.nakedLink}>All campaigns <ArrowRight size={12} /></Link>
          </div>
          <div className={styles.campaignList}>
            {topCampaigns.length ? topCampaigns.map((row, index) => <CampaignRow key={row.id} row={row} rank={index + 1} />) : <div className={styles.emptyState}><Megaphone size={18} /><strong>No campaign evidence yet.</strong><span>Connect paid-media campaign data to populate this list.</span></div>}
          </div>
        </section>

        <section className={styles.momentumSurface}>
          <div className={styles.sectionHeadingWide}>
            <div>
              <div className={styles.kicker}>MOMENTUM</div>
              <h2>What changed</h2>
              <p>Recent half of the observed period versus the prior half.</p>
            </div>
          </div>
          <div className={styles.momentumStack}>
            <MomentumCard label="Sessions" movement={movement.sessions} />
            <MomentumCard label="Lead volume" movement={movement.leads} neutral />
            <MomentumCard label="Qualified" movement={movement.qualified} />
            <MomentumCard label="Enrolled" movement={movement.enrolled} />
          </div>
        </section>
      </section>
    </div>
  );
}

function GrowthStep({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className={styles.growthStep}>
      <div className={styles.growthStepIcon}>{icon}</div>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function DecisionMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.decisionMetric}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function JourneyStage({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className={styles.journeyStage}><span>{label}</span><strong>{formatNumber(value)}</strong><small>{detail}</small></div>;
}

function PriorityItem({ item, rank }: { item: AttentionItem; rank: number }) {
  return (
    <Link href={item.href} className={styles.priorityItem}>
      <div className={styles.priorityRank}>{String(rank).padStart(2, '0')}</div>
      <div className={styles.priorityMain}>
        <div className={styles.priorityTop}><strong>{item.title}</strong><span className={tonePill(item.tone)}>{priorityLabel(item.tone)}</span></div>
        <p>{item.detail}</p>
      </div>
      <ArrowRight size={13} />
    </Link>
  );
}

function SourceRow({ row, max }: { row: AcquisitionRow; max: number }) {
  const width = Math.max(row.leads ? 4 : 0, (row.leads / max) * 100);
  return (
    <Link href={`/marketing?view=attribution&q=${encodeURIComponent(row.name)}`} className={styles.sourceRow}>
      <span>{row.name}</span>
      <div className={styles.sourceTrack}><i style={{ width: `${width}%` }} /></div>
      <b>{formatNumber(row.leads)}</b>
      <small>{formatNumber(row.qualified)} qual.</small>
    </Link>
  );
}

function EvidenceRow({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'warning' | 'good' }) {
  return <div className={styles.evidenceRow}><span>{label}</span><span className={tone === 'warning' ? styles.pillAmber : tone === 'good' ? styles.pill : styles.pillGray}>{value}</span></div>;
}

function CampaignRow({ row, rank }: { row: CampaignWorkspaceRow; rank: number }) {
  return (
    <Link href={`/marketing?view=campaigns&q=${encodeURIComponent(row.name)}`} className={styles.campaignRow}>
      <div className={styles.rank}>{String(rank).padStart(2, '0')}</div>
      <div className={styles.campaignMain}><strong>{row.name}</strong><span>{row.leads} leads · {row.qualified} qualified · {row.cac === null ? 'CAC unavailable' : `${formatMoney(row.cac, row.spendCurrency)} CAC`}</span></div>
      <div className={styles.campaignOutcome}><strong>{row.enrolled}</strong><small>enrolled</small></div>
      <ArrowRight size={13} className={styles.rowArrow} />
    </Link>
  );
}

function MomentumCard({ label, movement, neutral = false }: { label: string; movement: Movement; neutral?: boolean }) {
  const down = movement.delta !== null && movement.delta < 0;
  return (
    <div className={styles.momentumCard}>
      <div className={styles.momentumIcon}>{neutral ? <Activity size={14} /> : down ? <TrendingDown size={14} /> : <TrendingUp size={14} />}</div>
      <div className={styles.momentumCopy}><span>{label}</span><small>{movement.delta === null ? 'Not enough history' : `${formatNumber(movement.current)} recent vs ${formatNumber(movement.previous)} prior`}</small></div>
      <strong>{movement.delta === null ? '—' : shortDelta(movement.delta)}</strong>
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
  if (poorCampaign) items.push({ score: 100 + Math.min(50, poorCampaign.spend / 1000), tone: 'critical', title: 'Spend without qualified outcomes', detail: `${poorCampaign.name} · ${formatMoney(poorCampaign.spend, poorCampaign.spendCurrency)} spend · ${poorCampaign.leads} leads · 0 qualified.`, href: '/marketing?view=campaigns', label: 'Review' });
  if (movement.qualified.delta !== null && movement.qualified.delta <= -15) {
    items.push({ score: 92 + Math.min(30, Math.abs(movement.qualified.delta)), tone: 'critical', title: 'Qualification momentum declined', detail: `${formatDelta(movement.qualified.delta, 'Qualified outcomes')} versus the prior half of the observed period. Check lead quality and admissions handling before increasing budget.`, href: '/marketing?view=funnel', label: 'Review' });
  } else if (movement.leads.delta !== null && movement.leads.delta <= -15) {
    items.push({ score: 52 + Math.min(12, Math.abs(movement.leads.delta) / 3), tone: 'neutral', title: 'Lead volume changed materially', detail: `${formatDelta(movement.leads.delta, 'Lead volume')} versus the prior half of the observed period. Investigate acquisition mix and outcome quality before interpreting the movement as positive or negative.`, href: '/marketing?view=analytics', label: 'Monitor' });
  }
  if (missingRoas > 0) items.push({ score: 70 + Math.min(20, missingRoas * 2), tone: 'warning', title: 'Campaign efficiency has incomplete evidence', detail: `${missingRoas} of ${campaignCount || missingRoas} campaign${campaignCount === 1 ? '' : 's'} do not have enough known revenue/spend evidence for ROAS.`, href: '/marketing?view=attribution', label: 'Review' });
  if (strongest) items.push({ score: 45 + Math.min(20, strongest.enrolled * 2), tone: 'positive', title: 'Potential scale opportunity', detail: `${strongest.name} · ${strongest.enrolled} enrolled · ${strongest.cac === null ? 'CAC unavailable' : `${formatMoney(strongest.cac, strongest.spendCurrency)} CAC`}. Review marginal efficiency before increasing spend.`, href: '/marketing?view=campaigns', label: 'Inspect' });
  return items.sort((a, b) => b.score - a.score);
}

function normalizeSources(rows: unknown[]): AcquisitionRow[] {
  return rows.map(asRecord).map((row) => ({ name: stringValue(row.source, row.first_touch_source, row.channel, row.name) || 'Unknown', leads: numberValue(row.leads, row.lead_count), qualified: numberValue(row.qualified_leads, row.qualified, row.qualified_count), enrolled: numberValue(row.enrolled_leads, row.enrolled, row.enrolled_count) })).filter((row) => row.leads > 0 || row.qualified > 0 || row.enrolled > 0).sort((a, b) => b.leads - a.leads);
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

function sumCampaign(rows: CampaignWorkspaceRow[], key: 'highIntent' | 'paymentPending') { return rows.reduce((sum, row) => sum + row[key], 0); }
function tonePill(tone: AttentionItem['tone']) { if (tone === 'critical') return styles.pillRed; if (tone === 'warning') return styles.pillAmber; if (tone === 'positive') return styles.pill; return styles.pillGray; }
function priorityLabel(tone: AttentionItem['tone']) { if (tone === 'critical') return 'High'; if (tone === 'warning') return 'Review'; if (tone === 'positive') return 'Opportunity'; return 'Monitor'; }
function asRecord(value: unknown): UnknownRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}; }
function numberValue(...values: unknown[]) { for (const value of values) { const number = Number(value ?? 0); if (Number.isFinite(number) && number !== 0) return number; } return 0; }
function positiveNumber(primary: unknown, fallback: number) { const value = Number(primary ?? 0); return Number.isFinite(value) && value > 0 ? value : fallback; }
function stringValue(...values: unknown[]) { for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim(); return ''; }
function formatNumber(value: number) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value || 0); }
function formatMoney(value: number, currency = 'INR', compact = false) {
  if (compact && Math.abs(value) >= 1000000) return `${currency === 'INR' ? '₹' : '$'}${(value / 1000000).toFixed(2)}M`;
  if (compact && Math.abs(value) >= 1000) return `${currency === 'INR' ? '₹' : '$'}${(value / 1000).toFixed(1)}K`;
  try { return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value || 0); } catch { return `${currency} ${formatNumber(value)}`; }
}
function formatPercent(value: number, denominator: number) { return denominator > 0 ? `${((value / denominator) * 100).toFixed(1)}%` : '—'; }
function formatDelta(delta: number, label: string) { if (delta === 0) return `${label} flat`; return `${label} ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)}%`; }
function shortDelta(delta: number) { if (delta === 0) return 'Flat'; return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`; }
