'use client';

import Link from 'next/link';
import { ArrowRight, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type {
  CampaignWorkspaceFilters,
  CampaignWorkspacePagination,
  CampaignWorkspacePlatform,
  CampaignWorkspaceRow,
  CampaignWorkspaceSummary,
} from '@/components/campaigns-workspace';
import { MarketingInspector } from '@/components/marketing/marketing-inspector';
import styles from '@/components/marketing/campaigns-reference.module.css';

export function CampaignsIntelligenceWorkspace({
  campaigns,
  summary,
  platforms,
  pagination,
  filters,
  mock,
}: {
  campaigns: CampaignWorkspaceRow[];
  summary: CampaignWorkspaceSummary;
  platforms: CampaignWorkspacePlatform[];
  pagination: CampaignWorkspacePagination;
  filters: CampaignWorkspaceFilters;
  mock: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.query);
  const [selected, setSelected] = useState<CampaignWorkspaceRow | null>(null);

  useEffect(() => setSearch(filters.query), [filters.query]);

  const replaceParams = useCallback((changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || (key !== 'q' && value === 'all')) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const value = search.trim();
    if (value === filters.query) return;
    const timer = window.setTimeout(() => replaceParams({ q: value || null, page: null }), 350);
    return () => window.clearTimeout(timer);
  }, [filters.query, replaceParams, search]);

  const clear = () => {
    setSearch('');
    replaceParams({ q: null, platform: null, outcome: null, sort: null, page: null });
  };

  const spend = Object.entries(summary.spendByCurrency)
    .filter(([, amount]) => amount > 0)
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(' · ') || '—';
  const roasKnown = campaigns.length > 0 && campaigns.every((row) => row.roas !== null);
  const totalSpend = campaigns.reduce((total, row) => total + row.spend, 0);
  const sameCurrency = campaigns.length > 0 && new Set(campaigns.map((row) => row.spendCurrency.toUpperCase())).size === 1;
  const revenueForSpendCurrency = sameCurrency
    ? campaigns[0]?.spendCurrency.toUpperCase() === 'USD' ? summary.revenueUsd : summary.revenueInr
    : 0;
  const roas = roasKnown && sameCurrency && totalSpend > 0 ? revenueForSpendCurrency / totalSpend : null;
  const allCampaignCount = platforms.reduce((total, item) => total + item.count, 0);
  const filtersActive = Boolean(filters.query) || filters.platform !== 'all' || filters.outcome !== 'all' || filters.sortMode !== 'spend_desc';

  return (
    <div className={styles.root}>
      <section className={styles.stats} aria-label="Campaign performance summary">
        <StatCard label="Ad spend" value={spend} note={`${summary.campaigns.toLocaleString('en-IN')} campaigns in view`} />
        <StatCard label="CRM leads" value={summary.leads.toLocaleString('en-IN')} note={`${summary.clicks.toLocaleString('en-IN')} observed ad-platform clicks`} />
        <StatCard label="Qualified" value={summary.qualified.toLocaleString('en-IN')} note={`${percent(summary.qualified, summary.leads)} of matched leads`} />
        <StatCard label="Enrolled" value={summary.enrolled.toLocaleString('en-IN')} note={roas === null ? 'ROAS evidence remains partial' : `${roas.toFixed(1)}× observed ROAS`} />
      </section>

      {!sameCurrency && campaigns.length > 0 ? (
        <div className={styles.ribbon}><span>◈</span><p><strong>Currencies stay separate.</strong> Campaign spend and CRM revenue are not combined across INR and USD.</p><Link href="/revenue">Inspect revenue evidence <ArrowRight size={11} /></Link></div>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div><div className={styles.kicker}>CAMPAIGN INTELLIGENCE</div><h2>Campaign explorer</h2><p>Filter paid-media evidence, then open a campaign to inspect the CRM outcomes behind it.</p></div>
          <Link href="/attribution">Inspect attribution <ArrowRight size={11} /></Link>
        </div>

        <div className={styles.tabs}>
          <button type="button" className={`${styles.tab} ${filters.platform === 'all' ? styles.tabActive : ''}`} onClick={() => replaceParams({ platform: null, page: null })}>All<small>{allCampaignCount}</small></button>
          {platforms.map((item) => (
            <button key={item.platform} type="button" className={`${styles.tab} ${filters.platform === item.platform ? styles.tabActive : ''}`} onClick={() => replaceParams({ platform: item.platform, page: null })}>{item.platform}<small>{item.count}</small></button>
          ))}
        </div>

        <div className={styles.toolbar}>
          <label className={styles.search}><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campaign name or campaign ID" /></label>
          <select className={styles.select} value={filters.outcome} onChange={(event) => replaceParams({ outcome: event.target.value, page: null })}>
            <option value="all">All outcomes</option><option value="with_leads">With CRM leads</option><option value="no_leads">No attributed leads</option><option value="qualified">Qualified leads</option><option value="enrolled">Has enrollments</option><option value="revenue">Has revenue</option>
          </select>
          <select className={styles.select} value={filters.sortMode} onChange={(event) => replaceParams({ sort: event.target.value === 'spend_desc' ? null : event.target.value, page: null })}>
            <option value="spend_desc">Highest spend</option><option value="leads_desc">Most leads</option><option value="qualified_desc">Most qualified</option><option value="enrolled_desc">Most enrolled</option><option value="roas_desc">Highest ROAS</option><option value="cac_asc">Lowest CAC</option><option value="name">Campaign A–Z</option>
          </select>
          {filtersActive ? <button type="button" className={styles.clear} onClick={clear}><X size={12} /> Reset</button> : null}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Campaign</th><th>Platform</th><th>Spend</th><th>Clicks</th><th>Leads</th><th>Qualified</th><th>Enrolled</th><th>CPL</th><th>CPQL</th><th>CAC</th><th>CRM Revenue</th><th>ROAS</th><th>Funnel</th></tr></thead>
            <tbody>
              {campaigns.length ? campaigns.map((row) => (
                <tr key={row.id} onClick={() => setSelected(row)}>
                  <td><button className={styles.name} type="button" onClick={() => setSelected(row)}>{row.name}</button><span className={styles.sub}>{row.externalId}</span></td>
                  <td><span className={`${styles.pill} ${row.platform === 'Google Ads' ? styles.pillGoogle : row.platform === 'Meta Ads' ? styles.pillMeta : ''}`}>{row.platform}</span></td>
                  <td><strong>{formatMoney(row.spend, row.spendCurrency)}</strong></td>
                  <td>{row.clicks.toLocaleString('en-IN')}</td>
                  <td><strong>{row.leads.toLocaleString('en-IN')}</strong><span className={styles.sub}>{percent(row.leads, row.clicks)} click → lead</span></td>
                  <td><strong>{row.qualified.toLocaleString('en-IN')}</strong><span className={styles.sub}>{percent(row.qualified, row.leads)} lead → qualified</span></td>
                  <td><strong>{row.enrolled.toLocaleString('en-IN')}</strong><span className={styles.sub}>{percent(row.enrolled, row.leads)} lead → enrolled</span></td>
                  <td>{optionalMoney(row.cpl, row.spendCurrency)}</td><td>{optionalMoney(row.cpql, row.spendCurrency)}</td><td>{optionalMoney(row.cac, row.spendCurrency)}</td>
                  <td><strong>{formatRevenue(row.revenueInr, row.revenueUsd)}</strong><span className={styles.sub}>Currencies kept separate</span></td>
                  <td>{row.roas === null ? <span className={`${styles.pill} ${styles.pillWarn}`}>Partial coverage</span> : <strong>{row.roas.toFixed(1)}×</strong>}</td>
                  <td><span className={styles.tinyFunnel}><b>{row.clicks.toLocaleString('en-IN')}</b>→<b>{row.leads}</b>→<b>{row.qualified}</b>→<b>{row.enrolled}</b></span></td>
                </tr>
              )) : <tr><td colSpan={13}><div className={styles.empty}>No campaigns match the selected filters.</div></td></tr>}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          <span>{mock ? 'Demo' : 'Live'} · — means no valid denominator · incomplete ROAS is withheld.</span>
          <div className={styles.pager}>
            {pagination.page > 1 ? <Link href={pageHref(searchParams, pagination.page - 1)} scroll={false}>Previous</Link> : null}
            <span>{pagination.total ? `${pagination.from}–${pagination.to} of ${pagination.total}` : '0 campaigns'}</span>
            {pagination.page < pagination.totalPages ? <Link href={pageHref(searchParams, pagination.page + 1)} scroll={false}>Next</Link> : null}
          </div>
        </div>
      </section>

      {selected ? <CampaignDrawer campaign={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.stat}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function CampaignDrawer({ campaign, onClose }: { campaign: CampaignWorkspaceRow; onClose: () => void }) {
  const leadRate = campaign.clicks > 0 ? (campaign.leads / campaign.clicks) * 100 : null;
  const qualificationRate = campaign.leads > 0 ? (campaign.qualified / campaign.leads) * 100 : null;
  const enrollmentRate = campaign.leads > 0 ? (campaign.enrolled / campaign.leads) * 100 : null;
  const sameCurrencyRevenue = campaign.spendCurrency.toUpperCase() === 'USD' ? campaign.revenueUsd : campaign.revenueInr;
  const commercialEvidence = campaign.roas !== null || campaign.cac !== null || sameCurrencyRevenue > 0;
  const context = encodeURIComponent(campaign.name);
  const statusTone = campaign.spend > 0 && campaign.qualified === 0
    ? 'risk' as const
    : campaign.enrolled > 0
      ? 'positive' as const
      : campaign.leads > 0
        ? 'watch' as const
        : 'neutral' as const;

  return (
    <MarketingInspector
      open
      onClose={onClose}
      eyebrow="Campaign evidence"
      title={campaign.name}
      subtitle={`${campaign.platform} · ${campaign.externalId}`}
      statusLabel={campaign.roas === null ? 'Partial evidence' : campaign.enrolled > 0 ? 'Enrolling' : campaign.leads > 0 ? 'Generating leads' : 'No matched leads'}
      statusTone={statusTone}
      whatHappened={campaignNarrative(campaign)}
      whyItMatters={campaignWhyItMatters(campaign)}
      metrics={[
        { label: 'Spend', value: formatMoney(campaign.spend, campaign.spendCurrency), note: 'paid-media spend' },
        { label: 'Clicks', value: campaign.clicks.toLocaleString('en-IN'), note: leadRate === null ? 'lead rate unavailable' : `${leadRate.toFixed(1)}% click → lead` },
        { label: 'CRM leads', value: campaign.leads.toLocaleString('en-IN'), note: 'deterministically attributed' },
        { label: 'Qualified', value: campaign.qualified.toLocaleString('en-IN'), note: qualificationRate === null ? 'no lead denominator' : `${qualificationRate.toFixed(1)}% of leads` },
        { label: 'Enrolled', value: campaign.enrolled.toLocaleString('en-IN'), note: enrollmentRate === null ? 'no lead denominator' : `${enrollmentRate.toFixed(1)}% of leads` },
        { label: 'ROAS', value: campaign.roas === null ? 'Partial' : `${campaign.roas.toFixed(1)}×`, note: campaign.roas === null ? 'withheld until evidence is comparable' : 'same-currency evidence' },
      ]}
      evidence={[
        {
          label: 'Lead quality',
          value: qualificationRate === null ? 'Unknown' : `${qualificationRate.toFixed(1)}% qualified`,
          detail: qualificationRate === null ? 'No matched lead denominator is available.' : `${campaign.qualified} of ${campaign.leads} matched leads reached qualification.`,
          tone: qualificationRate === null ? 'watch' : qualificationRate > 0 ? 'positive' : 'risk',
        },
        {
          label: 'Enrollment evidence',
          value: enrollmentRate === null ? 'Unknown' : `${enrollmentRate.toFixed(1)}% enrolled`,
          detail: enrollmentRate === null ? 'No matched lead denominator is available.' : `${campaign.enrolled} of ${campaign.leads} matched leads enrolled.`,
          tone: campaign.enrolled > 0 ? 'positive' : campaign.leads > 0 ? 'watch' : 'neutral',
        },
        {
          label: 'Commercial efficiency',
          value: commercialEvidence ? optionalMoney(campaign.cac, campaign.spendCurrency) : 'Partial / unknown',
          detail: campaign.cac === null ? 'CAC is withheld when there is no valid comparable denominator.' : `Observed CAC is ${optionalMoney(campaign.cac, campaign.spendCurrency)}.`,
          tone: commercialEvidence ? 'neutral' : 'watch',
        },
        {
          label: 'CRM revenue',
          value: formatRevenue(campaign.revenueInr, campaign.revenueUsd),
          detail: 'INR and USD remain separate; SalsysOS does not combine currencies into a synthetic total.',
          tone: campaign.revenueInr > 0 || campaign.revenueUsd > 0 ? 'positive' : 'watch',
        },
      ]}
      recommendedAction={campaignRecommendedAction(campaign)}
      actions={[
        { label: 'View acquisition leads', href: `/paid-media-leads?campaign=${context}`, primary: true },
        { label: 'Open attribution', href: `/attribution?q=${context}` },
      ]}
      related={[
        { label: 'Acquisition', href: `/paid-media-leads?campaign=${context}`, detail: 'Inspect the exact CRM leads matched to this campaign.' },
        { label: 'Attribution', href: `/attribution?q=${context}`, detail: 'Inspect source credit and unknown attribution.' },
        { label: 'Revenue', href: `/revenue?investigation=1&source=${context}&from=campaigns`, detail: 'Validate cash, pipeline and currency-separated revenue.' },
        { label: 'Funnel', href: '/funnel', detail: 'Compare this campaign context with overall stage progression.' },
      ]}
    />
  );
}

function campaignNarrative(campaign: CampaignWorkspaceRow) {
  if (campaign.spend > 0 && campaign.qualified === 0) return `${campaign.name} has recorded spend and ${campaign.leads} matched CRM lead${campaign.leads === 1 ? '' : 's'}, but none of those leads are currently qualified.`;
  if (campaign.enrolled > 0) return `${campaign.name} has produced ${campaign.enrolled} observed enrollment${campaign.enrolled === 1 ? '' : 's'} from ${campaign.leads} deterministically matched CRM lead${campaign.leads === 1 ? '' : 's'}.`;
  if (campaign.leads > 0) return `${campaign.name} is generating matched CRM leads, but the downstream enrollment signal is still limited in the current reporting scope.`;
  return `${campaign.name} has recorded paid-media activity, but no deterministically matched CRM leads are available in the current reporting scope.`;
}

function campaignWhyItMatters(campaign: CampaignWorkspaceRow) {
  if (campaign.spend > 0 && campaign.qualified === 0) return 'Spend without qualified outcomes deserves review because lead volume alone can hide poor downstream quality. This is evidence for investigation, not proof that the campaign should be paused.';
  if (campaign.enrolled > 0) return 'Observed enrollments provide stronger downstream evidence than clicks or leads alone. Budget decisions should still consider attribution coverage, CAC and whether the revenue evidence is complete.';
  if (campaign.leads > 0) return 'The campaign has acquisition evidence, but budget expansion should wait for stronger downstream qualification or enrollment evidence unless there is another business reason to prioritize it.';
  return 'Without deterministic CRM matches, CPL/ROAS-style conclusions can be misleading. The next step is to verify attribution and capture coverage before judging campaign quality.';
}

function campaignRecommendedAction(campaign: CampaignWorkspaceRow) {
  if (campaign.spend > 0 && campaign.qualified === 0) return 'Inspect the matched leads and campaign targeting/landing path before increasing spend. Check whether poor qualification reflects audience quality, lead capture, or incomplete CRM attribution.';
  if (campaign.enrolled > 0 && campaign.cac !== null) return `Compare the observed CAC of ${optionalMoney(campaign.cac, campaign.spendCurrency)} with other campaigns in the same currency and course context before reallocating budget.`;
  if (campaign.leads > 0) return 'Review lead quality and attribution evidence, then monitor whether qualified and enrolled outcomes accumulate before making a scaling decision.';
  return 'Verify click-ID capture, campaign matching and landing-page lead capture before treating the absence of CRM leads as a performance conclusion.';
}

function pageHref(current: ReturnType<typeof useSearchParams>, page: number) { const params = new URLSearchParams(current.toString()); if (page <= 1) params.delete('page'); else params.set('page', String(page)); const query = params.toString(); return query ? `/campaigns?${query}` : '/campaigns'; }
function percent(value: number, denominator: number) { return denominator > 0 ? `${((value / denominator) * 100).toFixed(1)}%` : '—'; }
function optionalMoney(value: number | null, currency: string) { return value == null ? '—' : formatMoney(value, currency); }
function formatMoney(value: number, currency: string) { if (!Number.isFinite(value)) return '—'; try { return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(value); } catch { return `${currency} ${Math.round(value).toLocaleString('en-IN')}`; } }
function formatRevenue(inr: number, usd: number) { const values: string[] = []; if (inr > 0) values.push(formatMoney(inr, 'INR')); if (usd > 0) values.push(formatMoney(usd, 'USD')); return values.join(' · ') || '—'; }
