import { LeadStage } from '@/types/crm';
import { stageOrder } from '@/lib/mock-data';

const labels: Record<LeadStage, string> = {
  new: 'New', contacted: 'Contacted', engaged: 'Engaged', qualified: 'Qualified', high_intent: 'High intent', payment_pending: 'Payment pending', enrolled: 'Enrolled', nurture: 'Nurture', not_now: 'Not now', lost: 'Lost', unqualified: 'Unqualified', duplicate: 'Duplicate'
};

export function FunnelCard({ counts }: { counts: Record<LeadStage, number> }) {
  const max = counts.new || 1;
  return (
    <div className="card-pad">
      <div className="mb-5 flex items-center justify-between">
        <div><div className="eyebrow">Admissions</div><div className="section-title mt-1">Lead funnel</div></div>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">This month</span>
      </div>
      <div className="space-y-3.5">
        {stageOrder.map((stage, idx) => {
          const count = counts[stage];
          const prev = idx === 0 ? max : counts[stageOrder[idx - 1]] || 1;
          const conv = idx === 0 ? 100 : Math.round((count / prev) * 100);
          return (
            <div key={stage}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">{labels[stage]}</span>
                <span><strong className="text-slate-900">{count}</strong><span className="ml-2 text-xs text-slate-400">{idx === 0 ? '100%' : `${conv}%`}</span></span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (count / max) * 100)}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
