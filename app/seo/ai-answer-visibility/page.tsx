import Link from 'next/link';

import styles from '@/components/marketing/organic-reference.module.css';
import { getSeoWorkspace } from '@/lib/seo-data';

export default async function AiAnswerVisibilityPage() {
  const workspace = await getSeoWorkspace();
  const summary = workspace.aeoSummary;
  const classes = workspace.aeoAnswerClasses;
  const pages = workspace.aeoPageReadiness;
  const queries = workspace.aeoQueryOpportunities;
  const maxQueries = Math.max(1, ...classes.map((row) => n(row.query_count)));
  const priorityQuery = queries[0] ?? null;
  const priorityPage = pages.find((row) => n(row.answer_readiness_score_v1) < 60) ?? pages[0] ?? null;
  const strongPages = pages.filter((row) => n(row.answer_readiness_score_v1) >= 70).length;
  const weakPages = pages.filter((row) => n(row.answer_readiness_score_v1) > 0 && n(row.answer_readiness_score_v1) < 50).length;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Organic Growth · Live Search Signals</div>
          <h1 className={styles.title}>AI Answer Visibility</h1>
          <p className={styles.subtitle}>
            Turn observed answer-seeking search demand and page readiness into clear content actions. SalsysOS separates what search data proves from what still requires external AI-answer observation.
          </p>
        </div>
      </header>

      {workspace.aeoWarning ? <div className={`${styles.ribbon} ${styles.ribbonWarn}`}>{workspace.aeoWarning}</div> : null}
      <div className={styles.ribbon}>
        <strong>Live search-derived intelligence.</strong>
        <span> Query demand, impressions, rankings and page readiness are observed from connected SEO evidence. Third-party AI mentions, citations or rankings are not claimed unless separately observed.</span>
      </div>

      <section className={styles.pulse}>
        <Metric label="Answer Queries" value={num(n(summary.answer_queries))} note="Observed answer-oriented demand" />
        <Metric label="Answer Impressions" value={num(n(summary.answer_impressions))} note="Search demand evidence" />
        <Metric label="High Opportunity" value={num(n(summary.high_opportunity_queries))} note="Queries needing action" />
        <Metric label="Strong Pages" value={num(strongPages)} note="Readiness score ≥ 70" />
        <Metric label="Weak Pages" value={num(weakPages)} note="Readiness score < 50" />
        <Metric label="Best Readiness" value={display(n(summary.best_page_readiness))} note="Current page-readiness ceiling" />
      </section>

      <div className={styles.equal}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.eyebrow}>Priority now</div>
              <h2>{priorityQuery ? 'Strengthen the highest-opportunity answer query' : 'No answer-query priority yet'}</h2>
              <p>Use observed demand to decide what answer deserves improvement first.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            {priorityQuery ? (
              <>
                <div className={styles.coverage}>
                  <div className={styles.coverageTop}><strong>{priorityQuery.query}</strong><span>{display(n(priorityQuery.answer_opportunity_score_v1))} opportunity</span></div>
                  <span className={styles.sub}>{num(n(priorityQuery.impressions))} impressions · avg position {display(n(priorityQuery.avg_position))}</span>
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--copy-muted)', marginTop: 14 }}>
                  {queryRecommendation(priorityQuery)}
                </p>
                <Link className={styles.link} href="/seo/content-opportunities">Open content opportunities →</Link>
              </>
            ) : <div className={styles.empty}>No answer-oriented query evidence is available yet.</div>}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.eyebrow}>Page readiness</div>
              <h2>{priorityPage ? 'Fix the page most likely to limit answer performance' : 'No page-readiness priority yet'}</h2>
              <p>Improve the source page before optimizing for unmeasured AI mentions.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            {priorityPage ? (
              <>
                <div className={styles.coverage}>
                  <div className={styles.coverageTop}><strong>{priorityPage.title || priorityPage.url_path || priorityPage.normalized_url}</strong><span>{display(n(priorityPage.answer_readiness_score_v1))} readiness</span></div>
                  <span className={styles.sub}>{num(n(priorityPage.answer_query_count))} answer queries · {priorityPage.has_answer_sections ? 'answer section present' : 'answer section missing'}</span>
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--copy-muted)', marginTop: 14 }}>
                  {pretty(priorityPage.recommended_action)}
                </p>
                <Link className={styles.link} href="/seo/technical">Inspect technical foundations →</Link>
              </>
            ) : <div className={styles.empty}>No page-readiness evidence is available yet.</div>}
          </div>
        </section>
      </div>

      <div className={styles.equal}>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><h2>Answer demand by class</h2><p>Where observed answer-oriented demand is concentrated.</p></div></div>
          <div className={styles.panelBody}>
            {classes.length ? classes.map((row) => (
              <div className={styles.coverage} key={row.answer_class}>
                <div className={styles.coverageTop}><strong>{pretty(row.answer_class)}</strong><span>{num(n(row.query_count))} queries</span></div>
                <span className={styles.track}><i style={{ width: `${(n(row.query_count) / maxQueries) * 100}%` }} /></span>
                <span className={styles.sub}>{num(n(row.impressions))} impressions · {num(n(row.high_opportunity_queries))} high opportunity</span>
              </div>
            )) : <div className={styles.empty}>No answer-class evidence is available.</div>}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}><div><h2>How to use this intelligence</h2><p>Observed evidence first; inference second.</p></div></div>
          <div className={styles.panelBody}>
            <p style={{ fontSize: 12, lineHeight: 1.75, color: 'var(--copy-muted)' }}>
              Strong answer readiness means SalsysOS can see useful source structure, semantic coverage and search demand. It does not prove ChatGPT, Google AI Overviews or another assistant cited the page. Use this workspace to prioritize content now and add external answer-engine observations later when that collection layer is connected.
            </p>
            <Link className={styles.link} href="/seo/content-opportunities">Review content opportunities →</Link><br />
            <Link className={styles.link} href="/seo/search-performance">Inspect search demand →</Link>
          </div>
        </section>
      </div>

      <section className={styles.panel} style={{ marginTop: 17 }}>
        <div className={styles.panelHead}><div><h2>Page readiness</h2><p>Known page features and answer-oriented search demand, ranked for action.</p></div></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Page</th><th>Readiness</th><th>Answer Queries</th><th>High Opportunity</th><th>Answer Sections</th><th>FAQ Schema</th><th>Semantic Coverage</th><th>Recommended Action</th></tr></thead>
            <tbody>
              {pages.length ? pages.slice(0, 100).map((row) => (
                <tr key={row.page_id}>
                  <td><span className={styles.name}>{row.title || row.url_path || row.normalized_url}</span><span className={styles.sub}>{row.normalized_url}</span></td>
                  <td><span className={styles.badge}>{display(n(row.answer_readiness_score_v1))}</span></td>
                  <td>{num(n(row.answer_query_count))}</td>
                  <td>{num(n(row.high_opportunity_query_count))}</td>
                  <td>{row.has_answer_sections ? 'Yes' : 'No'}</td>
                  <td>{row.has_faq_schema ? 'Yes' : 'No'}</td>
                  <td>{display(n(row.semantic_coverage_score_v1))}</td>
                  <td>{pretty(row.recommended_action)}</td>
                </tr>
              )) : <tr><td colSpan={8}><div className={styles.empty}>No page-readiness evidence is available.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {queries.length ? (
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><h2>Answer query opportunities</h2><p>Live search opportunities ranked by the current evidence model.</p></div></div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Query</th><th>Class</th><th>Impressions</th><th>Position</th><th>Leader Page</th><th>Opportunity</th></tr></thead>
              <tbody>{queries.slice(0, 50).map((row, index) => <tr key={`${row.query}-${index}`}><td><span className={styles.name}>{row.query}</span></td><td>{pretty(row.answer_class)}</td><td>{num(n(row.impressions))}</td><td>{display(n(row.avg_position))}</td><td><span className={styles.sub}>{row.leader_page}</span></td><td>{display(n(row.answer_opportunity_score_v1))}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function queryRecommendation(row: { impressions: number | string | null; avg_position: number | string | null; leader_page: string | null }) {
  const impressions = n(row.impressions);
  const position = n(row.avg_position);
  if (impressions >= 50 && position > 0 && position <= 20) return `Demand is already visible and ranking within reach. Strengthen the direct answer on ${row.leader_page || 'the current leader page'} before creating a new competing page.`;
  if (impressions >= 20) return `There is meaningful answer-seeking demand. Improve the current leader page's answer clarity, supporting evidence and internal topical links.`;
  return 'Treat this as an emerging opportunity: improve the best existing page first, then watch whether impressions and position strengthen.';
}

function n(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function num(value: number) { return value.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function display(value: number) { return value ? value.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '—'; }
function pretty(value: string | null | undefined) { return value ? String(value).replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase()) : '—'; }
