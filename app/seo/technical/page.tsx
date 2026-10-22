import { getSeoWorkspace } from '@/lib/seo-data';
import styles from '@/components/marketing/organic-reference.module.css';

export default async function TechnicalSeoPage() {
  const workspace = await getSeoWorkspace();
  const actions = workspace.contentPageActions;
  const issueRows = actions.filter((row) => n(row.technical_issue_count) > 0).sort((a,b) => n(b.technical_issue_count)-n(a.technical_issue_count));
  const knownPages = n(workspace.contentSummary.total_pages);
  const crawled = n(workspace.contentSummary.crawled_pages);
  const uncrawled = n(workspace.contentSummary.uncrawled_pages);
  const indexability = n(workspace.contentSummary.fix_indexability);
  const totalIssues = issueRows.reduce((sum,row)=>sum+n(row.technical_issue_count),0);

  return <div className={styles.page}>
    <header className={styles.head}><div><div className={styles.eyebrow}>Organic Growth</div><h1 className={styles.title}>Technical SEO</h1><p className={styles.subtitle}>Review technical content evidence without treating missing crawl checks as healthy.</p></div></header>
    {workspace.contentWarning ? <div className={`${styles.ribbon} ${styles.ribbonWarn}`}>{workspace.contentWarning}</div> : null}
    <section className={styles.pulse}><Metric label="Known Pages" value={num(knownPages)} note="Content inventory"/><Metric label="Crawled Pages" value={num(crawled)} note="Observed crawl evidence"/><Metric label="Uncrawled" value={num(uncrawled)} note="No complete crawl evidence"/><Metric label="Pages With Issues" value={num(issueRows.length)} note="Technical issue count > 0"/><Metric label="Known Issues" value={num(totalIssues)} note="Recorded issue count"/><Metric label="Indexability Actions" value={num(indexability)} note="Pages requiring review"/></section>
    <div className={`${styles.ribbon} ${styles.ribbonWarn}`}><strong>Do not confuse missing evidence with a healthy page.</strong><span> This screen only reports technical findings available in the current content/crawl model. Unsupported checks remain unknown.</span></div>
    <section className={styles.panel}><div className={styles.panelHead}><div><h2>Technical Review Queue</h2><p>Pages ranked by recorded technical issue count.</p></div></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Page</th><th>Page Type</th><th>Indexable</th><th>Technical Issues</th><th>Content State</th><th>Priority</th><th>Recommended Action</th></tr></thead><tbody>{issueRows.length?issueRows.slice(0,100).map(row=><tr key={row.page_id}><td><span className={styles.name}>{row.title||row.url_path||row.normalized_url}</span><span className={styles.sub}>{row.normalized_url}</span></td><td>{pretty(row.page_type)}</td><td><span className={`${styles.badge} ${row.is_indexable===false?styles.badgeBad:''}`}>{row.is_indexable===true?'Yes':row.is_indexable===false?'No':'Unknown'}</span></td><td><span className={`${styles.badge} ${n(row.technical_issue_count)>2?styles.badgeWarn:''}`}>{num(n(row.technical_issue_count))}</span></td><td>{pretty(row.content_state)}</td><td>{display(n(row.action_priority_score))}</td><td>{pretty(row.recommended_action)}</td></tr>):<tr><td colSpan={7}><div className={styles.empty}>No page-level technical issues are recorded in the current evidence.</div></td></tr>}</tbody></table></div></section>
  </div>;
}
function Metric({label,value,note}:{label:string;value:string;note:string}){return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>}
function n(v:number|string|null|undefined){const x=Number(v??0);return Number.isFinite(x)?x:0}
function num(v:number){return v.toLocaleString('en-IN',{maximumFractionDigits:0})}
function display(v:number){return v? v.toLocaleString('en-IN',{maximumFractionDigits:1}):'—'}
function pretty(v:string|null|undefined){return v?String(v).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()):'—'}
