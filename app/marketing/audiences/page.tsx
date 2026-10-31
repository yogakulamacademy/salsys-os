import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleOff,
  Database,
  Layers3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

import { AudienceRuleBuilderDrawer } from '@/components/marketing/audience-rule-builder-drawer';
import { findSafeAudiencePreviewRule, previewAudienceRule, SAFE_AUDIENCE_PREVIEW_RULES } from '@/lib/ad-activation/audience-rule-preview';
import { getLiveAudienceIntelligence, type LiveAudienceInsight } from '@/lib/marketing/live-audience-intelligence';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';
import { createAdminClient } from '@/lib/supabase/admin';

import styles from './audience-activation.module.css';
import liveStyles from './live-audience.module.css';

type AudienceDefinitionRow = {
  id: string;
  audience_key: string;
  name: string;
  description: string | null;
  status: string;
  updated_at: string | null;
};

type DestinationRow = {
  id: string;
  audience_id: string;
  destination_kind: string;
  external_audience_name: string | null;
  status: string;
  sync_mode: string;
  last_synced_at: string | null;
};

type MembershipRow = { audience_id: string; status: string };

type HealthRow = {
  active_destinations: number | string | null;
  active_memberships: number | string | null;
  pending_deliveries: number | string | null;
  processing_deliveries: number | string | null;
  failed_deliveries: number | string | null;
  skipped_deliveries: number | string | null;
  last_delivered_at: string | null;
  checked_at: string | null;
};

type WorkspaceData = {
  available: boolean;
  audiences: AudienceDefinitionRow[];
  destinations: DestinationRow[];
  memberships: MembershipRow[];
  health: HealthRow | null;
  loadError: string | null;
};

type PageParams = { preview?: string; segment?: string };

