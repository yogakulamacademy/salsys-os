import 'server-only';
import type { EffectiveQuotaView, QuotaMetric } from '@/lib/platform-effective-quota-view';

function QuotaMetricCard({label,metric}:{label:string;metric:QuotaMetric}) {
  const percent=Math.min(100,metric.used/metric.limit*100);
  return <article className="rounded-lg border border-line p-4">
    <h3 className="text-sm font-medium">{label}</h3>
    <p className="mt-2 text-xl font-bold tabular-nums">{metric.used.toLocaleString('en-US')} / {metric.limit.toLocaleString('en-US')}</p>
    <div role="progressbar" aria-label={label+' quota used'} aria-valuemin={0} aria-valuemax={metric.limit}
      aria-valuenow={Math.min(metric.used,metric.limit)} aria-valuetext={metric.used+' used of '+metric.limit}
      className="mt-3 h-2 overflow-hidden rounded-full bg-surface-soft">
      <div className="h-full rounded-full bg-brand-700" style={{width:percent+'%'}}/>
    </div>
    <p className="mt-2 text-xs text-copy-muted">{metric.overLimit?'Over effective limit; existing records retained.':metric.atLimit?'At effective limit.':metric.remaining.toLocaleString('en-US')+' remaining under effective limit.'}</p>
  </article>;
}

export function EffectiveQuotaPanel({quota}:{quota:EffectiveQuotaView}) {
  const message=quota.state==='unavailable'?'Effective quota information unavailable.':quota.state==='managed_separately'?'This organization is managed separately from the verified signup quota system.':quota.state==='organization_inactive'?'Organization inactive; effective quota information is not shown.':null;
  return <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
    <h2 className="font-semibold">Effective resource usage</h2>
    {quota.state==='unavailable'||quota.state==='managed_separately'||quota.state==='organization_inactive'
      ? <p role="status" className="mt-3 text-sm text-copy-muted">{message}</p>
      : <>
        <p className="mt-2 text-sm"><span className="font-semibold capitalize">{quota.planCode}</span> · {quota.state==='free_pending_reconciliation'?'Free fallback pending reconciliation':quota.state==='manual_active'?'Manually assigned contract':quota.state==='pro_trial'?'Pro trial':'Free'}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><QuotaMetricCard label="Named users" metric={quota.users}/><QuotaMetricCard label="Lead records" metric={quota.leads}/></div>
        <p className="mt-3 text-xs text-copy-muted">Effective quota counters, not registry totals, active sessions, payment evidence or a guarantee of future access.</p>
      </>}
  </section>;
}
