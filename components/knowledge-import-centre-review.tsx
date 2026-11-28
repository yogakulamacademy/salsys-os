import type { ReactNode } from 'react';
import { projectKnowledgeImportHistory } from '@/lib/knowledge-import-history-review';
import type { KnowledgeHistorySnapshot } from '@/lib/knowledge-import-history-polling-review';
import styles from './knowledge-import-centre-review.module.css';

const labels={awaiting_upload:'Awaiting upload',queued:'Queued',processing:'Processing',completed:'Completed',failed:'Failed',cancelled:'Cancelled',expired:'Expired'} as const;
const messages = {
  loading: 'Checking import history…',
  unavailable: 'Import history is temporarily unavailable.',
  denied: 'Import access has changed. Reload this page to check your access.',
  ready: 'Import history could not be verified.',
} as const;

export function KnowledgeImportCentreReview({ snapshot, uploadControls }: {
  snapshot: KnowledgeHistorySnapshot;
  uploadControls?: ReactNode;
}) {
  const jobs = projectKnowledgeImportHistory(snapshot.rows);
  return <section className={styles.centre} aria-labelledby="knowledge-import-centre-review-heading">
    <header className={styles.header}>
      <div><h2 id="knowledge-import-centre-review-heading">Knowledge Import Centre</h2>
        <p>Upload a JSON file of up to 50 MiB and 10,000 entries. Imported drafts require approval.</p></div>
      {jobs?.some(job => job.counts.created > 0) ? <a className="kn-secondary" href="/settings/knowledge?status=draft#knowledge-library">
        View latest drafts
      </a> : null}
    </header>
    {uploadControls}
    {jobs===null?<p role="status" className={styles.notice}>{messages[snapshot.state]}</p>:jobs.length===0?<p className={styles.notice}>No recent imports.</p>:<>
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
      <p className={styles.notice}>Showing up to 25 recent imports. Processed entries include unsuccessful and cancelled entries.</p>
    </>}
  </section>;
}