export default async function AudienceIntelligencePage({ searchParams }: { searchParams?: Promise<PageParams> }) {
  const workspace = await requirePrivilegedWorkspaceAccess();
  const params = (await searchParams) ?? {};
  const previewRule = findSafeAudiencePreviewRule(params.preview);

  const [activation, intelligence, rulePreview] = await Promise.all([
    loadWorkspace(workspace.organizationId),
    getLiveAudienceIntelligence(workspace.organizationId),
    previewAudienceRule({ organizationId: workspace.organizationId, rule: previewRule }),
  ]);

  const selectedSegment =
    intelligence.segments.find((segment) => segment.id === params.segment) ??
    intelligence.segments.find((segment) => segment.matchedPeople > 0) ??
    intelligence.segments[0];
  const highIntent = intelligence.segments.find((segment) => segment.id === 'high-intent-prospects');
  const connectedDestinations = activation.destinations.filter((destination) => destination.status === 'active').length;
  const providerTransportEnabled = false;

  return (
    <div className={`${styles.page} space-y-5`}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className="eyebrow">SalsysOS / Growth Operations</div>
          <h1 className={styles.title}>Audience Intelligence</h1>
          <p className={styles.subtitle}>
            Live first-party CRM segments that adapt as lead stage, course interest, location and engagement change. Use them to decide who deserves attention and what message fits next.
          </p>
          <div className={styles.heroBadges}>
            <StatusPill tone="green" icon={<CheckCircle2 size={13} />} label="Live CRM intelligence" />
            <StatusPill tone="violet" icon={<RefreshCw size={13} />} label={`${intelligence.segmentsWithDemand}/${intelligence.segments.length} active segments`} />
            <StatusPill tone="slate" icon={<LockKeyhole size={13} />} label="External sync off" />
          </div>
        </div>

        <div className={styles.heroState}>
          <div className={styles.heroStateIcon}><ShieldCheck size={22} /></div>
          <div>
            <div className={styles.heroStateLabel}>Operating state</div>
            <div className={styles.heroStateValue}>Intelligence live · activation controlled</div>
            <div className={styles.heroStateNote}>CRM signals are evaluated now. Meta/Google exports remain blocked until the separate activation gate is explicitly approved.</div>
          </div>
        </div>
      </section>

      <section className={styles.metrics}>
        <MetricCard icon={<Layers3 size={18} />} label="Adaptive segments" value={intelligence.segmentsWithDemand} sub={`${intelligence.segments.length} monitored from live CRM`} />
        <MetricCard icon={<UsersRound size={18} />} label="High-intent people" value={highIntent?.matchedPeople ?? 0} sub="Qualified / high-intent / payment-pending" />
        <MetricCard icon={<ShieldCheck size={18} />} label="Review-ready" value={intelligence.reviewReadySegments} sub="Identity quality strong enough for review" />
        <MetricCard icon={providerTransportEnabled ? <CheckCircle2 size={18} /> : <CircleOff size={18} />} label="External activation" value={providerTransportEnabled ? 'On' : 'Off'} sub={`${connectedDestinations} active destinations configured`} />
      </section>

      <section className={`card ${styles.panel}`}>
        <div className={styles.panelHeader}>
          <div>
            <div className="eyebrow">Live adaptive audiences</div>
            <h2 className={styles.panelTitle}>Who deserves attention right now</h2>
            <p className={styles.panelSubtitle}>Counts are recalculated from current CRM state on every request. No membership or provider write is required to produce this intelligence.</p>
          </div>
          <span className={styles.readOnlyBadge}>Live · read-only</span>
        </div>

        <div style={{ padding: 16 }}>
          <div className={liveStyles.liveHeader}>
            <div>
              <h2>Adaptive segment monitor</h2>
              <p>Use the cards to move from a broad audience signal into the current source, course, location and stage mix.</p>
            </div>
            <div className={liveStyles.liveStamp}>Evaluated {formatTime(intelligence.generatedAt)}</div>
          </div>

          <div className={liveStyles.segmentGrid}>
            {intelligence.segments.map((segment) => (
              <SegmentCard key={segment.id} segment={segment} active={segment.id === selectedSegment.id} />
            ))}
          </div>

          <div className={liveStyles.detailGrid}>
            <section className={liveStyles.detailPanel}>
              <div className={liveStyles.detailHead}>
                <div className="eyebrow">Selected audience</div>
                <h3>{selectedSegment.name}</h3>
              </div>
              <div className={liveStyles.detailSummary}>
                <DetailMetric label="People" value={selectedSegment.matchedPeople} />
                <DetailMetric label="Lead opportunities" value={selectedSegment.matchedLeads} />
                <DetailMetric label="Identity coverage" value={`${selectedSegment.identityCoveragePct}%`} />
              </div>
              <div className={liveStyles.breakdowns}>
                <Breakdown title="Stage" rows={selectedSegment.breakdowns.stage} />
                <Breakdown title="Intent" rows={selectedSegment.breakdowns.intent} />
                <Breakdown title="Course" rows={selectedSegment.breakdowns.course} />
                <Breakdown title="Location" rows={selectedSegment.breakdowns.location} />
                <Breakdown title="Source" rows={selectedSegment.breakdowns.source} />
              </div>
            </section>

            <aside className={liveStyles.actionPanel}>
              <div className={liveStyles.actionHead}>
                <div className="eyebrow">Recommended next move</div>
                <h3>Act on the signal, not just the count</h3>
              </div>
              <div className={liveStyles.actionBody}>
                <p>{selectedSegment.recommendation}</p>
                <div className={liveStyles.actionFacts}>
                  <ActionFact label="Readiness" value={selectedSegment.readinessLabel} />
                  <ActionFact label="Top source" value={selectedSegment.topSource || 'Unknown'} />
                  <ActionFact label="Top course" value={selectedSegment.topCourse || 'No course'} />
                  <ActionFact label="Top location" value={selectedSegment.topLocation || 'No location'} />
                  <ActionFact label="Trend" value="History not collected yet" />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className={styles.previewPanel}>
        <div className={styles.previewHeader}>
          <div>
            <div className="eyebrow">Custom audience explorer</div>
            <h2 className={styles.panelTitle}>Explore a safe custom segment</h2>
            <p className={styles.previewIntro}>Use first-party CRM dimensions to investigate another audience. Results remain aggregate-only: no email, phone or person list is returned and no audience membership is written.</p>
          </div>
          <StatusPill tone="green" icon={<ShieldCheck size={13} />} label="0 writes" />
        </div>

        <div className={styles.ruleTabs}>
          {SAFE_AUDIENCE_PREVIEW_RULES.map((rule) => (
            <a key={rule.id} href={`/marketing/audiences?preview=${encodeURIComponent(rule.id)}&segment=${encodeURIComponent(selectedSegment.id)}`} className={rule.id === previewRule.id ? styles.ruleTabActive : styles.ruleTab}>
              {rule.name}
            </a>
          ))}
        </div>

        <AudienceRuleBuilderDrawer />

        {rulePreview.sensitiveRuleRejected ? (
          <div className={styles.previewRejected}>
            <AlertTriangle size={18} />
            <div><strong>Preview blocked.</strong><span>SalsysOS does not build audiences from pregnancy, medical or other sensitive health-related rules.</span></div>
          </div>
        ) : (
          <div className={styles.previewBody}>
            <div className={styles.previewMetrics}>
              <PreviewMetric label="Matched people" value={rulePreview.matchedPeople} note="Canonical Customer 360 people" />
              <PreviewMetric label="Matched leads" value={rulePreview.matchedLeads} note="Lead opportunities meeting the rule" />
              <PreviewMetric label="Identity unlinked" value={rulePreview.identityUnlinkedLeads} note="Leads not yet stitched to a Person" />
            </div>
            {rulePreview.dataTruncated ? <div className={styles.previewWarning}><AlertTriangle size={15} /> Preview hit the 20,000-row safety ceiling; counts may be understated.</div> : null}
            <div className={styles.breakdownGrid}>
              <Breakdown title="Stage" rows={rulePreview.breakdowns.stage} />
              <Breakdown title="Intent" rows={rulePreview.breakdowns.intent} />
              <Breakdown title="Course" rows={rulePreview.breakdowns.course} />
              <Breakdown title="Location" rows={rulePreview.breakdowns.location} />
              <Breakdown title="Acquisition source" rows={rulePreview.breakdowns.source} />
            </div>
          </div>
        )}
      </section>

      <section className={styles.grid}>
        <section className={`card ${styles.panel}`}>
          <div className={styles.panelHeader}>
            <div>
              <div className="eyebrow">Activation readiness</div>
              <h2 className={styles.panelTitle}>Destinations & persisted audiences</h2>
              <p className={styles.panelSubtitle}>Live intelligence works independently of external sync. These rows show only the activation layer that has actually been configured.</p>
            </div>
            <StatusPill tone={providerTransportEnabled ? 'green' : 'slate'} label={providerTransportEnabled ? 'Transport on' : 'Transport off'} />
          </div>

          {!activation.available ? (
            <div className={styles.notice} style={{ margin: 14 }}>
              <Database size={19} />
              <div><div className={styles.noticeTitle}>Activation data unavailable.</div><p>{activation.loadError || 'The audience intelligence layer remains available from CRM data.'}</p></div>
            </div>
          ) : activation.audiences.length ? (
            <div className={styles.audienceList}>
              {activation.audiences.map((audience) => {
                const destinations = activation.destinations.filter((destination) => destination.audience_id === audience.id);
                const members = activation.memberships.filter((membership) => membership.audience_id === audience.id && membership.status === 'active').length;
                return (
                  <article key={audience.id} className={styles.audienceCard}>
                    <div className={styles.audienceTopline}>
                      <div><div className={styles.audienceName}>{audience.name}</div><div className={styles.audienceKey}>{audience.audience_key}</div></div>
                      <StatusPill tone={audience.status === 'active' ? 'green' : audience.status === 'paused' ? 'amber' : 'slate'} label={pretty(audience.status)} />
                    </div>
                    <p className={styles.audienceDescription}>{audience.description || 'No description provided.'}</p>
                    <div className={styles.audienceMeta}>
                      <span><UsersRound size={13} /> {members.toLocaleString()} persisted members</span>
                      <span><RefreshCw size={13} /> {destinations.length} destinations</span>
                      <span>Updated {formatDate(audience.updated_at)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}><Layers3 size={26} /><div className={styles.emptyTitle}>No persisted activation audiences yet</div><p>That is okay. Live CRM intelligence above works without writing memberships or sending data to an ad platform.</p></div>
          )}
        </section>

        <aside className={styles.sideStack}>
          <section className={`card ${styles.panel}`}>
            <div className={styles.panelHeader}>
              <div><div className="eyebrow">Identity quality</div><h2 className={styles.panelTitle}>Where activation would need cleanup</h2></div>
            </div>
            <div className={styles.healthGrid}>
              <SmallMetric label="Segments with gaps" value={intelligence.identityGapSegments} warn={intelligence.identityGapSegments > 0} />
              <SmallMetric label="Review-ready" value={intelligence.reviewReadySegments} />
              <SmallMetric label="Active destinations" value={connectedDestinations} />
              <SmallMetric label="Failed deliveries" value={safeNumber(activation.health?.failed_deliveries)} warn={safeNumber(activation.health?.failed_deliveries) > 0} />
            </div>
          </section>

          <section className={styles.footerSafety}>
            <LockKeyhole size={17} />
            <span>Intelligence is live from CRM data. Privacy checks and explicit activation approval remain required before any Meta/Google audience export.</span>
            <ArrowRight size={15} />
          </section>
        </aside>
      </section>
    </div>
  );
}

function SegmentCard({ segment, active }: { segment: LiveAudienceInsight; active: boolean }) {
  const readinessClass = segment.readiness === 'review_ready'
    ? liveStyles.readiness
    : segment.readiness === 'identity_gap'
      ? liveStyles.readinessWarn
      : liveStyles.readinessEmpty;

  return (
    <a href={`/marketing/audiences?segment=${encodeURIComponent(segment.id)}`} className={active ? liveStyles.segmentCardActive : liveStyles.segmentCard}>
      <div className={liveStyles.segmentTop}>
        <div className={liveStyles.segmentName}>{segment.name}</div>
        <span className={readinessClass}>{segment.readinessLabel}</span>
      </div>
      <div className={liveStyles.segmentCount}>{segment.matchedPeople.toLocaleString()}<span>people</span></div>
      <div className={liveStyles.segmentDescription}>{segment.description}</div>
      <div className={liveStyles.segmentSignals}>
        <Signal label="Source" value={segment.topSource || 'Unknown'} />
        <Signal label="Stage" value={segment.topStage || 'None'} />
        <Signal label="Course" value={segment.topCourse || 'No course'} />
        <Signal label="Location" value={segment.topLocation || 'No location'} />
      </div>
      <div className={liveStyles.segmentFooter}><span>{segment.matchedLeads.toLocaleString()} lead opportunities</span><span>{segment.identityCoveragePct}% identity linked</span></div>
    </a>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return <div className={liveStyles.signal}><span>{label}</span><strong title={value}>{pretty(value)}</strong></div>;
}

function DetailMetric({ label, value }: { label: string; value: string | number }) {
  return <div className={liveStyles.detailMetric}><span>{label}</span><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong></div>;
}

function ActionFact({ label, value }: { label: string; value: string }) {
  return <div className={liveStyles.actionFact}><span>{label}</span><strong>{pretty(value)}</strong></div>;
}

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub: string }) {
  return <article className={styles.metricCard}><div className={styles.metricIcon}>{icon}</div><div className={styles.metricLabel}>{label}</div><div className={styles.metricValue}>{typeof value === 'number' ? value.toLocaleString() : value}</div><div className={styles.metricSub}>{sub}</div></article>;
}

function SmallMetric({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return <div className={`${styles.smallMetric} ${warn ? styles.smallMetricWarn : ''}`}><div>{label}</div><strong>{value.toLocaleString()}</strong></div>;
}

function PreviewMetric({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className={styles.previewMetric}><div className={styles.previewMetricLabel}>{label}</div><div className={styles.previewMetricValue}>{value.toLocaleString()}</div><div className={styles.previewMetricNote}>{note}</div></div>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return <div className={styles.breakdownCard}><div className={styles.breakdownTitle}>{title}</div>{rows.length ? <div className={styles.breakdownRows}>{rows.map((row) => <div key={row.label} className={styles.breakdownRow}><div className={styles.breakdownLabel}><span>{pretty(row.label)}</span><strong>{row.count.toLocaleString()}</strong></div><div className={styles.breakdownTrack}><span style={{ width: `${Math.max(5, Math.round((row.count / max) * 100))}%` }} /></div></div>)}</div> : <div className={styles.emptyBreakdown}>No matches</div>}</div>;
}

function StatusPill({ tone, label, icon }: { tone: 'green' | 'amber' | 'violet' | 'slate'; label: string; icon?: React.ReactNode }) {
  return <span className={`${styles.statusPill} ${styles[`tone${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>{icon}{label}</span>;
}

async function loadWorkspace(organizationId: string): Promise<WorkspaceData> {
  const admin = createAdminClient() as any;
  const [audiencesResult, destinationsResult, membershipsResult, healthResult] = await Promise.all([
    admin.from('ad_audience_definitions').select('id,audience_key,name,description,status,updated_at').eq('organization_id', organizationId).order('updated_at', { ascending: false }),
    admin.from('ad_audience_destinations').select('id,audience_id,destination_kind,external_audience_name,status,sync_mode,last_synced_at').eq('organization_id', organizationId).order('updated_at', { ascending: false }),
    admin.from('ad_audience_memberships').select('audience_id,status').eq('organization_id', organizationId),
    admin.from('v_ad_activation_health_v1').select('*').eq('organization_id', organizationId).maybeSingle(),
  ]);
  const errors = [audiencesResult.error, destinationsResult.error, membershipsResult.error, healthResult.error].filter(Boolean);
  const available = errors.length === 0;
  return {
    available,
    audiences: available ? ((audiencesResult.data ?? []) as AudienceDefinitionRow[]) : [],
    destinations: available ? ((destinationsResult.data ?? []) as DestinationRow[]) : [],
    memberships: available ? ((membershipsResult.data ?? []) as MembershipRow[]) : [],
    health: available ? ((healthResult.data ?? null) as HealthRow | null) : null,
    loadError: errors.length ? errors.map((error: { message: string }) => error.message).join(' · ') : null,
  };
}

function safeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'now';
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(date);
}
