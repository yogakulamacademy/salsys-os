import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Database,
  Search,
} from 'lucide-react';

import { PageHeader, StatCard } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

type SearchHealth = {
  indexing_enabled: boolean | null;
  pilot_mode_enabled: boolean | null;
  pilot_started_at: string | null;
  pilot_max_documents: number | string | null;
  pilot_seeded_at: string | null;
  pending: number | string | null;
  processing: number | string | null;
  retry: number | string | null;
  dead_letter: number | string | null;
  done: number | string | null;
  oldest_waiting_at: string | null;
  last_completed_at: string | null;
  searches_24h: number | string | null;
  zero_result_24h: number | string | null;
  errors_24h: number | string | null;
  searches_7d: number | string | null;
  avg_took_ms_24h: number | string | null;
  p95_took_ms_24h: number | string | null;
  last_search_at: string | null;
  last_error_at: string | null;
  latest_error_code: string | null;
  checked_at: string | null;
};

type SearchEvent = {
  occurred_at: string;
  query_length: number;
  entity_types: string[] | null;
  result_count: number;
  took_ms: number;
  outcome: 'success' | 'zero_result' | 'error' | string;
  error_code: string | null;
};

function numberValue(value: number | string | null | undefined) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function dateTime(value: string | null | undefined) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function outcomeClass(outcome: string) {
  if (outcome === 'success') return 'bg-emerald-50 text-emerald-700';
  if (outcome === 'zero_result') return 'bg-amber-50 text-amber-700';
  return 'bg-rose-50 text-rose-700';
}

async function requireAdminOrganization() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.active) redirect('/login');

  const workspace = await getWorkspaceContextForUser(supabase, user.id);
  if (!workspace.activeWorkspace) redirect('/workspace');

  if (
    workspace.activeWorkspace.role !== 'owner' &&
    workspace.activeWorkspace.role !== 'admin'
  ) {
    redirect('/dashboard');
  }

  return workspace.activeWorkspace.organizationId;
}

export default async function SearchHealthPage() {
  const organizationId = await requireAdminOrganization();
  const admin = createAdminClient() as any;

  const [healthResult, eventsResult] = await Promise.all([
    admin
      .from('v_search_observability_v1')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    admin
      .from('search_query_events')
      .select('occurred_at,query_length,entity_types,result_count,took_ms,outcome,error_code')
      .eq('organization_id', organizationId)
      .order('occurred_at', { ascending: false })
      .limit(25),
  ]);

  const health = (healthResult.data || null) as SearchHealth | null;
  const events = (eventsResult.data || []) as SearchEvent[];
  const errors = [healthResult.error?.message, eventsResult.error?.message].filter(Boolean);

  const searches24h = numberValue(health?.searches_24h);
  const zero24h = numberValue(health?.zero_result_24h);
  const failures24h = numberValue(health?.errors_24h);
  const zeroRate = searches24h > 0 ? Math.round((zero24h / searches24h) * 100) : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Search operations"
        title="Search health"
        description="Monitor tenant-safe OpenSearch indexing, query latency, zero-result rate, and failures without storing raw search text."
        actions={
          <Link className="btn-secondary" href="/system-health">
            <ArrowLeft size={15} />
            System Health
          </Link>
        }
      />

      {errors.length > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Some search-health data could not be loaded.</div>
            <div className="mt-1 text-xs">{errors.join(' · ')}</div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Searches · 24h"
          value={searches24h.toLocaleString()}
          note={`${numberValue(health?.searches_7d).toLocaleString()} in the last 7 days`}
          icon={<Search size={19} />}
        />
        <StatCard
          label="Zero-result rate"
          value={`${zeroRate}%`}
          note={`${zero24h.toLocaleString()} searches returned no result`}
          icon={<Activity size={19} />}
        />
        <StatCard
          label="P95 latency"
          value={`${Math.round(numberValue(health?.p95_took_ms_24h))} ms`}
          note={`Average ${Math.round(numberValue(health?.avg_took_ms_24h))} ms`}
          icon={<Clock3 size={19} />}
        />
        <StatCard
          label="Search errors · 24h"
          value={failures24h.toLocaleString()}
          note={health?.latest_error_code || 'No recent search error'}
          icon={<AlertTriangle size={19} />}
        />
      </div>

      <section className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="eyebrow">Indexing control plane</div>
          <div className="section-title mt-1">OpenSearch state</div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Indexing</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">
              {health?.indexing_enabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pilot</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">
              {health?.pilot_mode_enabled ? 'Guarded pilot mode' : 'Pilot guard off'}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Cap {numberValue(health?.pilot_max_documents)} documents
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Queue</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">
              {numberValue(health?.pending)} pending · {numberValue(health?.processing)} processing
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {numberValue(health?.retry)} retry · {numberValue(health?.dead_letter)} dead-letter
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Indexed</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">
              {numberValue(health?.done).toLocaleString()} completed
            </div>
            <div className="mt-1 text-xs text-slate-400">Last completion {dateTime(health?.last_completed_at)}</div>
          </div>
        </div>
      </section>

      <section className="card mt-4 overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="eyebrow">Privacy-safe telemetry</div>
            <div className="section-title mt-1">Recent search activity</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Query text is intentionally not stored. Only query length, filters, result count, latency, outcome, and a safe error category are recorded.
            </p>
          </div>
          <Database size={19} className="mt-1 shrink-0 text-slate-400" />
        </div>

        {events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] uppercase tracking-[.1em] text-slate-400">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Query length</th>
                  <th className="px-4 py-3">Types</th>
                  <th className="px-4 py-3">Results</th>
                  <th className="px-4 py-3">Latency</th>
                  <th className="px-4 py-3">Error category</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => (
                  <tr key={`${event.occurred_at}:${index}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-xs text-slate-500">{dateTime(event.occurred_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${outcomeClass(event.outcome)}`}>
                        {event.outcome.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{event.query_length}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {event.entity_types?.length ? event.entity_types.join(', ') : 'all'}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{event.result_count}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{event.took_ms} ms</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{event.error_code || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            No search telemetry yet. Activity will appear after authenticated users run global searches.
          </div>
        )}
      </section>
    </div>
  );
}
