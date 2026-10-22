import Link from 'next/link';

import { getCampaignsWorkspace } from '@/lib/campaigns-data';
import { getRevenueWorkspace } from '@/lib/revenue-data';
import { getTrackingWorkspace } from '@/lib/tracking-data';
import styles from '@/components/marketing/measurement-reference.module.css';

export default async function DataCoveragePage() {
  const currentMonth = new Date().toISOString().slice(0,7);
  const [tracking,campaigns,revenue] = await Promise.all([
    getTrackingWorkspace(),
    getCampaignsWorkspace({query:'',platform:'all',outcome:'all',sortMode:'spend_desc',page:1,pageSize:50}),
    getRevenueWorkspace(currentMonth),
  ]);
  const events = tracking.health.events24h;
  const identified = tracking.health.identifiedEvents24h;
  const clickIdEvents = tracking.health.gclidEvents7d + tracking.health.fbclidEvents7d;
  const paidClicks = campaigns.summary.clicks;
  const campaignMatchedLeads = campaigns.summary.leads;
  const campaignRevenueInr = campaigns.summary.revenueInr;
  const revenueInr = revenue.totalsByCurrency.find(row=>row.currency.toUpperCase()==='INR')?.actual ?? 0;
  const campaignRevenueUsd = campaigns.summary.revenueUsd;
  const revenueUsd = revenue.totalsByCurrency.find(row=>row.currency.toUpperCase()==='USD')?.actual ?? 0;

  const rows = [
    {name:'Visitor Identity',known:identified,total:events,unit:'events · 24h',desc:'Events carrying an identified CRM/customer context versus all first-party events received.'},
    {name:'Paid Click IDs',known:clickIdEvents,total:Math.max(clickIdEvents,paidClicks),unit:'observations',desc:'gclid/fbclid observations compared with the available paid click scope. These sources use different windows, so treat this as directional coverage.'},
    {name:'Campaign → CRM',known:campaignMatchedLeads,total:campaignMatchedLeads,unit:'matched leads',desc:'Deterministic campaign-linked CRM leads. The current model does not expose a reliable all-paid-leads denominator here.'},
    {name:'INR Revenue Attribution',known:campaignRevenueInr,total:revenueInr,unit:'INR',desc:'Collected INR revenue visible through campaign attribution versus canonical INR revenue.'},
    {name:'USD Revenue Attribution',known:campaignRevenueUsd,total:revenueUsd,unit:'USD',desc:'Collected USD revenue visible through campaign attribution versus canonical USD revenue.'},
  ];

  return <div className={styles.page}>
    <header className={styles.head}><div className={styles.eyebrow}>Measurement</div><h1 className={styles.title}>Data Coverage</h1><p className={styles.subtitle}>Make missing evidence visible. Known, Partial and Unknown are measurement states—not values to fill with assumptions.</p></header>
    <div className={styles.ribbon}><strong>Trust includes what is missing.</strong><span> Consent restrictions, missing IDs, unmatched revenue and unavailable denominators stay explicit instead of being inferred.</span></div>
    <div className={styles.equal}>
      <section className={styles.panel}><div className={styles.panelHead}><h2>Attribution Coverage</h2><p>Current evidence across campaign and revenue joins.</p></div><div className={styles.panelBody}>{rows.slice(1).map(row=><Coverage key={row.name} {...row}/>)}</div></section>
      <section className={styles.panel}><div className={styles.panelHead}><h2>Identity & Consent</h2><p>Identity coverage is measurable; blanket optional consent is not inferred here.</p></div><div className={styles.panelBody}><Coverage {...rows[0]}/><div className={styles.coverage}><div className={styles.coverageTop}><strong>Optional Consent Coverage</strong><span><span className={`${styles.badge} ${styles.unknown}`}>Unknown</span></span></div><p>This read model does not expose a comparable consent-category denominator. Open Tracking Sources or lead-level consent evidence rather than assuming permission.</p></div><Link className={styles.link} href="/marketing/tracking-sources">Inspect tracking sources →</Link></div></section>
    </div>
    <section className={styles.panel}><div className={styles.panelHead}><h2>Coverage Definitions</h2><p>What each status means in SalsysOS.</p></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>State</th><th>Meaning</th><th>Product Behavior</th></tr></thead><tbody><tr><td><span className={styles.badge}>Known</span></td><td>Required evidence is present for the stated relationship.</td><td>Show the observed value and allow drill-down.</td></tr><tr><td><span className={`${styles.badge} ${styles.partial}`}>Partial</span></td><td>Some evidence exists, but the denominator or join is incomplete.</td><td>Show coverage and withhold unsupported efficiency claims.</td></tr><tr><td><span className={`${styles.badge} ${styles.unknown}`}>Unknown</span></td><td>The system cannot reliably determine the value.</td><td>Preserve Unknown; never silently convert it to zero or a guessed source.</td></tr></tbody></table></div></section>
  </div>;
}
function Coverage({name,known,total,unit,desc}:{name:string;known:number;total:number;unit:string;desc:string}){const comparable=total>0;const ratio=comparable?Math.min(100,Math.max(0,known/total*100)):0;const state=!comparable?'Unknown':ratio>=99.5?'Known':'Partial';return <div className={styles.coverage}><div className={styles.coverageTop}><strong>{name}</strong><span>{state==='Unknown'?<span className={`${styles.badge} ${styles.unknown}`}>Unknown</span>:<>{ratio.toFixed(1)}% <span className={`${styles.badge} ${state==='Partial'?styles.partial:''}`}>{state}</span></>}</span></div><span className={`${styles.track} ${state==='Partial'?styles.trackWarn:''}`}><i style={{width:`${ratio}%`}}/></span><p>{comparable?`${format(known,unit)} / ${format(total,unit)} · `:''}{desc}</p></div>}
function format(v:number,unit:string){if(unit==='INR')return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v);if(unit==='USD')return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);return `${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0})} ${unit}`}
