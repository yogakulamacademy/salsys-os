import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Columns3,
  DatabaseZap,
  Flame,
  ListFilter,
  Plus,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

import { LeadJourneyIntelligence } from '@/components/lead-journey-intelligence';
import { LeadsCleanTable } from '@/components/leads-clean-table';
import { PipelineBoardStudio } from '@/components/crm/pipeline-board-studio';
import {
  PipelineInsights,
  type PipelineAgingPoint,
} from '@/components/pipeline-insights';
import { RecentBookingActivity } from '@/components/recent-booking-activity';
import { TeamAssignmentPanel } from '@/components/team-assignment-panel';
import { Notice, PageHeader } from '@/components/ui';
import { isMockMode, getLeads } from '@/lib/data';
import {
  getLeadsWorkspacePage,
  parseLeadsWorkspaceParams,
} from '@/lib/leads-data';
import { getPipelineSnapshot } from '@/lib/pipeline-data';
import {
  getReEngagedWorkspace,
  type JourneyLeadRow,
} from '@/lib/reengaged-data';
import {
  ACTIVE_OPPORTUNITY_STAGES,
  opportunityStageLabel,
} from '@/lib/crm/canonical-metrics';

type Surface = 'table' | 'pipeline' | 'activity' | 'quality';
type ActivityView = 'all' | 'reengaged' | 'hot' | 'high_intent';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const surface = parseSurface(one(params.surface));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales · Opportunities"
        title="Opportunities"
        description="One commercial workspace for opportunity records, pipeline movement, behavioural activity and data quality. Change the view without losing the underlying customer context."
        actions={
          <Link href="/leads/new" className="btn-primary">
            <Plus size={15} /> Add opportunity
          </Link>
        }
      />

      <OpportunityTabs active={surface} />

      {surface === 'table' ? <TableSurface params={params} /> : null}
      {surface === 'pipeline' ? <PipelineSurface /> : null}
      {surface === 'activity' ? <ActivitySurface params={params} /> : null}
      {surface === 'quality' ? <QualitySurface /> : null}
    </div>
  );
}

