import Link from 'next/link';

import { getSeoWorkspace } from '@/lib/seo-data';
import styles from '@/components/marketing/organic-reference.module.css';

export default async function ContentOpportunitiesPage() {
  const workspace = await getSeoWorkspace();
  const opportunities = workspace.opportunities;
  const pageActions = workspace.contentPageActions;
  const gaps = workspace.contentGaps;
  const internal = workspace.internalLinkOpportunities;
  const summary = workspace.contentSummary;

  const cards = [
    ...opportunities.slice(0, 8).map((row, index) => ({
      id: `query-${index}`,
      type: row.opportunity_type || 'Search Opportunity',
      title: row.query,
      value: opportunityValue(row),
      meta: `${num(n(row.impressions))} impressions · position ${display(n(row.avg_position))}`,
      action: row.recommendation,
    })),
    ...gaps.slice(0, 4).map((row) => ({ id: `gap-${row.topic_id}`, type: pretty(row.gap_type || 'Content Gap'), title: row.topic_name, value: num(n(row.gsc_impressions)), meta: `${n(row.query_count)} queries · priority ${display(n(row.priority_score_v1))}`, action: row.recommendation })),
  ];

  return <div className={styles.page}>
    <header className={styles.head}><div><div className={styles.eyebrow}>Content Intelligence</div><h1 className={styles.title}>Content Opportunities</h1><p className={styles.subtitle}>Prioritize search and content opportunities, then verify the supporting evidence.</p></div></header>
    {workspace.contentWarning ? <div className={`${styles.ribbon} ${styles.ribbonWarn}`}>{workspace.contentWarning}</div> : null}
    <div className={styles.ribbon}><strong>Prioritize opportunity, then verify.</strong><span> Recommendations come from observed search/content signals. Review the page, query and business evidence before changing content.</span></div>

    <section className={styles.pulse}>
      <Metric label="Pages" value={num(n(summary.total_pages))} note="Known content inventory" /><Metric label="Improve Existing" value={num(n(summary.improve_existing))} note="Recommended page actions" /><Metric label="Content Gaps" value={num(gaps.length)} note="Observed mapped gaps" /><Metric label="Internal Links" value={num(n(summary.internal_link_opportunities) || internal.length)} note="Link opportunities" /><Metric label="Fix Indexability" value={num(n(summary.fix_indexability))} note="Technical/content priority" />
    </section>

    <div className={styles.segmented} style={{ marginBottom: 16 }}><Link href="/seo/content-opportunities">All</Link><Link href="/seo/content-opportunities">Striking Distance</Link><Link href="/seo/content-opportunities">CTR Opportunity</Link><Link href="/seo/content-opportunities">Content Gap</Link><Link href="/seo/content-opportunities">Internal Links</Link><Link href="/seo/content-opportunities">Conversion Gap</Link></div>

    {cards.length ? <div className={styles.opGrid}>{cards.slice(0, 8).map((row) => <article className={styles.opCard} key={row.id}><span className={`${styles.badge} ${/gap|declin|index/i.test(row.type) ? styles.badgeWarn : ''}`}>{row.type}</span><h3>{row.title}</h3><div className={styles.opValue}>{row.value}</div><p>{row.meta}</p><p>{row.action || 'Inspect supporting evidence before changing the page.'}</p><Link className={styles.link} href="/seo/search-performance">View search evidence →</Link></article>)}</div> : <div className={styles.panel}><div className={styles.empty}>No prioritized content opportunities are available from the current synced evidence.</div></div>}

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><h2>Page Action Queue</h2><p>Content recommendations with search, semantic and technical context.</p></div></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Page</th><th>Recommended Action</th><th>Priority</th><th>Clicks</th><th>Impressions</th><th>Position</th><th>Technical Issues</th><th>Internal Links</th></tr></thead><tbody>{pageActions.length ? pageActions.slice(0,100).map((row) => <tr key={row.page_id}><td><span className={styles.name}>{row.title || row.url_path || row.normalized_url}</span><span className={styles.sub}>{row.normalized_url}</span></td><td>{pretty(row.recommended_action)}</td><td><span className={`${styles.badge} ${n(row.action_priority_score) >= 70 ? styles.badgeWarn : ''}`}>{display(n(row.action_priority_score))}</span></td><td>{num(n(row.gsc_clicks))}</td><td>{num(n(row.gsc_impressions))}</td><td>{display(n(row.gsc_avg_position))}</td><td>{num(n(row.technical_issue_count))}</td><td>{num(n(row.internal_link_opportunities))}</td></tr>) : <tr><td colSpan={8}><div className={styles.empty}>No page-action records are available.</div></td></tr>}</tbody></table></div>
    </section>
  </div>;
}

function Metric({ label, value, note }: { label:string; value:string; note:string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function n(v:number|string|null|undefined){const x=Number(v??0);return Number.isFinite(x)?x:0}
function num(v:number){return v.toLocaleString('en-IN',{maximumFractionDigits:0})}
function display(v:number){return v? v.toLocaleString('en-IN',{maximumFractionDigits:1}):'—'}
function pretty(v:string){return String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
function opportunityValue(row: Awaited<ReturnType<typeof getSeoWorkspace>>['opportunities'][number]) { const type=(row.opportunity_type||'').toLowerCase(); if(type.includes('ctr')) return `${(n(row.ctr)>1?n(row.ctr):n(row.ctr)*100).toFixed(1)}%`; if(type.includes('distance')||type.includes('position')) return display(n(row.avg_position)); return num(n(row.impressions)); }
