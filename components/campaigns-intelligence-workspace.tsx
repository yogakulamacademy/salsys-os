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
      <section className={styles.pulse} aria-label="Campaign performance summary">
        <Pulse label="Campaigns" value={summary.campaigns.toLocaleString('en-IN')} note="Matching this view" />
        <Pulse label="Spend" value={spend} note="Advertising spend" word />
        <Pulse label="Clicks" value={summary.clicks.toLocaleString('en-IN')} note="Ad-platform clicks" />
        <Pulse label="CRM Leads" value={summary.leads.toLocaleString('en-IN')} note="Deterministic campaign matches" />
        <Pulse label="Qualified" value={summary.qualified.toLocaleString('en-IN')} note={`${percent(summary.qualified, summary.leads)} of matched leads`} />
        <Pulse label="Enrolled" value={summary.enrolled.toLocaleString('en-IN')} note={`${percent(summary.enrolled, summary.leads)} of matched leads`} />
        <Pulse label="Revenue" value={formatRevenue(summary.revenueInr, summary.revenueUsd)} note="Confirmed CRM links" word />
        <Pulse label="ROAS" value={roas === null ? 'Partial coverage' : `${roas.toFixed(1)}×`} note={roas === null ? 'Inspect complete evidence' : 'Same-currency evidence'} word={roas === null} />
      </section>

      {!sameCurrency && campaigns.length > 0 ? (
        <div className={styles.ribbon}><span>◈</span><p><strong>Currencies stay separate.</strong> Campaign spend and CRM revenue are not combined across INR and USD.</p><Link href="/revenue">Inspect revenue evidence <ArrowRight size={11} /></Link></div>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div><h2>Campaign explorer</h2><p>Summary reflects active filters · select a campaign for full evidence.</p></div>
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

function Pulse({ label, value, note, word = false }: { label: string; value: string; note: string; word?: boolean }) {
  return <div className={styles.pulseItem}><span>{label}</span><strong className={word ? styles.word : ''}>{value}</strong><small>{note}</small></div>;
}

function CampaignDrawer({ campaign, onClose }: { campaign: CampaignWorkspaceRow; onClose: () => void }) {
  const matchCoverage = campaign.clicks > 0 ? Math.min(100, (campaign.leads / campaign.clicks) * 100) : 0;
  const downstreamCoverage = campaign.leads > 0 ? Math.min(100, ((campaign.qualified + campaign.enrolled) / Math.max(1, campaign.leads * 2)) * 100) : 0;
  return <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={`${campaign.name} campaign evidence`}>
      <div className={styles.drawerHead}><div><div className="eyebrow">Campaign evidence</div><h2>{campaign.name}</h2><p>{campaign.platform} · {campaign.externalId}</p></div><button type="button" className={styles.close} onClick={onClose}><X size={17} /></button></div>
      <div className={styles.drawerMetrics}>
        <DrawerMetric label="Spend" value={formatMoney(campaign.spend, campaign.spendCurrency)} /><DrawerMetric label="Clicks" value={campaign.clicks.toLocaleString('en-IN')} /><DrawerMetric label="CRM Leads" value={campaign.leads.toLocaleString('en-IN')} />
        <DrawerMetric label="Qualified" value={campaign.qualified.toLocaleString('en-IN')} /><DrawerMetric label="Enrolled" value={campaign.enrolled.toLocaleString('en-IN')} /><DrawerMetric label="ROAS" value={campaign.roas === null ? 'Partial' : `${campaign.roas.toFixed(1)}×`} />
      </div>
      <section className={styles.section}><h3>Lead quality</h3><div className={styles.coverage}><div className={styles.coverageTop}><strong>Lead → qualified</strong><span>{percent(campaign.qualified, campaign.leads)}</span></div><span className={styles.track}><i style={{ width: `${campaign.leads ? campaign.qualified / campaign.leads * 100 : 0}%` }} /></span></div><div className={styles.coverage}><div className={styles.coverageTop}><strong>Lead → enrolled</strong><span>{percent(campaign.enrolled, campaign.leads)}</span></div><span className={styles.track}><i style={{ width: `${campaign.leads ? campaign.enrolled / campaign.leads * 100 : 0}%` }} /></span></div></section>
      <section className={styles.section}><h3>Commercial impact</h3><div className={styles.drawerMetrics}><DrawerMetric label="CPL" value={optionalMoney(campaign.cpl, campaign.spendCurrency)} /><DrawerMetric label="CPQL" value={optionalMoney(campaign.cpql, campaign.spendCurrency)} /><DrawerMetric label="CAC" value={optionalMoney(campaign.cac, campaign.spendCurrency)} /></div><DrawerMetric label="CRM revenue" value={formatRevenue(campaign.revenueInr, campaign.revenueUsd)} /></section>
      <section className={styles.section}><h3>Evidence coverage</h3><div className={styles.coverage}><div className={styles.coverageTop}><strong>Click → deterministic CRM lead</strong><span>{matchCoverage.toFixed(1)}%</span></div><span className={styles.track}><i style={{ width: `${matchCoverage}%` }} /></span></div><div className={styles.coverage}><div className={styles.coverageTop}><strong>Downstream CRM outcome evidence</strong><span>{downstreamCoverage.toFixed(1)}%</span></div><span className={styles.track}><i style={{ width: `${downstreamCoverage}%` }} /></span></div><p className={styles.sub}>Coverage indicators describe available evidence. They are not statistical confidence scores.</p></section>
      <div className={styles.actions}><Link className={`${styles.action} ${styles.primary}`} href="/paid-media-leads">View generated leads</Link><Link className={styles.action} href="/attribution">Open attribution</Link><button className={styles.action} type="button" onClick={onClose}>Close</button></div>
    </aside>
  </div>;
}

function DrawerMetric({ label, value }: { label: string; value: string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>; }

function pageHref(current: ReturnType<typeof useSearchParams>, page: number) { const params = new URLSearchParams(current.toString()); if (page <= 1) params.delete('page'); else params.set('page', String(page)); const query = params.toString(); return query ? `/campaigns?${query}` : '/campaigns'; }
function percent(value: number, denominator: number) { return denominator > 0 ? `${((value / denominator) * 100).toFixed(1)}%` : '—'; }
function optionalMoney(value: number | null, currency: string) { return value == null ? '—' : formatMoney(value, currency); }
function formatMoney(value: number, currency: string) { if (!Number.isFinite(value)) return '—'; try { return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(value); } catch { return `${currency} ${Math.round(value).toLocaleString('en-IN')}`; } }
function formatRevenue(inr: number, usd: number) { const values: string[] = []; if (inr > 0) values.push(formatMoney(inr, 'INR')); if (usd > 0) values.push(formatMoney(usd, 'USD')); return values.join(' · ') || '—'; }