async function TableSurface({ params }: { params: Record<string, string | string[] | undefined> }) {
  const filters = parseLeadsWorkspaceParams(params);
  const workspace = await getLeadsWorkspacePage(filters);
  const notice = one(params.notice);
  const error = one(params.error);

  return (
    <div className="leads-workspace-v2 space-y-4">
      {notice === 'mock-create' ? (
        <Notice tone="warning">Demo mode is active, so the test opportunity was not saved.</Notice>
      ) : null}
      {notice === 'owner-updated' || notice === 'owner-unassigned' ? (
        <Notice tone="success">
          {notice === 'owner-unassigned' ? 'Opportunity ownership removed.' : 'Opportunity owner updated.'}
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {workspace.warning ? (
        <Notice tone="warning" title="Opportunities loaded with a fallback path">
          {workspace.warning}
        </Notice>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="All" value={workspace.summary.all} note="Accessible opportunities" />
        <Metric label="Unassigned" value={workspace.summary.unassigned} note="Need an owner" tone="attention" />
        <Metric label="Stuck" value={workspace.summary.stuck} note="Past stage threshold" tone="attention" />
        <Metric label="Follow-up overdue" value={workspace.summary.followupOverdue} note="Action already due" tone="attention" />
        <Metric label="Payment pending" value={workspace.summary.paymentPending} note="Closest active stage" tone="money" />
      </section>

      <details className="group rounded-panel border border-line bg-surface shadow-xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <div className="eyebrow">Operational context</div>
            <div className="section-title mt-1">Assignment and recent booking activity</div>
            <p className="mt-1 text-[12px] text-copy-subtle">Keep secondary operational context available without crowding the primary opportunity table.</p>
          </div>
          <span className="rounded-full bg-surface-soft px-2.5 py-1 text-[10px] font-semibold text-copy-muted group-open:bg-brand-50 group-open:text-brand-700">Expand</span>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          <RecentBookingActivity />
          <TeamAssignmentPanel returnTo="/opportunities" />
        </div>
      </details>

      <LeadsCleanTable
        leads={workspace.leads}
        intelligence={workspace.intelligence}
        mock={isMockMode()}
        filters={filters}
        options={workspace.options}
        summary={workspace.summary}
        pagination={workspace.pagination}
      />
    </div>
  );
}

async function PipelineSurface() {
  const snapshot = await getPipelineSnapshot();
  const stageCountByStage = new Map(snapshot.stageCounts.map((row) => [row.stage, row.leads]));
  const agingByStage = new Map(snapshot.agingSummary.map((row) => [row.stage, row]));
  const insightData = ACTIVE_OPPORTUNITY_STAGES.map((stage) => ({
    stage: opportunityStageLabel(stage),
    leads: stageCountByStage.get(stage) ?? 0,
  }));
  const agingInsightData: PipelineAgingPoint[] = ACTIVE_OPPORTUNITY_STAGES.map((stage) => {
    const row = agingByStage.get(stage);
    return {
      stage: opportunityStageLabel(stage),
      healthy: row?.healthy ?? 0,
      warning: row?.warning ?? 0,
      stuck: row?.stuck ?? 0,
      medianDays: row?.medianDays ?? 0,
      oldestDays: row?.oldestDays ?? 0,
    };
  });

  return (
    <div className="space-y-4">
      {snapshot.warning ? (
        <Notice tone="warning" title="Pipeline loaded with a fallback path">
          {snapshot.warning}
        </Notice>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Active pipeline" value={snapshot.metrics.activePipeline} note="Open opportunities" />
        <Metric label="Qualified+" value={snapshot.metrics.qualifiedPlus} note="Qualified through enrolled" />
        <Metric label="High intent" value={snapshot.metrics.highIntent} note="Strong enrollment intent" tone="priority" />
        <Metric label="Payment pending" value={snapshot.metrics.paymentPending} note="Closest active stage" tone="money" />
        <Metric label="Stuck" value={snapshot.metrics.stuckLeads} note="Past stage threshold" tone="attention" />
      </section>

      <section className="rounded-panel border border-line bg-surface p-4 shadow-xs">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="eyebrow">Pipeline intelligence</div>
            <h2 className="section-title mt-1">Movement and stage aging</h2>
            <p className="mt-1 text-[12px] text-copy-subtle">Use stage distribution and aging together so volume does not hide stalled opportunities.</p>
          </div>
          <div className="flex gap-2 text-[10px] font-semibold text-copy-subtle">
            <span>{snapshot.metrics.warningLeads} warning</span>
            <span>·</span>
            <span>{snapshot.metrics.medianStageAgeDays.toFixed(1)}d median age</span>
          </div>
        </div>
        <PipelineInsights data={insightData} agingData={agingInsightData} />
      </section>

      {snapshot.stuckLeads.length ? (
        <section className="rounded-panel border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="eyebrow text-amber-700">Needs intervention</div>
              <div className="section-title mt-1">{snapshot.stuckLeads.length.toLocaleString('en-IN')} opportunities are stuck</div>
              <p className="mt-1 text-[12px] text-amber-800/80">Review the oldest stage age first instead of treating every pipeline card equally.</p>
            </div>
            <Link href="/opportunities?view=stuck" className="btn-secondary">
              Review stuck opportunities <ArrowRight size={13} />
            </Link>
          </div>
        </section>
      ) : null}

      <PipelineBoardStudio leads={snapshot.boardLeads} />
    </div>
  );
}

async function ActivitySurface({ params }: { params: Record<string, string | string[] | undefined> }) {
  const workspace = await getReEngagedWorkspace();
  const leads = workspace.leads;
  const activityView = parseActivityView(one(params.activity) || one(params.view));
  const selectedLeadId = one(params.lead);
  const selectedLead = selectedLeadId ? leads.find((lead) => lead.lead_id === selectedLeadId) ?? null : null;
  const visibleLeads = leads.filter((lead) => {
    if (activityView === 'reengaged') return Boolean(lead.is_reengaged);
    if (activityView === 'hot') return String(lead.behaviour_temperature || '').toLowerCase() === 'hot';
    if (activityView === 'high_intent') return toNumber(lead.high_intent_events_7d) > 0;
    return true;
  });
  const hot = leads.filter((lead) => String(lead.behaviour_temperature || '').toLowerCase() === 'hot');
  const reengaged = leads.filter((lead) => Boolean(lead.is_reengaged));
  const highIntent = leads.filter((lead) => toNumber(lead.high_intent_events_7d) > 0);
  const active7d = leads.filter((lead) => toNumber(lead.sessions_7d) > 0 || toNumber(lead.page_views_7d) > 0);

  return (
    <div className="space-y-4">
      {workspace.warning ? (
        <Notice tone="warning" title="Activity intelligence loaded with a compatibility path">
          {workspace.warning}
        </Notice>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active in 7 days" value={active7d.length} note="Recent website activity" />
        <Metric label="Hot" value={hot.length} note="Highest behaviour temperature" tone="priority" />
        <Metric label="Re-engaged" value={reengaged.length} note="Returned after becoming a lead" />
        <Metric label="High-intent activity" value={highIntent.length} note="Observed high-intent events" tone="priority" />
      </section>

      {workspace.distribution.length ? (
        <section className="rounded-panel border border-line bg-surface p-4 shadow-xs">
          <div>
            <div className="eyebrow">Conversion behaviour</div>
            <h2 className="section-title mt-1">How many visits happen before conversion?</h2>
            <p className="mt-1 text-[12px] text-copy-subtle">Observed visit distribution helps distinguish fast converters from longer research journeys.</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {workspace.distribution.map((row) => (
              <div key={row.visit_bucket} className="rounded-ui border border-line bg-surface-soft p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">{row.visit_bucket}</div>
                <div className="mt-2 text-[22px] font-semibold text-copy-strong">{toNumber(row.lead_count).toLocaleString('en-IN')}</div>
                <div className="mt-1 text-[11px] leading-5 text-copy-muted">Avg visit #{formatDecimal(row.avg_visit_number)} · {formatDecimal(row.avg_days_to_lead)} days to lead</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <nav className="flex flex-wrap gap-1 rounded-panel border border-line bg-surface p-1.5 shadow-xs" aria-label="Activity filters">
        <ActivityFilter id="all" active={activityView} label={`All active ${leads.length}`} />
        <ActivityFilter id="reengaged" active={activityView} label={`Re-engaged ${reengaged.length}`} />
        <ActivityFilter id="hot" active={activityView} label={`Hot ${hot.length}`} />
        <ActivityFilter id="high_intent" active={activityView} label={`High intent ${highIntent.length}`} />
      </nav>

      {selectedLead ? (
        <section className="rounded-panel border border-brand-100 bg-surface shadow-xs">
          <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="eyebrow">Selected opportunity journey</div>
              <h2 className="section-title mt-1">{selectedLead.lead_name || selectedLead.lead_code || 'Opportunity'}</h2>
              <p className="mt-1 text-[12px] text-copy-subtle">{opportunityStageLabel(selectedLead.current_stage)} · {pretty(selectedLead.behaviour_temperature || 'unknown')} · score {toNumber(selectedLead.engagement_score)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/conversations?lead=${encodeURIComponent(selectedLead.lead_id)}`} className="btn-secondary">Open conversation</Link>
              <Link href={`/leads/${selectedLead.lead_id}`} className="btn-primary">Open record</Link>
              <Link href={activityHref(activityView)} className="btn-secondary">Close</Link>
            </div>
          </div>
          <div className="p-4">
            <LeadJourneyIntelligence leadId={selectedLead.lead_id} />
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="eyebrow">Behaviour intelligence</div>
            <h2 className="section-title mt-1">Recently active opportunities</h2>
            <p className="mt-1 text-[12px] text-copy-subtle">Use activity as context for prioritisation; it does not replace stage, owner or conversation evidence.</p>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700">{visibleLeads.length.toLocaleString('en-IN')} shown</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-soft">
                <Header>Opportunity</Header>
                <Header>Stage</Header>
                <Header>Temperature</Header>
                <Header>Score</Header>
                <Header>7d visits</Header>
                <Header>7d pages</Header>
                <Header>Last source</Header>
                <Header>Signal</Header>
                <th className="w-40 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleLeads.slice(0, 75).map((lead) => <ActivityRow key={lead.lead_id} lead={lead} activeView={activityView} />)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

async function QualitySurface() {
  const leads = await getLeads();
  const qualityRows = leads
    .map((lead) => ({ lead, issues: qualityIssues(lead) }))
    .filter((row) => row.issues.length > 0);

  const missingOwner = qualityRows.filter((row) => row.issues.includes('Missing owner')).length;
  const missingContact = qualityRows.filter((row) => row.issues.includes('Missing contact')).length;
  const unknownSource = qualityRows.filter((row) => row.issues.includes('Unknown source')).length;
  const missingCourse = qualityRows.filter((row) => row.issues.includes('Missing course')).length;
  const knownCampaigns = leads.filter((lead) => lead.firstTouchCampaign && lead.firstTouchCampaign !== 'Unattributed').length;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Missing owner" value={missingOwner} note="Needs ownership" tone="attention" />
        <Metric label="Missing contact" value={missingContact} note="No phone or email" tone="attention" />
        <Metric label="Unknown source" value={unknownSource} note="Attribution evidence missing" />
        <Metric label="Missing course" value={missingCourse} note="Commercial context incomplete" />
      </section>

      <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="eyebrow">Opportunity hygiene</div>
            <h2 className="section-title mt-1">Records requiring validation</h2>
            <p className="mt-1 text-[12px] text-copy-subtle">Unknown values remain unknown until evidence exists. This view never auto-merges identities.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">{qualityRows.length.toLocaleString('en-IN')} records</span>
        </div>

        <div className="divide-y divide-line">
          {qualityRows.slice(0, 75).map(({ lead, issues }) => (
            <div key={lead.id} className="grid gap-3 px-5 py-3.5 hover:bg-surface-soft md:grid-cols-[minmax(220px,1fr)_140px_minmax(260px,1.3fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-copy-strong">{lead.name}</div>
                <div className="mt-0.5 text-[11px] text-copy-subtle">{lead.leadCode}</div>
              </div>
              <div className="text-[12px] font-medium text-copy-muted">{opportunityStageLabel(lead.stage)}</div>
              <div className="flex flex-wrap gap-1.5">
                {issues.map((issue) => (
                  <span key={issue} className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">{issue}</span>
                ))}
              </div>
              <Link href={`/leads/${lead.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-ui border border-line bg-surface px-2.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-50">
                Review <ArrowRight size={12} />
              </Link>
            </div>
          ))}

          {!qualityRows.length ? (
            <div className="flex items-center gap-3 px-5 py-8 text-[13px] text-copy-muted">
              <ShieldCheck size={18} className="text-emerald-600" />
              No validation gaps are visible in the accessible opportunity snapshot.
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-panel border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ui bg-amber-50 text-amber-700"><ShieldAlert size={17} /></span>
            <div>
              <div className="eyebrow">Identity integrity</div>
              <h2 className="section-title mt-1">Duplicate-review safeguards</h2>
              <p className="mt-2 text-[12px] leading-5 text-copy-muted">Similarity is a review signal, never proof that two records belong to the same person. Generic names, channels or similar course interests are not sufficient evidence for a merge.</p>
              <div className="mt-3 rounded-ui border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-[11px] font-medium text-amber-800">No automatic identity merge happens from this workspace.</div>
            </div>
          </div>
        </section>

        <section className="rounded-panel border border-line bg-surface p-5 shadow-xs">
          <div className="eyebrow">Attribution readiness</div>
          <h2 className="section-title mt-1">Evidence coverage</h2>
          <div className="mt-4 space-y-2.5">
            <Evidence label="CRM source label" value={`${leads.length - unknownSource} / ${leads.length} known`} />
            <Evidence label="Exact first-touch campaign" value={`${knownCampaigns} / ${leads.length} known`} />
            <Evidence label="Linked click / session lineage" value="Review tracking evidence" muted />
            <Evidence label="Consent & lawful join state" value="Not inferred here" muted />
          </div>
        </section>
      </div>
    </div>
  );
}

function OpportunityTabs({ active }: { active: Surface }) {
  const tabs = [
    { id: 'table' as const, label: 'Table', icon: ListFilter },
    { id: 'pipeline' as const, label: 'Pipeline', icon: Columns3 },
    { id: 'activity' as const, label: 'Activity', icon: Activity },
    { id: 'quality' as const, label: 'Data quality', icon: DatabaseZap },
  ];

  return (
    <nav className="flex flex-wrap gap-1 rounded-panel border border-line bg-surface p-1.5 shadow-xs" aria-label="Opportunity views">
      {tabs.map(({ id, label, icon: Icon }) => {
        const selected = active === id;
        return (
          <Link
            key={id}
            href={id === 'table' ? '/opportunities' : `/opportunities?surface=${id}`}
            aria-current={selected ? 'page' : undefined}
            className={`inline-flex min-h-9 items-center gap-2 rounded-ui px-3 text-[12px] font-semibold transition ${selected ? 'bg-brand-50 text-brand-700' : 'text-copy-muted hover:bg-surface-soft hover:text-copy-strong'}`}
          >
            <Icon size={14} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

function ActivityFilter({ id, active, label }: { id: ActivityView; active: ActivityView; label: string }) {
  const selected = id === active;
  return (
    <Link
      href={activityHref(id)}
      aria-current={selected ? 'page' : undefined}
      className={`inline-flex min-h-8 items-center rounded-ui px-3 text-[11px] font-semibold transition ${selected ? 'bg-brand-50 text-brand-700' : 'text-copy-muted hover:bg-surface-soft hover:text-copy-strong'}`}
    >
      {label}
    </Link>
  );
}

function Metric({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  note: string;
  tone?: 'neutral' | 'attention' | 'priority' | 'money';
}) {
  const icon = tone === 'attention'
    ? <AlertTriangle size={15} />
    : tone === 'priority'
      ? <Flame size={15} />
      : tone === 'money'
        ? <CircleDollarSign size={15} />
        : <UsersRound size={15} />;

  return (
    <div className="rounded-panel border border-line bg-surface p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3 text-copy-subtle">
        <span className="text-[11px] font-semibold">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-[26px] font-semibold tracking-tight text-copy-strong">{value.toLocaleString('en-IN')}</div>
      <div className="mt-1 text-[10px] leading-4 text-copy-subtle">{note}</div>
    </div>
  );
}

function ActivityRow({ lead, activeView }: { lead: JourneyLeadRow; activeView: ActivityView }) {
  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-soft/70">
      <td className="px-4 py-3.5">
        <div className="text-[12px] font-semibold text-copy-strong">{lead.lead_name || lead.lead_code || 'Lead'}</div>
        <div className="mt-0.5 text-[10px] text-copy-subtle">{lead.lead_code}</div>
      </td>
      <td className="px-4 py-3.5 text-[11px] text-copy-muted">{opportunityStageLabel(lead.current_stage)}</td>
      <td className="px-4 py-3.5"><Temperature value={lead.behaviour_temperature} /></td>
      <td className="px-4 py-3.5 text-[12px] font-semibold text-copy-strong">{toNumber(lead.engagement_score)}</td>
      <td className="px-4 py-3.5 text-[11px] text-copy-muted">{toNumber(lead.sessions_7d)}</td>
      <td className="px-4 py-3.5 text-[11px] text-copy-muted">{toNumber(lead.page_views_7d)}</td>
      <td className="px-4 py-3.5 text-[11px] text-copy-muted">{pretty(lead.last_session_source || 'Unknown')}</td>
      <td className="max-w-[300px] px-4 py-3.5 text-[11px] leading-5 text-copy-muted">{lead.behaviour_reason || 'No additional behavioural reason recorded.'}</td>
      <td className="px-4 py-3.5 text-right">
        <div className="flex justify-end gap-2">
          <Link href={`${activityHref(activeView)}&lead=${encodeURIComponent(lead.lead_id)}`} className="text-[11px] font-semibold text-brand-700 hover:underline">Journey</Link>
          <Link href={`/leads/${lead.lead_id}`} className="text-[11px] font-semibold text-copy-muted hover:text-brand-700">Open</Link>
        </div>
      </td>
    </tr>
  );
}

function Temperature({ value }: { value: string | null }) {
  const normalized = String(value || 'unknown').toLowerCase();
  const className = normalized === 'hot'
    ? 'bg-rose-50 text-rose-700'
    : normalized === 'warm'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-surface-soft text-copy-muted';

  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${className}`}>{pretty(normalized)}</span>;
}

function Evidence({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-ui border border-line bg-surface-soft px-3 py-2.5">
      <span className="text-[11px] text-copy-muted">{label}</span>
      <span className={`text-[10px] font-semibold ${muted ? 'text-copy-subtle' : 'text-copy-strong'}`}>{value}</span>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-[10px] font-semibold text-copy-subtle">{children}</th>;
}

function qualityIssues(lead: Awaited<ReturnType<typeof getLeads>>[number]) {
  const issues: string[] = [];
  if (!lead.owner || lead.owner === 'Unassigned') issues.push('Missing owner');
  if (!lead.email && !lead.phone) issues.push('Missing contact');
  if (!lead.firstTouchSource || lead.firstTouchSource === 'Unknown') issues.push('Unknown source');
  if (!lead.course || lead.course === 'Not selected') issues.push('Missing course');
  return issues;
}

function parseSurface(value: string): Surface {
  return value === 'pipeline' || value === 'activity' || value === 'quality' ? value : 'table';
}

function parseActivityView(value: string): ActivityView {
  return value === 'reengaged' || value === 'hot' || value === 'high_intent' ? value : 'all';
}

function activityHref(view: ActivityView) {
  return view === 'all' ? '/opportunities?surface=activity' : `/opportunities?surface=activity&activity=${view}`;
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDecimal(value: number | string | null | undefined) {
  return toNumber(value).toFixed(1);
}

function pretty(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
