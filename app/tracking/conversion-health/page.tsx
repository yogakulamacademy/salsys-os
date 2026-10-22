import Link from 'next/link';

import { getCampaignsWorkspace } from '@/lib/campaigns-data';
import { getTrackingWorkspace } from '@/lib/tracking-data';
import styles from '@/components/marketing/measurement-reference.module.css';

export default async function ConversionHealthPage() {
  const [tracking, campaigns] = await Promise.all([
    getTrackingWorkspace(),
    getCampaignsWorkspace({ query:'', platform:'all', outcome:'all', sortMode:'spend_desc', page:1, pageSize:50 }),
  ]);
  const rawForms = tracking.capture.submissions24h;
  const newLeads = tracking.capture.newLeads24h;
  const matchedExisting = tracking.capture.matchedExisting24h;
  const resolvedSubmissions = newLeads + matchedExisting;
  const browserSubmits = tracking.funnel.browserFormSubmits;
  const trackedStarts = tracking.funnel.formStarts;
  const campaignMatches = campaigns.summary.leads;
  const enrollments = campaigns.summary.enrolled;

  const reconciliation = [
    { name:'Form submissions · 24h', received:rawForms, linked:resolvedSubmissions, reason:'Server capture compared with new-lead and existing-lead resolution.' },
    { name:'Browser form submits · 7d funnel', received:browserSubmits, linked:browserSubmits, reason:'Browser submit events are tracked separately from server-side CRM ingestion.' },
    { name:'CRM campaign matches', received:campaignMatches, linked:campaignMatches, reason:'Deterministic campaign-linked CRM leads in the current campaign workspace.' },
    { name:'Campaign-linked enrollments', received:enrollments, linked:enrollments, reason:'Observed enrollment outcomes on deterministically matched campaign leads.' },
  ];

  return <div className={styles.page}>
    <header className={styles.head}><div className={styles.eyebrow}>Measurement</div><h1 className={styles.title}>Conversion Health</h1><p className={styles.subtitle}>Reconcile conversion events with stable identities before using them for optimization or reporting.</p></header>
    {tracking.warning ? <div className={`${styles.ribbon} ${styles.ribbonWarn}`}>{tracking.warning}</div> : null}
    <section className={styles.pulse}>
      <Metric label="Form Conversions" value={num(rawForms)} note="Server submissions · 24h" />
      <Metric label="Resolved to CRM" value={num(resolvedSubmissions)} note="New + matched existing" />
      <Metric label="Campaign Matches" value={num(campaignMatches)} note="Deterministic paid attribution" />
      <Metric label="Enrollments" value={num(enrollments)} note="Campaign-linked outcomes" />
      <Metric label="Form Start → Submit" value={percent(browserSubmits,trackedStarts)} note="Observed browser funnel" />
      <Metric label="Revenue Coverage" value="Unknown" note="No single comparable denominator here" />
    </section>
    <div className={styles.ribbon}><strong>A conversion needs an identity.</strong><span> Do not count duplicate events, assume an advertising match, or silently convert missing evidence into zero.</span></div>

    <div className={styles.equal}>
      <section className={styles.panel}><div className={styles.panelHead}><h2>Conversion Reconciliation</h2><p>Observed event totals and the deterministic identity links available to this workspace.</p></div><div className={styles.panelBody}>{reconciliation.map(row=><div className={styles.coverage} key={row.name}><div className={styles.coverageTop}><strong>{row.name}</strong><span>{num(row.linked)} / {num(row.received)} linked</span></div><span className={`${styles.track} ${row.linked<row.received?styles.trackWarn:''}`}><i style={{width:`${row.received?Math.min(100,row.linked/row.received*100):0}%`}}/></span><p>{row.reason}</p></div>)}</div></section>
      <section className={`${styles.panel} ${styles.focus}`}><div className={styles.focusLabel}>Needs Attention</div><h2>Submissions without a resolved CRM identity</h2><div className={styles.big}>{num(Math.max(0,rawForms-resolvedSubmissions))}</div><p>These 24-hour server submissions are not represented by the new-lead + matched-existing resolution counts available in the capture health model. Inspect capture/reconciliation before treating them as lost leads.</p><Link className={styles.link} href="/tracking/data-coverage">Inspect evidence gaps →</Link></section>
    </div>
  </div>;
}
function Metric({label,value,note}:{label:string;value:string;note:string}){return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>}
function num(v:number){return Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0})}
function percent(v:number,d:number){return d>0?`${(v/d*100).toFixed(1)}%`:'—'}
