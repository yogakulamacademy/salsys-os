import Link from 'next/link';

import { getSeoWorkspace } from '@/lib/seo-data';
import styles from '@/components/marketing/organic-reference.module.css';

export default async function AiAnswerVisibilityPage() {
  const workspace = await getSeoWorkspace();
  const summary = workspace.aeoSummary;
  const classes = workspace.aeoAnswerClasses;
  const pages = workspace.aeoPageReadiness;
  const queries = workspace.aeoQueryOpportunities;
  const maxQueries = Math.max(1,...classes.map(row=>n(row.query_count)));

  return <div className={styles.page}>
    <header className={styles.head}><div><div className={styles.eyebrow}>Organic Growth · Preview</div><h1 className={styles.title}>AI Answer Visibility</h1><p className={styles.subtitle}>Evaluate answer readiness and answer-oriented search demand without claiming unmeasured model citations or rankings.</p></div></header>
    {workspace.aeoWarning ? <div className={`${styles.ribbon} ${styles.ribbonWarn}`}>{workspace.aeoWarning}</div> : null}
    <div className={styles.ribbon}><strong>Evidence-aware preview.</strong><span> This workspace uses deterministic page/search readiness signals. It does not imply that a third-party AI assistant mentioned, cited or ranked a page unless that evidence is explicitly observed elsewhere.</span></div>
    <section className={styles.pulse}><Metric label="Answer Queries" value={num(n(summary.answer_queries))} note="Observed answer-oriented demand"/><Metric label="Answer Impressions" value={num(n(summary.answer_impressions))} note="Search demand evidence"/><Metric label="High Opportunity" value={num(n(summary.high_opportunity_queries))} note="Prioritized answer queries"/><Metric label="Answer Sections" value={num(n(summary.pages_with_answer_sections))} note="Known pages"/><Metric label="Priority Pages" value={num(n(summary.priority_page_actions))} note="Recommended review"/><Metric label="Best Readiness" value={display(n(summary.best_page_readiness))} note="Deterministic readiness score"/></section>

    <div className={styles.equal}>
      <section className={styles.panel}><div className={styles.panelHead}><div><h2>Answer Demand by Class</h2><p>Observed answer-oriented query classes.</p></div></div><div className={styles.panelBody}>{classes.length?classes.map(row=><div className={styles.coverage} key={row.answer_class}><div className={styles.coverageTop}><strong>{pretty(row.answer_class)}</strong><span>{num(n(row.query_count))} queries</span></div><span className={styles.track}><i style={{width:`${n(row.query_count)/maxQueries*100}%`}}/></span><span className={styles.sub}>{num(n(row.impressions))} impressions · {num(n(row.high_opportunity_queries))} high opportunity</span></div>):<div className={styles.empty}>No answer-class evidence is available.</div>}</div></section>
      <section className={styles.panel}><div className={styles.panelHead}><div><h2>Answer Readiness</h2><p>Make the source useful before optimizing for mentions.</p></div></div><div className={styles.panelBody}><p style={{fontSize:11,lineHeight:1.8,color:'#758279'}}>Clear source information, useful answer sections, semantic coverage and appropriate schema help users and retrieval systems understand a page. Readiness is not a guarantee of AI inclusion.</p><Link className={styles.link} href="/seo/content-opportunities">Review content opportunities →</Link><br/><Link className={styles.link} href="/seo/technical">Inspect technical foundations →</Link></div></section>
    </div>

    <section className={styles.panel} style={{marginTop:17}}><div className={styles.panelHead}><div><h2>Page Readiness</h2><p>Known page features and answer-oriented search demand.</p></div></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Page</th><th>Readiness</th><th>Answer Queries</th><th>High Opportunity</th><th>Answer Sections</th><th>FAQ Schema</th><th>Semantic Coverage</th><th>Recommended Action</th></tr></thead><tbody>{pages.length?pages.slice(0,100).map(row=><tr key={row.page_id}><td><span className={styles.name}>{row.title||row.url_path||row.normalized_url}</span><span className={styles.sub}>{row.normalized_url}</span></td><td><span className={styles.badge}>{display(n(row.answer_readiness_score_v1))}</span></td><td>{num(n(row.answer_query_count))}</td><td>{num(n(row.high_opportunity_query_count))}</td><td>{row.has_answer_sections?'Yes':'No'}</td><td>{row.has_faq_schema?'Yes':'No'}</td><td>{display(n(row.semantic_coverage_score_v1))}</td><td>{pretty(row.recommended_action)}</td></tr>):<tr><td colSpan={8}><div className={styles.empty}>No page-readiness evidence is available.</div></td></tr>}</tbody></table></div></section>

    {queries.length ? <section className={styles.panel}><div className={styles.panelHead}><div><h2>Answer Query Opportunities</h2><p>Queries ranked by the current AEO opportunity model.</p></div></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Query</th><th>Class</th><th>Impressions</th><th>Position</th><th>Leader Page</th><th>Opportunity</th></tr></thead><tbody>{queries.slice(0,50).map((row,index)=><tr key={`${row.query}-${index}`}><td><span className={styles.name}>{row.query}</span></td><td>{pretty(row.answer_class)}</td><td>{num(n(row.impressions))}</td><td>{display(n(row.avg_position))}</td><td><span className={styles.sub}>{row.leader_page}</span></td><td>{display(n(row.answer_opportunity_score_v1))}</td></tr>)}</tbody></table></div></section>:null}
  </div>;
}
function Metric({label,value,note}:{label:string;value:string;note:string}){return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>}
function n(v:number|string|null|undefined){const x=Number(v??0);return Number.isFinite(x)?x:0}
function num(v:number){return v.toLocaleString('en-IN',{maximumFractionDigits:0})}
function display(v:number){return v? v.toLocaleString('en-IN',{maximumFractionDigits:1}):'—'}
function pretty(v:string|null|undefined){return v?String(v).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()):'—'}
