import Link from 'next/link';
import { AlertTriangle, ArrowRight, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';

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
    .slice(0, 4);
  const poorCampaign = campaigns.campaigns.find((row) => row.spend > 0 && row.qualified === 0);
  const missingRoas = campaigns.campaigns.filter((row) => row.spend > 0 && row.roas === null).length;
  const strongest = [...campaigns.campaigns]
    .filter((row) => row.cac !== null && row.enrolled > 0)
    .sort((a, b) => (a.cac ?? Number.POSITIVE_INFINITY) - (b.cac ?? Number.POSITIVE_INFINITY))[0];

  const warnings = [campaigns.warning, funnel.warning, revenue.warning].filter(Boolean) as string[];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Marketing Studio</div>
          <h1 className={styles.title}>Marketing Command Center</h1>
          <p className={styles.subtitle}>See acquisition quality, campaign performance and revenue impact in one place.</p>
        </div>
        <div className={styles.controls}>
          <div className={styles.control}>Latest 30 days</div>
          <div className={styles.control}>INR</div>
          <Link href="/marketing" className={styles.button} aria-label="Refresh Marketing Command Center">
            <RefreshCw size={13} /> Refresh
          </Link>
        </div>
      </header>

      {warnings.length ? <div className={styles.warning}>{warnings[0]}</div> : null}

      <section className={styles.pulse} aria-label="Marketing performance summary">
        <Pulse label="Spend" value={formatMoney(spendInr, 'INR', true)} note="Advertising spend · INR" />
        <Pulse label="Leads" value={formatNumber(totalLeads)} note="Observed CRM leads" />
        <Pulse label="Qualified" value={formatNumber(qualified)} note={`${formatPercent(qualified, totalLeads)} of leads`} />
        <Pulse label="Enrolled" value={formatNumber(enrolled)} note={`${formatPercent(enrolled, totalLeads)} of leads`} />
        <Pulse label="Revenue" value={formatMoney(revenueInr, 'INR', true)} note={revenueUsd > 0 ? `Plus ${formatMoney(revenueUsd, 'USD', true)} · kept separate` : 'CRM collected · INR'} />
        <Pulse label="Paid ROAS" value={roas === null ? 'Partial coverage' : `${roas.toFixed(1)}×`} note={roas === null ? 'Inspect complete campaign evidence' : 'Known INR evidence only'} partial={roas === null} />
      </section>

      <div className={styles.grid}>
        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Acquisition Mix</h2>
                <p>Volume is a starting point. Quality tells you what follows.</p>
              </div>
              <div className={styles.segmented} aria-label="Acquisition mix view"><span>Volume</span><span>Quality</span><span>Revenue</span></div>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.mixHead}><span>Channel</span><span>Lead volume</span><span>Leads</span><span>Qual.</span><span>Enr.</span></div>
              {sourceRows.slice(0, 7).map((row) => (
                <div className={styles.mixRow} key={row.name}>
                  <span className={styles.mixName}><i className={styles.dot} />{row.name}</span>
                  <span className={styles.bar}><i style={{ width: `${Math.max(row.leads ? 3 : 0, (row.leads / maxLeadVolume) * 100)}%` }} /></span>
                  <strong className={styles.number}>{formatNumber(row.leads)}</strong>
                  <strong className={styles.number}>{formatNumber(row.qualified)}</strong>
                  <strong className={styles.number}>{formatNumber(row.enrolled)}</strong>
                </div>
              ))}
              <p className={styles.caption}>Exact values are shown where observed. Missing source evidence stays Unknown rather than being inferred.</p>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.attention}`}>
            <div className={styles.panelHeader}>
              <div><h2>Needs Attention</h2><p>Ranked investigations from current marketing evidence.</p></div>
              <Sparkles size={16} />
            </div>
            <div className={styles.panelBody}>
              {poorCampaign ? (
                <Attention icon={<AlertTriangle size={14} />} title="Spend without qualified outcomes" detail={`${poorCampaign.name} · ${formatMoney(poorCampaign.spend, poorCampaign.spendCurrency)} spend · ${poorCampaign.leads} leads · 0 qualified`} href="/campaigns" label="Inspect campaign" />
              ) : null}
              {missingRoas > 0 ? (
                <Attention icon={<Sparkles size={14} />} title="Campaign efficiency has incomplete evidence" detail={`${missingRoas} campaign${missingRoas === 1 ? '' : 's'} do not have enough known revenue/spend evidence for ROAS.`} href="/attribution" label="Inspect attribution" />
              ) : null}
              {strongest ? (
                <Attention icon={<TrendingUp size={14} />} title="Strong enrollment efficiency" detail={`${strongest.name} · ${strongest.enrolled} enrolled · ${strongest.cac === null ? 'CAC unavailable' : `${formatMoney(strongest.cac, strongest.spendCurrency)} CAC`}`} href="/campaigns" label="Inspect performance" green />
              ) : null}
              {!poorCampaign && missingRoas === 0 && !strongest ? <p className={styles.caption}>No priority investigation is supported by the current evidence.</p> : null}
            </div>
          </section>
        </div>

        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><h2>Marketing Funnel</h2><p>From acquisition to enrollment.</p></div>
              <Link href="/funnel" className={styles.link}>Explore <ArrowRight size={12} /></Link>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.funnel}>
                <FunnelRow label="Traffic" value={traffic} base={traffic} />
                <FunnelRow label="Lead" value={totalLeads} base={traffic} />
                <FunnelRow label="Qualified" value={qualified} base={totalLeads} />
                <FunnelRow label="High Intent" value={highIntent} base={totalLeads} />
                <FunnelRow label="Payment Pending" value={paymentPending} base={totalLeads} />
                <FunnelRow label="Enrolled" value={enrolled} base={totalLeads} />
              </div>
              <p className={styles.caption}>Counts are observed states/milestones. Bars show stage share and do not imply causal attribution.</p>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><h2>Top Performers</h2><p>Ranked by enrollments in the current campaign scope.</p></div>
            </div>
            <div className={styles.panelBody}>
              {topCampaigns.length ? topCampaigns.map((row, index) => (
                <Link href="/campaigns" className={styles.rankRow} key={row.id}>
                  <span className={styles.rankNum}>{index + 1}</span>
                  <span className={styles.rankMain}><strong>{row.name}</strong><small>{row.qualified} qualified · {row.cac === null ? 'CAC unavailable' : `CAC ${formatMoney(row.cac, row.spendCurrency)}`}</small></span>
                  <span className={styles.rankValue}>{row.enrolled}<small style={{ display: 'block', fontSize: 7, color: '#758279', fontWeight: 400 }}>enrolled</small></span>
                </Link>
              )) : <p className={styles.caption}>No connected paid campaign rows are available in this scope.</p>}
            </div>
          </section>
        </div>
      </div>

      <div className={styles.changeFeed}>
        <strong>What changed</strong>
        <span>{campaigns.summary.campaigns} campaign{campaigns.summary.campaigns === 1 ? '' : 's'} in scope</span>
        <span>{formatNumber(qualified)} leads reached qualification</span>
        <span>{formatNumber(enrolled)} observed enrollments</span>
        <span>{roas === null ? 'ROAS coverage remains partial' : `Known paid ROAS ${roas.toFixed(1)}×`}</span>
      </div>
    </div>
  );
}

function Pulse({ label, value, note, partial = false }: { label: string; value: string; note: string; partial?: boolean }) {
  return <div className={styles.pulseItem}><span className={styles.pulseLabel}>{label}</span><strong className={`${styles.pulseValue} ${partial ? styles.partial : ''}`}>{value}</strong><small className={styles.pulseNote}>{note}</small></div>;
}

function Attention({ icon, title, detail, href, label, green = false }: { icon: React.ReactNode; title: string; detail: string; href: string; label: string; green?: boolean }) {
  return <div className={styles.attentionItem}><span className={`${styles.attentionIcon} ${green ? styles.attentionIconGreen : ''}`}>{icon}</span><div className={styles.attentionText}><h3>{title}</h3><p>{detail}</p><Link href={href} className={styles.link}>{label} <ArrowRight size={11} /></Link></div></div>;
}

function FunnelRow({ label, value, base }: { label: string; value: number; base: number }) {
  const width = base > 0 ? Math.max(value > 0 ? 3 : 0, Math.min(100, (value / base) * 100)) : 0;
  return <div className={styles.funnelRow}><span>{label}</span><span className={styles.funnelBar}><i style={{ width: `${width}%` }} /></span><strong className={styles.funnelCount}>{formatNumber(value)}</strong></div>;
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
