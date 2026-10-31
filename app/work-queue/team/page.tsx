import Link from 'next/link';
import { ArrowLeft, ArrowRight, Inbox, UsersRound } from 'lucide-react';

import { EmptyState, PageHeader } from '@/components/ui';
import { getAdmissionsSnapshot } from '@/lib/admissions-data';
import { opportunityStageLabel } from '@/lib/crm/canonical-metrics';

type PriorityRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string | null;
  intent: string | null;
  current_contact_channel: string | null;
  first_touch_source: string | null;
  preferred_location: string | null;
  course_name: string | null;
  created_at: string | null;
  priority_score: number | string | null;
  priority_band: string | null;
  next_best_action: string | null;
  priority_reason: string | null;
  next_followup_due_at: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type OwnerScope = 'all' | 'mine' | 'unassigned';
type BandScope = 'all' | 'critical' | 'high';

export default async function TeamPriorityPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const snapshot = await getAdmissionsSnapshot();
  const rows = snapshot.priorityQueue as PriorityRow[];
  const owner = ownerScope(one(params.owner));
  const band = bandScope(one(params.band));
  const userId = snapshot.user?.id ?? null;

  const ownerScoped = rows.filter((row) => {
    if (owner === 'mine') return Boolean(userId && row.owner_user_id === userId);
    if (owner === 'unassigned') return !row.owner_user_id;
    return true;
  });

  const visibleRows = ownerScoped.filter((row) => {
    if (band === 'critical') return row.priority_band === 'critical';
    if (band === 'high') return row.priority_band === 'high';
    return true;
  });

  const critical = ownerScoped.filter((row) => row.priority_band === 'critical').length;
  const high = ownerScoped.filter((row) => row.priority_band === 'high').length;
  const unassigned = rows.filter((row) => !row.owner_user_id).length;
  const mine = userId ? rows.filter((row) => row.owner_user_id === userId).length : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales · Work Queue · Team Priority"
        title="Team priority queue"
        description="A scoped view of the same canonical priority evidence. Filter by ownership and urgency without creating another admissions dashboard."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/work-queue" className="btn-secondary"><ArrowLeft size={14} /> Work Queue</Link>
            <Link href="/conversations" className="btn-primary"><Inbox size={14} /> Inbox</Link>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Team priority" value={rows.length} note="Current explainable priority rows" />
        <Metric label="Mine" value={mine} note="Owned by the signed-in user" />
        <Metric label="Unassigned" value={unassigned} note="Need a clear owner" attention={unassigned > 0} />
        <Metric label="Critical + high" value={critical + high} note="Highest urgency bands" attention={critical + high > 0} />
      </section>

      <section className="rounded-panel border border-line bg-surface p-3 shadow-xs">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1">
            <Filter href={hrefFor('all', band)} active={owner === 'all'} label={`Team ${rows.length}`} />
            {userId ? <Filter href={hrefFor('mine', band)} active={owner === 'mine'} label={`Mine ${mine}`} /> : null}
            <Filter href={hrefFor('unassigned', band)} active={owner === 'unassigned'} label={`Unassigned ${unassigned}`} />
          </div>
          <div className="flex flex-wrap gap-1">
            <Filter href={hrefFor(owner, 'all')} active={band === 'all'} label={`All ${ownerScoped.length}`} />
            <Filter href={hrefFor(owner, 'critical')} active={band === 'critical'} label={`Critical ${critical}`} attention={critical > 0} />
            <Filter href={hrefFor(owner, 'high')} active={band === 'high'} label={`High ${high}`} attention={high > 0} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <div className="eyebrow">Priority intelligence</div>
            <h2 className="section-title mt-1">What should move next</h2>
            <p className="mt-1 text-[12px] text-copy-subtle">Score, explanation and recommended action stay visible, but every customer-visible action remains human controlled.</p>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700">{visibleRows.length.toLocaleString('en-IN')} shown</span>
        </div>

        {visibleRows.length ? (
          <div className="divide-y divide-line">
            {visibleRows.slice(0, 50).map((row) => <PriorityRowView key={row.lead_id} row={row} />)}
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="No matching priority work" description="Change the owner or urgency filter to review another part of the team queue." compact icon={<UsersRound size={18} />} />
          </div>
        )}
      </section>
    </div>
  );
}

