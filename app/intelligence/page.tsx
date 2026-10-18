import Link from 'next/link';
import { ArrowRight, BrainCircuit, DatabaseZap, ShieldCheck, Sparkles } from 'lucide-react';

import { ClaudeOperatingBrief } from '@/components/claude-operating-brief';
import {
  IntelligenceRecommendationEffectiveness,
  type IntelligenceRecommendationEffectivenessRow,
} from '@/components/intelligence-recommendation-effectiveness';
import { SystemIntelligenceBrief } from '@/components/system-intelligence-brief';
import { SystemMorningBrief } from '@/components/system-morning-brief';
import { PageHeader } from '@/components/ui';
import { getDashboardSnapshot } from '@/lib/dashboard-data';
import { getSystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';
import { buildSystemIntelligenceV2 } from '@/lib/intelligence/system-intelligence-v2';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function observeRecommendationOutcomes() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('observe_system_intelligence_recommendation_outcomes_v1', {
      p_limit: 25,
    });

    if (error) {
      console.warn('SYSTEM_INTELLIGENCE_OUTCOME_OBSERVER_FAILED', error.message);
    }
  } catch (error) {
    console.warn(
      'SYSTEM_INTELLIGENCE_OUTCOME_OBSERVER_FAILED',
      error instanceof Error ? error.message : 'unknown',
    );
  }
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function effectivenessKey(signalId: unknown, roleScope: unknown, category: unknown) {
  return `${String(signalId || '')}:${String(roleScope || '')}:${String(category || '')}`;
}

async function getRecommendationEffectiveness(): Promise<IntelligenceRecommendationEffectivenessRow[]> {
  try {
    const supabase = await createClient();
    const [effectivenessResult, completionResult] = await Promise.all([
      supabase.rpc('get_system_intelligence_recommendation_effectiveness_v1'),
      supabase.rpc('get_system_intelligence_action_completion_effectiveness_v1'),
    ]);

    if (effectivenessResult.error) {
      console.warn('SYSTEM_INTELLIGENCE_EFFECTIVENESS_FAILED', effectivenessResult.error.message);
      return [];
    }

    if (completionResult.error) {
      console.warn('SYSTEM_INTELLIGENCE_COMPLETION_EFFECTIVENESS_FAILED', completionResult.error.message);
    }

    if (!Array.isArray(effectivenessResult.data)) return [];

    const completionBySignal = new Map<string, {
      completed_count: number;
      started_not_completed_count: number;
      completion_rate: number | null;
    }>();

    if (!completionResult.error && Array.isArray(completionResult.data)) {
      for (const row of completionResult.data) {
        completionBySignal.set(
          effectivenessKey(row.signal_id, row.role_scope, row.category),
          {
            completed_count: numberValue(row.completed_count),
            started_not_completed_count: numberValue(row.started_not_completed_count),
            completion_rate: nullableNumberValue(row.completion_rate),
          },
        );
      }
    }

    return effectivenessResult.data.map((row) => {
      const completion = completionBySignal.get(
        effectivenessKey(row.signal_id, row.role_scope, row.category),
      );

      return {
        signal_id: String(row.signal_id || ''),
        role_scope: String(row.role_scope || ''),
        category: String(row.category || ''),
        recommendation_count: numberValue(row.recommendation_count),
        shown_count: numberValue(row.shown_count),
        accepted_count: numberValue(row.accepted_count),
        dismissed_count: numberValue(row.dismissed_count),
        acted_count: numberValue(row.acted_count),
        completed_count: completion?.completed_count ?? 0,
        started_not_completed_count: completion?.started_not_completed_count ?? numberValue(row.acted_count),
        completion_rate: completion?.completion_rate ?? null,
        outcome_observed_count: numberValue(row.outcome_observed_count),
        positive_count: numberValue(row.positive_count),
        negative_count: numberValue(row.negative_count),
        mixed_count: numberValue(row.mixed_count),
        inconclusive_count: numberValue(row.inconclusive_count),
        action_rate: nullableNumberValue(row.action_rate),
        positive_resolved_rate: nullableNumberValue(row.positive_resolved_rate),
        negative_resolved_rate: nullableNumberValue(row.negative_resolved_rate),
        sample_band: String(row.sample_band || 'insufficient'),
      };
    });
  } catch (error) {
    console.warn(
      'SYSTEM_INTELLIGENCE_EFFECTIVENESS_FAILED',
      error instanceof Error ? error.message : 'unknown',
    );
    return [];
  }
}

export default async function IntelligencePage() {
  await observeRecommendationOutcomes();

  const [snapshot, context, effectiveness] = await Promise.all([
    getDashboardSnapshot(),
    getSystemIntelligenceContext(),
    getRecommendationEffectiveness(),
  ]);
  const brief = buildSystemIntelligenceV2(snapshot, context);

  return (
    <div className="dashboard-polish">
      <PageHeader
        eyebrow="Operating intelligence"
        title="What should we do right now?"
        description="SalsysOS correlates live operating signals, detects fresh behavioural and velocity changes, and re-ranks priorities for the current role instead of showing a fixed dashboard checklist."
        actions={
          <Link href="/dashboard" className="btn-secondary">
            Dashboard
            <ArrowRight size={14} />
          </Link>
        }
      />

      <SystemMorningBrief snapshot={snapshot} context={context} brief={brief} />
      <SystemIntelligenceBrief brief={brief} />
      <IntelligenceRecommendationEffectiveness rows={effectiveness} />
      <ClaudeOperatingBrief />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <BrainCircuit size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Correlate → prioritize</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Related symptoms are merged into operating situations. Reply pressure, behavioural re-engagement, lead velocity, revenue and system health compete for priority instead of appearing as unrelated static cards.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <DatabaseZap size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Fresh evidence + role context</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Current and previous 24-hour activity windows, journey re-engagement and operational health enrich the base snapshot. The same facts are weighted differently for owner, manager and admissions roles.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Evidence before AI</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Deterministic evidence remains the authority. Claude now synthesizes the bounded signal contract on demand, while customer, financial, automation and website actions continue through the existing control planes.
          </p>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 px-5 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-violet-300">
              <Sparkles size={13} />
              Intelligence Core v2
            </div>
            <div className="mt-1 text-lg font-black">The operating brief now changes with the business and with the person using it.</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
              V2 adds a 24-hour Morning Brief, signal correlation, behavioural re-engagement, velocity comparison, system-health confidence, role-aware ranking and bounded Claude synthesis. Recommendation actions feed explicit completion tracking, a tenant-safe outcome observer, effectiveness measurement and tightly capped calibration once evidence is mature enough.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-200">
            Dynamic · tenant-scoped · role-aware · human-controlled
          </div>
        </div>
      </section>
    </div>
  );
}
