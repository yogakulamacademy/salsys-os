import type {ReactNode} from 'react';
import { projectKnowledgeImportHistory } from '@/lib/knowledge-import-history-review';
import styles from './knowledge-import-centre-review.module.css';

const labels={awaiting_upload:'Awaiting upload',queued:'Queued',processing:'Processing',completed:'Completed',failed:'Failed',cancelled:'Cancelled',expired:'Expired'} as const;
/** Unmounted read-only UI candidate. Caller must supply authorized history metadata.
 * Never accept or render source content, object URLs, tokens, or client-supplied job authority. */
export function KnowledgeImportCentreReview({rows,uploadControls}:{rows:unknown;uploadControls?:ReactNode}){
  const jobs=projectKnowledgeImportHistory(rows);
  return <section className={styles.centre} aria-labelledby="knowledge-import-centre-review-heading">
    <header className={styles.header}><div><h2 id="knowledge-import-centre-review-heading">Knowledge Import Centre</h2>
      <p>Upload large knowledge files, track processing and review drafts.</p></div><span className={styles.status}>Review only · inactive</span></header>
    {uploadControls??<div className={styles.upload}><div><strong>Import a JSON file</strong><p>Up to 50 MiB and 10,000 entries. All imported documents require approval.</p></div>
      <button type="button" disabled>Upload unavailable</button></div>}
    {jobs===null?<p role="status" className={styles.notice}>Import history is unavailable or could not be verified.</p>:jobs.length===0?<p className={styles.notice}>No import jobs in this view.</p>:<>
      <div className={styles.metrics}>
        <div><span>Active in view</span><strong>{jobs.filter(j=>['awaiting_upload','queued','processing'].includes(j.status)).length}</strong></div>
        <div><span>Completed in view</span><strong>{jobs.filter(j=>j.status==='completed').length}</strong></div>
        <div><span>Needs attention in view</span><strong>{jobs.filter(j=>j.needsAttention).length}</strong></div>
      </div>
      <h3>Recent imports</h3>
      <div className={styles.jobs}>{jobs.map(j=><article key={j.id} className={styles.job}>
        <div className={styles.header}><div><strong>Import {j.id.slice(0,8)}</strong><p>{new Date(j.createdAt).toISOString().slice(0,16).replace('T',' ')} UTC · {(j.bytes/1048576).toFixed(1)} MiB</p></div><span className={styles.status}>{labels[j.status]}</span></div>
        {j.total===null?<p>Entry count not yet verified.</p>:<><label className={styles.progressLabel} htmlFor={'knowledge-import-progress-'+j.id}>{j.processed.toLocaleString()} of {j.total.toLocaleString()} processed · {j.percent}%</label>
          <progress id={'knowledge-import-progress-'+j.id} value={j.processed} max={j.total} className={styles.progress}/>
          <dl className={styles.counts}>{Object.entries(j.counts).map(([key,value])=><div key={key}><dt>{key==='created'?'Drafts created':key==='leased'?'Processing':key}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl></>}
        {j.needsAttention?<p className={styles.notice}>Review failures and invalid entries before considering the import successful.</p>:null}
      </article>)}</div>
      <p className={styles.notice}>This view shows at most 25 jobs. Processed entries include unsuccessful and cancelled entries. Controls are available only in an isolated, authorized integration.</p>
    </>}
  </section>;
}