function PriorityRowView({ row }: { row: PriorityRow }) {
  const score = numberValue(row.priority_score);
  const reply = String(row.next_best_action || '').toLowerCase().includes('reply');
  const destination = reply ? `/conversations?lead=${row.lead_id}` : `/leads/${row.lead_id}`;
  const reason = row.priority_reason || 'Current CRM state requires human review.';

  return (
    <div className="grid gap-3 px-5 py-4 transition hover:bg-surface-soft lg:grid-cols-[64px_minmax(220px,1fr)_150px_minmax(260px,1.25fr)_160px_auto] lg:items-center">
      <div className="grid h-11 w-11 place-items-center rounded-ui bg-brand-50 text-[13px] font-semibold text-brand-700">{score || '—'}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/leads/${row.lead_id}`} className="truncate text-[13px] font-semibold text-copy-strong hover:text-brand-700">{row.lead_name || row.lead_code || 'Opportunity'}</Link>
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[9px] font-semibold text-copy-muted">{opportunityStageLabel(row.current_stage)}</span>
          {row.priority_band ? <Band value={row.priority_band} /> : null}
        </div>
        <div className="mt-1 truncate text-[11px] text-copy-subtle">{[row.course_name, row.first_touch_source, row.current_contact_channel].filter(Boolean).map((value) => pretty(String(value))).join(' · ') || 'Context unavailable'}</div>
      </div>
      <div>
        <div className="text-[10px] text-copy-subtle">Owner</div>
        <div className="mt-1 text-[12px] font-medium text-copy-muted">{row.owner_name || 'Unassigned'}</div>
      </div>
      <div>
        <div className="text-[10px] text-copy-subtle">Why now</div>
        <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-copy-muted">{reason}</div>
      </div>
      <div>
        <div className="text-[10px] text-copy-subtle">Next action</div>
        <div className="mt-1 text-[12px] font-semibold text-copy-strong">{row.next_best_action || 'Review opportunity'}</div>
      </div>
      <Link href={destination} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-ui bg-brand-700 px-3 text-[11px] font-semibold text-white hover:bg-brand-800">{reply ? 'Reply' : 'Open'} <ArrowRight size={11} /></Link>
    </div>
  );
}

function Metric({ label, value, note, attention = false }: { label: string; value: number; note: string; attention?: boolean }) {
  return (
    <div className={`rounded-panel border bg-surface p-4 shadow-xs ${attention ? 'border-amber-200' : 'border-line'}`}>
      <div className="text-[11px] font-semibold text-copy-muted">{label}</div>
      <div className={`mt-2 text-[26px] font-semibold tracking-tight ${attention ? 'text-amber-700' : 'text-copy-strong'}`}>{value.toLocaleString('en-IN')}</div>
      <div className="mt-1 text-[10px] text-copy-subtle">{note}</div>
    </div>
  );
}

function Filter({ href, active, label, attention = false }: { href: string; active: boolean; label: string; attention?: boolean }) {
  return <Link href={href} className={`inline-flex min-h-8 items-center rounded-ui px-3 text-[11px] font-semibold transition ${active ? 'bg-brand-700 text-white' : attention ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'text-copy-muted hover:bg-surface-soft hover:text-copy-strong'}`}>{label}</Link>;
}

function Band({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const className = normalized === 'critical' ? 'bg-rose-50 text-rose-700' : normalized === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700';
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${className}`}>{pretty(value)}</span>;
}

function hrefFor(owner: OwnerScope, band: BandScope) {
  const search = new URLSearchParams();
  if (owner !== 'all') search.set('owner', owner);
  if (band !== 'all') search.set('band', band);
  const query = search.toString();
  return query ? `/work-queue/team?${query}` : '/work-queue/team';
}

function ownerScope(value: string): OwnerScope {
  return value === 'mine' || value === 'unassigned' ? value : 'all';
}

function bandScope(value: string): BandScope {
  return value === 'critical' || value === 'high' ? value : 'all';
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function pretty(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
