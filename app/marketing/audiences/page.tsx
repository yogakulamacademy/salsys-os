import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleOff,
  Database,
  FlaskConical,
  Layers3,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';

import { createAdminClient } from '@/lib/supabase/admin';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';
import { executeAdActivationSimulationScenarios } from '@/lib/ad-activation/simulation-scenario-executor';

import styles from './audience-activation.module.css';

type AudienceDefinitionRow = {
  id: string;
  audience_key: string;
  name: string;
  description: string | null;
  status: string;
  rules: Record<string, unknown> | null;
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

type MembershipRow = {
  audience_id: string;
  status: string;
};

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

const blueprints = [
  {
    name: 'Mysore 200H high-intent prospects',
    description: 'People interested in Mysore 200H YTT who are not yet enrolled.',
    rule: 'Course interest = 200H · Location = Mysore · Stage ≠ Enrolled · Last interaction < 30 days',
    destinations: ['Meta Custom Audience', 'Google Customer Match'],
  },
  {
    name: 'Prenatal nurture audience',
    description: 'Prenatal leads who engaged but have not booked a course.',
    rule: 'Course interest = Prenatal · Stage ∈ Engaged/Qualified · Enrollment = None',
    destinations: ['Meta Custom Audience', 'Google Customer Match'],
  },
  {
    name: 'Alumni progression',
    description: 'Existing students eligible for a next-course or advanced-program message.',
    rule: 'Enrollment = Completed · Suppress current-course prospecting · Eligible for next program',
    destinations: ['Meta Custom Audience', 'Google Customer Match'],
  },
];

export default async function AudienceActivationPage() {
  const workspace = await requirePrivilegedWorkspaceAccess();
  const [data, simulation] = await Promise.all([
    loadWorkspace(workspace.organizationId),
    executeAdActivationSimulationScenarios(),
  ]);

  const activeAudiences = data.audiences.filter((audience) => audience.status === 'active').length;
  const activeMemberships = data.memberships.filter((membership) => membership.status === 'active').length;
  const connectedDestinations = data.destinations.filter((destination) => destination.status === 'active').length;
  const providerTransportEnabled = false;

  return (
    <div className={`${styles.page} space-y-5`}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className="eyebrow">Audience Intelligence</div>
          <h1 className={styles.title}>Multichannel audience activation</h1>
          <p className={styles.subtitle}>
            Turn SalsysOS Customer 360 signals into reusable Meta and Google audience definitions while keeping activation transport disabled until the data, privacy and provider layers are explicitly approved.
          </p>
          <div className={styles.heroBadges}>
            <StatusPill tone="violet" icon={<FlaskConical size={13} />} label="Simulation only" />
            <StatusPill tone="slate" icon={<LockKeyhole size={13} />} label="Live sync disabled" />
            <StatusPill tone={simulation.allPassed ? 'green' : 'amber'} icon={simulation.allPassed ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} label={`${simulation.passedScenarios}/${simulation.totalScenarios} simulations passed`} />
          </div>
        </div>

        <div className={styles.heroState}>
          <div className={styles.heroStateIcon}><ShieldCheck size={22} /></div>
          <div>
            <div className={styles.heroStateLabel}>Activation safety state</div>
            <div className={styles.heroStateValue}>Transport blocked by policy</div>
            <div className={styles.heroStateNote}>No provider uploads or audience mutations can be triggered from this workspace.</div>
          </div>
        </div>
      </section>

      {!data.available ? (
        <section className={styles.notice}>
          <Database size={19} />
          <div>
            <div className={styles.noticeTitle}>Audience data layer is not active in this environment yet.</div>
            <p>
              The workspace is rendering the approved Phase 7 blueprint and deterministic simulation evidence. Real audience counts and destination rows will appear automatically after the activation tables are intentionally migrated.
            </p>
            {data.loadError ? <div className={styles.noticeDetail}>{data.loadError}</div> : null}
          </div>
        </section>
      ) : null}

      <section className={styles.metrics}>
        <MetricCard icon={<Layers3 size={18} />} label="Audience definitions" value={data.audiences.length} sub={`${activeAudiences} active`} />
        <MetricCard icon={<UsersRound size={18} />} label="Active members" value={activeMemberships} sub="First-party qualified people" />
        <MetricCard icon={<RefreshCw size={18} />} label="Active destinations" value={connectedDestinations} sub="Meta + Google bindings" />
        <MetricCard icon={providerTransportEnabled ? <CheckCircle2 size={18} /> : <CircleOff size={18} />} label="Provider transport" value={providerTransportEnabled ? 'On' : 'Off'} sub="Hard-disabled in Phase 7C" />
      </section>

      <section className={styles.grid}>
        <div className={`card ${styles.panel}`}>
          <div className={styles.panelHeader}>
            <div>
              <div className="eyebrow">Audience library</div>
              <h2 className={styles.panelTitle}>Definitions & destination readiness</h2>
            </div>
            <span className={styles.readOnlyBadge}>Read-only</span>
          </div>

          {data.audiences.length ? (
            <div className={styles.audienceList}>
              {data.audiences.map((audience) => {
                const destinations = data.destinations.filter((destination) => destination.audience_id === audience.id);
                const members = data.memberships.filter((membership) => membership.audience_id === audience.id && membership.status === 'active').length;
                return (
                  <article key={audience.id} className={styles.audienceCard}>
                    <div className={styles.audienceTopline}>
                      <div>
                        <div className={styles.audienceName}>{audience.name}</div>
                        <div className={styles.audienceKey}>{audience.audience_key}</div>
                      </div>
                      <StatusPill tone={audience.status === 'active' ? 'green' : audience.status === 'paused' ? 'amber' : 'slate'} label={pretty(audience.status)} />
                    </div>
                    <p className={styles.audienceDescription}>{audience.description || 'No description provided.'}</p>
                    <div className={styles.audienceMeta}>
                      <span><UsersRound size={13} /> {members.toLocaleString()} active members</span>
                      <span><RefreshCw size={13} /> {destinations.length} destinations</span>
                      <span>Updated {formatDate(audience.updated_at)}</span>
                    </div>
                    <div className={styles.destinationRow}>
                      {destinations.length ? destinations.map((destination) => (
                        <span key={destination.id} className={styles.destinationChip}>
                          {destinationLabel(destination)} · {pretty(destination.status)}
                        </span>
                      )) : <span className={styles.mutedChip}>No destination configured</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        <div className={styles.sideStack}>
          <div className={`card ${styles.panel}`}>
            <div className={styles.panelHeader}>
              <div>
                <div className="eyebrow">Simulation evidence</div>
                <h2 className={styles.panelTitle}>Preflight scenarios</h2>
              </div>
              <FlaskConical size={18} className="text-brand-700" />
            </div>
            <div className={styles.simulationList}>
              {simulation.scenarios.map((scenario) => (
                <div key={scenario.fixture} className={styles.simulationItem}>
                  <span className={scenario.passed ? styles.passIcon : styles.warnIcon}>
                    {scenario.passed ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                  </span>
                  <div>
                    <div className={styles.simulationName}>{pretty(scenario.fixture)}</div>
                    <div className={styles.simulationDetail}>{pretty(scenario.expected.stage)} · {pretty(scenario.expected.reason)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`card ${styles.panel}`}>
            <div className={styles.panelHeader}>
              <div>
                <div className="eyebrow">Queue visibility</div>
                <h2 className={styles.panelTitle}>Activation health</h2>
              </div>
              <ShieldCheck size={18} className="text-brand-700" />
            </div>
            <div className={styles.healthGrid}>
              <SmallMetric label="Pending" value={safeNumber(data.health?.pending_deliveries)} />
              <SmallMetric label="Processing" value={safeNumber(data.health?.processing_deliveries)} />
              <SmallMetric label="Failed" value={safeNumber(data.health?.failed_deliveries)} warn={safeNumber(data.health?.failed_deliveries) > 0} />
              <SmallMetric label="Skipped" value={safeNumber(data.health?.skipped_deliveries)} />
            </div>
            <div className={styles.healthFooter}>
              Last delivered: {data.health?.last_delivered_at ? formatDate(data.health.last_delivered_at) : 'Never / transport disabled'}
            </div>
          </div>
        </div>
      </section>

      <section className={`card ${styles.panel}`}>
        <div className={styles.panelHeader}>
          <div>
            <div className="eyebrow">Rule blueprint</div>
            <h2 className={styles.panelTitle}>Recommended first audiences</h2>
            <p className={styles.panelSubtitle}>These are planning templates only. No rule creates or provider syncs are executed from this screen.</p>
          </div>
          <Sparkles size={19} className="text-brand-700" />
        </div>
        <div className={styles.blueprintGrid}>
          {blueprints.map((blueprint) => (
            <article key={blueprint.name} className={styles.blueprintCard}>
              <div className={styles.blueprintIcon}><Search size={16} /></div>
              <h3>{blueprint.name}</h3>
              <p>{blueprint.description}</p>
              <div className={styles.ruleBox}>{blueprint.rule}</div>
              <div className={styles.destinationRow}>
                {blueprint.destinations.map((destination) => <span key={destination} className={styles.destinationChip}>{destination}</span>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.footerSafety}>
        <LockKeyhole size={17} />
        <span>Next gate: explicit approval is still required before applying Phase 7 activation migrations or enabling any Meta/Google provider transport.</span>
        <ArrowRight size={15} />
      </section>
    </div>
  );
}

async function loadWorkspace(organizationId: string): Promise<WorkspaceData> {
  const admin = createAdminClient() as any;
  const [audiencesResult, destinationsResult, membershipsResult, healthResult] = await Promise.all([
    admin.from('ad_audience_definitions').select('id,audience_key,name,description,status,rules,updated_at').eq('organization_id', organizationId).order('updated_at', { ascending: false }),
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

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub: string }) {
  return (
    <article className={styles.metricCard}>
      <div className={styles.metricIcon}>{icon}</div>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className={styles.metricSub}>{sub}</div>
    </article>
  );
}

function SmallMetric({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`${styles.smallMetric} ${warn ? styles.smallMetricWarn : ''}`}>
      <div>{label}</div>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function StatusPill({ tone, label, icon }: { tone: 'green' | 'amber' | 'violet' | 'slate'; label: string; icon?: React.ReactNode }) {
  return <span className={`${styles.statusPill} ${styles[`tone${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>{icon}{label}</span>;
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <Layers3 size={26} />
      <div className={styles.emptyTitle}>No audience definitions available yet</div>
      <p>Use the rule blueprints below to plan the first activation audiences. Creation remains disabled in this phase.</p>
    </div>
  );
}

function destinationLabel(destination: DestinationRow) {
  const external = destination.external_audience_name?.trim();
  if (external) return external;
  if (destination.destination_kind === 'custom_audience') return 'Meta Custom Audience';
  if (destination.destination_kind === 'customer_match') return 'Google Customer Match';
  return pretty(destination.destination_kind);
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
