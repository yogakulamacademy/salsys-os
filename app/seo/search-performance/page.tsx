import Link from 'next/link';

import { getSeoWorkspace } from '@/lib/seo-data';
import styles from '@/components/marketing/organic-reference.module.css';

export default async function SearchPerformancePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams;
  const workspace = await getSeoWorkspace();
  const overview = workspace.overview;
  const view = params.view === 'pages' ? 'pages' : 'queries';
  const clicks = n(overview.clicks);
  const impressions = n(overview.impressions);
  const ctr = n(overview.ctr);
  const position = n(overview.avg_position);
  const leads = n(overview.organic_leads);
  const enrolled = n(overview.organic_enrolled_leads);
  const daily = workspace.daily.slice(-16);
  const maxClicks = Math.max(1, ...daily.map((row) => n(row.clicks)));
  const maxImpressions = Math.max(1, ...daily.map((row) => n(row.impressions)));

  return <div className={styles.page}>
    <header className={styles.head}><div><div className={styles.eyebrow}>Organic Growth</div><h1 className={styles.title}>Search Performance</h1><p className={styles.subtitle}>Explore search queries and landing pages with business context.</p></div></header>
    {workspace.warning ? <div className={`${styles.ribbon} ${styles.ribbonWarn}`}>{workspace.warning}</div> : null}
    <section className={styles.pulse}>
      <Metric label="Clicks" value={num(clicks)} note="Google Search Console" /><Metric label="Impressions" value={num(impressions)} note="Search visibility" /><Metric label="CTR" value={`${pct(ctr)}%`} note="Observed click-through rate" /><Metric label="Avg Position" value={position ? position.toFixed(1) : '—'} note="Average search position" /><Metric label="Organic Leads" value={num(leads)} note="Mapped CRM outcomes" /><Metric label="Enrollments" value={num(enrolled)} note="Mapped organic leads" />
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><h2>Organic Performance Trend</h2><p>Recent synced search observations. Clicks and impressions use different scales.</p></div></div>
      {daily.length ? <div className={styles.trend}>{daily.map((row) => <div className={styles.trendCol} key={row.date}><i className={styles.trendBar} style={{ height: `${Math.max(2, n(row.clicks) / maxClicks * 100)}%` }} title={`${num(n(row.clicks))} clicks`} /><i className={`${styles.trendBar} ${styles.trendBarAlt}`} style={{ height: `${Math.max(2, n(row.impressions) / maxImpressions * 100)}%` }} title={`${num(n(row.impressions))} impressions`} /><span className={styles.trendLabel}>{shortDate(row.date)}</span></div>)}</div> : <div className={styles.empty}>No Search Console trend data is available for this workspace.</div>}
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><h2>Search Explorer</h2><p>Switch between query and landing-page evidence.</p></div><div className={styles.segmented}><Link href="/seo/search-performance?view=queries">Queries</Link><Link href="/seo/search-performance?view=pages">Pages</Link></div></div>
      {view === 'pages' ? <PageTable rows={workspace.pages} /> : <QueryTable rows={workspace.queries} />}
    </section>
  </div>;
}

function QueryTable({ rows }: { rows: Awaited<ReturnType<typeof getSeoWorkspace>>['queries'] }) {
  return <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th><th>Opportunity</th></tr></thead><tbody>{rows.length ? rows.slice(0, 100).map((row) => { const pos = n(row.avg_position); const ctr = n(row.ctr); const opportunity = pos > 4 && pos <= 15 ? 'Striking Distance' : n(row.impressions) > 100 && ctr < 0.03 ? 'CTR Opportunity' : 'Observe'; return <tr key={`${row.query}-${row.clicks}`}><td><span className={styles.name}>{row.query}</span></td><td>{num(n(row.clicks))}</td><td>{num(n(row.impressions))}</td><td>{pct(ctr)}%</td><td>{pos ? pos.toFixed(1) : '—'}</td><td><span className={`${styles.badge} ${opportunity !== 'Observe' ? styles.badgeWarn : ''}`}>{opportunity}</span></td></tr>; }) : <tr><td colSpan={6}><div className={styles.empty}>No query evidence is available.</div></td></tr>}</tbody></table></div>;
}
function PageTable({ rows }: { rows: Awaited<ReturnType<typeof getSeoWorkspace>>['pages'] }) { return <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Page</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead><tbody>{rows.length ? rows.slice(0, 100).map((row) => <tr key={row.page}><td><span className={styles.name}>{pageName(row.page)}</span><span className={styles.sub}>{row.page}</span></td><td>{num(n(row.clicks))}</td><td>{num(n(row.impressions))}</td><td>{pct(n(row.ctr))}%</td><td>{n(row.avg_position) ? n(row.avg_position).toFixed(1) : '—'}</td></tr>) : <tr><td colSpan={5}><div className={styles.empty}>No page evidence is available.</div></td></tr>}</tbody></table></div>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function n(value: number | string | null | undefined) { const x = Number(value ?? 0); return Number.isFinite(x) ? x : 0; }
function num(value: number) { return value.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function pct(value: number) { const normalized = value > 1 ? value : value * 100; return normalized.toFixed(1); }
function shortDate(value: string) { const d = new Date(`${value.slice(0,10)}T00:00:00Z`); return Number.isNaN(d.getTime()) ? value.slice(5) : new Intl.DateTimeFormat('en', { day:'numeric', month:'short', timeZone:'UTC' }).format(d); }
function pageName(url: string) { try { const parsed = new URL(url); return parsed.pathname === '/' ? parsed.hostname : parsed.pathname; } catch { return url; } }
