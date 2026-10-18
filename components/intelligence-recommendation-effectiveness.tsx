import { Activity, CircleCheckBig, Gauge, Target, TrendingUp } from 'lucide-react';

export type IntelligenceRecommendationEffectivenessRow = {
  signal_id: string;
  role_scope: string;
  category: string;
  recommendation_count: number;
  shown_count: number;
  accepted_count: number;
  dismissed_count: number;
  acted_count: number;
  completed_count?: number;
  started_not_completed_count?: number;
  completion_rate?: number | null;
  outcome_observed_count: number;
  positive_count: number;
  negative_count: number;
  mixed_count: number;
  inconclusive_count: number;
  action_rate: number | null;
  positive_resolved_rate: number | null;
  negative_resolved_rate: number | null;
  sample_band: 'insufficient' | 'emerging' | 'established' | 'mature' | string;
};

function pct(value: number | null | undefined) {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function sampleLabel(value: IntelligenceRecommendationEffectivenessRow['sample_band']) {
  if (value === 'mature') return 'Mature sample';
  if (value === 'established') return 'Established sample';
  if (value === 'emerging') return 'Emerging sample';
  return 'Insufficient sample';
}

function signalLabel(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function IntelligenceRecommendationEffectiveness({
  rows,
}: {
  rows: IntelligenceRecommendationEffectivenessRow[];
}) {
  const observed = rows.reduce((sum, row) => sum + Number(row.outcome_observed_count || 0), 0);
  const acted = rows.reduce((sum, row) => sum + Number(row.acted_count || 0), 0);
  const completed = rows.reduce((sum, row) => sum + Number(row.completed_count || 0), 0);
  const positive = rows.reduce((sum, row) => sum + Number(row.positive_count || 0), 0);
  const resolved = rows.reduce(
    (sum, row) => sum + Number(row.positive_count || 0) + Number(row.negative_count || 0) + Number(row.mixed_count || 0),
    0,
  );
  const calibrationReady = rows.filter((row) => row.sample_band === 'established' || row.sample_band === 'mature').length;
  const completionRate = acted > 0 ? completed / acted : null;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Recommendation learning</div>
          <h2 className="mt-1 text-base font-black text-slate-900">Effectiveness evidence</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Operator actions, explicit completion and downstream CRM outcomes are summarized by signal and role. This is learning evidence, not causal attribution.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
          Bounded calibration activates only after sample maturity gates are met.
        </div>
      </div>

      <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-white px-5 py-4">
          <Activity size={16} className="text-slate-400" />
          <div className="mt-2 text-2xl font-black text-slate-900">{acted}</div>
          <div className="text-xs font-bold text-slate-500">Actions started</div>
        </div>
        <div className="bg-white px-5 py-4">
          <CircleCheckBig size={16} className="text-slate-400" />
          <div className="mt-2 text-2xl font-black text-slate-900">{pct(completionRate)}</div>
          <div className="text-xs font-bold text-slate-500">Action completion rate</div>
        </div>
        <div className="bg-white px-5 py-4">
          <Target size={16} className="text-slate-400" />
          <div className="mt-2 text-2xl font-black text-slate-900">{observed}</div>
          <div className="text-xs font-bold text-slate-500">Outcomes observed</div>
        </div>
        <div className="bg-white px-5 py-4">
          <TrendingUp size={16} className="text-slate-400" />
          <div className="mt-2 text-2xl font-black text-slate-900">{resolved ? `${Math.round((positive / resolved) * 100)}%` : '—'}</div>
          <div className="text-xs font-bold text-slate-500">Positive resolved outcomes</div>
        </div>
        <div className="bg-white px-5 py-4">
          <Gauge size={16} className="text-slate-400" />
          <div className="mt-2 text-2xl font-black text-slate-900">{calibrationReady}</div>
          <div className="text-xs font-bold text-slate-500">Signals calibration-ready</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-6 text-sm text-slate-500">
          No recommendation learning history yet. SalsysOS will populate this after recommendations are shown, acted on and observed over time.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.slice(0, 8).map((row) => (
            <div key={`${row.signal_id}:${row.role_scope}`} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,.75fr))] md:items-center">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-900">{signalLabel(row.signal_id)}</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {row.role_scope} · {row.category} · {sampleLabel(row.sample_band)}
                </div>
              </div>
              <div>
                <div className="text-xs font-black text-slate-900">{row.acted_count}</div>
                <div className="text-[11px] text-slate-400">started</div>
              </div>
              <div>
                <div className="text-xs font-black text-slate-900">{row.completed_count ?? 0}</div>
                <div className="text-[11px] text-slate-400">completed</div>
              </div>
              <div>
                <div className="text-xs font-black text-slate-900">{pct(row.completion_rate)}</div>
                <div className="text-[11px] text-slate-400">completion rate</div>
              </div>
              <div>
                <div className="text-xs font-black text-slate-900">{row.outcome_observed_count}</div>
                <div className="text-[11px] text-slate-400">observed</div>
              </div>
              <div>
                <div className="text-xs font-black text-slate-900">{pct(row.action_rate)}</div>
                <div className="text-[11px] text-slate-400">action rate</div>
              </div>
              <div>
                <div className="text-xs font-black text-slate-900">{pct(row.positive_resolved_rate)}</div>
                <div className="text-[11px] text-slate-400">positive resolved</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
