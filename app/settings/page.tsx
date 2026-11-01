import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Database,
  History,
  Instagram,
  KeyRound,
  MessageCircle,
  Save,
  Settings2,
  ShieldCheck,
  Tags,
  UserCog,
  Webhook,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  updateForecastProbabilityAction,
  updatePipelineAgingRuleAction,
} from '@/app/settings/actions';
import { PageHeader, StatCard } from '@/components/ui';
import { getSupabasePublicConfig, useMockData } from '@/lib/config';
import { getWhatsAppRuntimeForOrganization } from '@/lib/integrations/whatsapp-connection';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type ForecastSetting = {
  stage: string;
  probability: number;
  probability_percent: number;
  updated_at?: string | null;
};

type AgingSetting = {
  stage: string;
  warning_hours: number;
  stuck_hours: number;
};

type AgingSchema = {
  table_exists?: boolean;
  stage_column?: string | null;
  warning_column?: string | null;
  stuck_column?: string | null;
  warning_unit?: string | null;
  stuck_unit?: string | null;
};

type SettingsPayload = {
  forecast_probabilities: ForecastSetting[];
  pipeline_aging: AgingSetting[];
  pipeline_aging_schema: AgingSchema;
  permissions: { can_manage: boolean };
};

type AuditRow = {
  id: string;
  setting_group: string;
  setting_key: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
};

type SettingsSource = 'database' | 'reference' | 'unavailable';

type LoadedSettings = {
  settings: SettingsPayload;
  audit: AuditRow[];
  source: SettingsSource;
  settingsError: string | null;
  auditError: string | null;
};

type ProviderVisibilityState = {
  available: boolean;
  instagramConnected: boolean;
  whatsappConnected: boolean;
  error: string | null;
};

type WhatsAppConnectionState = {
  ready: boolean;
  status: string;
};

const fallbackProbabilities: ForecastSetting[] = [
  { stage: 'new', probability: 0.1, probability_percent: 10 },
  { stage: 'contacted', probability: 0.2, probability_percent: 20 },
  { stage: 'engaged', probability: 0.35, probability_percent: 35 },
  { stage: 'qualified', probability: 0.5, probability_percent: 50 },
  { stage: 'high_intent', probability: 0.7, probability_percent: 70 },
  { stage: 'payment_pending', probability: 0.9, probability_percent: 90 },
  { stage: 'enrolled', probability: 1, probability_percent: 100 },
  { stage: 'nurture', probability: 0.1, probability_percent: 10 },
  { stage: 'not_now', probability: 0.05, probability_percent: 5 },
  { stage: 'lost', probability: 0, probability_percent: 0 },
  { stage: 'unqualified', probability: 0, probability_percent: 0 },
  { stage: 'duplicate', probability: 0, probability_percent: 0 },
];

const fallbackSettings: SettingsPayload = {
  forecast_probabilities: fallbackProbabilities,
  pipeline_aging: [],
  pipeline_aging_schema: { table_exists: false },
  permissions: { can_manage: false },
};

const unavailableSettings: SettingsPayload = {
  forecast_probabilities: [],
  pipeline_aging: [],
  pipeline_aging_schema: { table_exists: false },
  permissions: { can_manage: false },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const { configured } = getSupabasePublicConfig();
  const live = !useMockData && configured;

  const [loaded, providerVisibility] = await Promise.all([
    loadSettings(live),
    loadProviderVisibility(live),
  ]);
  const whatsappConnection = await loadWhatsAppConnectionState(
    live,
    providerVisibility,
  );

  const { settings, audit, source, settingsError, auditError } = loaded;
  const canManage = source === 'database' && (settings.permissions?.can_manage ?? false);
  const forecastRows = settings.forecast_probabilities ?? [];
  const agingRows = settings.pipeline_aging ?? [];
  const settingsAvailable = source !== 'unavailable';
  const agingReady = Boolean(
    settings.pipeline_aging_schema?.table_exists &&
      settings.pipeline_aging_schema?.stage_column &&
      settings.pipeline_aging_schema?.warning_column &&
      settings.pipeline_aging_schema?.stuck_column,
  );

  const instagramStatus = !live
    ? 'Unavailable in mock mode'
    : !providerVisibility.available
      ? 'Status unavailable'
      : providerVisibility.instagramConnected
        ? 'Connected'
        : 'Not connected';
  const instagramReady =
    live && providerVisibility.available && providerVisibility.instagramConnected;

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings & integrations"
        description="Manage the CRM rules that directly affect forecasting and pipeline operations, while keeping environment and integration configuration visible without exposing secrets."
      />

      {query.notice ? (
        <Notice tone="success" text={query.notice} />
      ) : null}
      {query.error ? <Notice tone="error" text={query.error} /> : null}
      {settingsError ? (
        <Notice
          tone="warning"
          text={`Live Settings data could not be verified: ${settingsError}. Tenant forecast and aging values are hidden rather than replaced with defaults.`}
        />
      ) : null}
      {providerVisibility.error && live ? (
        <Notice
          tone="warning"
          text={`Provider visibility could not be verified: ${providerVisibility.error}. Messaging connection state is shown as unavailable rather than guessed.`}
        />
      ) : null}

      <div className="settings-stat-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="CRM environment"
          value={live ? 'Live' : configured ? 'Mock' : 'Setup'}
          note={
            live
              ? 'Supabase persistence active'
              : useMockData
                ? 'Mock dataset is active'
                : 'Environment values required'
          }
          icon={<Database size={18} />}
        />
        <StatCard
          label="Forecast stages"
          value={settingsAvailable ? forecastRows.length.toLocaleString() : '—'}
          note={
            source === 'database'
              ? 'Database-backed stage probabilities'
              : source === 'reference'
                ? 'Reference defaults only · not tenant data'
                : 'Live stage settings unavailable'
          }
          icon={<BarChart3 size={18} />}
        />
        <StatCard
          label="Aging rules"
          value={settingsAvailable ? agingRows.length.toLocaleString() : '—'}
          note={
            source === 'unavailable'
              ? 'Live aging settings unavailable'
              : agingReady
                ? 'Pipeline thresholds detected'
                : source === 'reference'
                  ? 'Not available in reference mode'
                  : 'Schema needs review'
          }
          icon={<Clock3 size={18} />}
        />
        <StatCard
          label="Settings access"
          value={canManage ? 'Manage' : 'Read only'}
          note={canManage ? 'Owner / Admin / Manager permissions' : 'Changes are restricted'}
          icon={<UserCog size={18} />}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.08fr_.92fr]">
        <section className="settings-config-card settings-forecast-card card overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow">Revenue forecast</div>
                <div className="section-title mt-1">Stage probabilities</div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  These probabilities are configuration values used by the weighted Revenue Forecast. They are not historical conversion-rate claims.
                </p>
                {source === 'reference' ? (
                  <p className="mt-2 text-xs font-semibold text-amber-700">
                    Reference defaults are shown because mock/setup mode is active. They are not saved tenant settings.
                  </p>
                ) : null}
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                <BarChart3 size={18} />
              </span>
            </div>
          </div>

          {source === 'unavailable' ? (
            <UnavailableBlock text="Live forecast probabilities could not be verified, so no fallback values are presented as tenant configuration." />
          ) : (
            <div className="divide-y divide-slate-100">
              {forecastRows.length ? (
                forecastRows.map((row) => (
                  <form
                    key={row.stage}
                    action={updateForecastProbabilityAction}
                    className="settings-forecast-row grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_150px_auto] md:items-center"
                  >
                    <input type="hidden" name="stage" value={row.stage} />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{pretty(row.stage)}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {source === 'database'
                          ? 'Weighted pipeline value uses this configured probability.'
                          : 'Reference default only; saving is disabled.'}
                      </div>
                    </div>
                    <label className="relative">
                      <input
                        name="probability_percent"
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        defaultValue={cleanNumber(row.probability_percent)}
                        disabled={!canManage}
                        className="input w-full pr-9 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">%</span>
                    </label>
                    <button type="submit" disabled={!canManage} className="btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-40">
                      <Save size={14} /> Save
                    </button>
                  </form>
                ))
              ) : (
                <UnavailableBlock text="No forecast-stage configuration is recorded for this workspace." />
              )}
            </div>
          )}
        </section>

        <section className="settings-config-card settings-aging-card card overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow">Pipeline</div>
                <div className="section-title mt-1">Aging thresholds</div>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Set when a lead should become a warning and when it should be considered stuck in its current stage.
                </p>
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <Clock3 size={18} />
              </span>
            </div>
            {agingReady ? (
              <div className="settings-schema-note mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-5 text-slate-500">
                UI unit: hours · Database warning unit: {settings.pipeline_aging_schema.warning_unit ?? 'detected automatically'} · Database stuck unit: {settings.pipeline_aging_schema.stuck_unit ?? 'detected automatically'}
              </div>
            ) : null}
          </div>

          {source === 'unavailable' ? (
            <UnavailableBlock text="Live pipeline-aging rules could not be verified. No thresholds are inferred from fallback defaults." />
          ) : !agingReady ? (
            <div className="p-5">
              <div className="settings-aging-warning rounded-xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800"><AlertTriangle size={16} /> Aging schema not detected</div>
                <p className="mt-2 text-xs leading-5 text-amber-700">
                  Pipeline data has not been changed. Aging controls remain unavailable until the working schema can be verified.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {agingRows.map((row) => (
                <form key={row.stage} action={updatePipelineAgingRuleAction} className="settings-aging-row px-5 py-4">
                  <input type="hidden" name="stage" value={row.stage} />
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{pretty(row.stage)}</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{formatHours(row.warning_hours)} warning · {formatHours(row.stuck_hours)} stuck</div>
                    </div>
                    <button type="submit" disabled={!canManage} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-40"><Save size={14} /> Save</button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField label="Warning after" name="warning_hours" value={row.warning_hours} disabled={!canManage} />
                    <NumberField label="Stuck after" name="stuck_hours" value={row.stuck_hours} disabled={!canManage} />
                  </div>
                </form>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="settings-integration-card card-pad">
          <div className="eyebrow">Core</div>
          <div className="section-title mt-1">Environment</div>
          <div className="mt-5 space-y-3">
            <Integration icon={<Database size={18} />} name="Supabase" status={live ? 'Live' : configured ? 'Configured · mock mode' : 'Needs environment values'} ready={live} detail="PostgreSQL CRM, RLS and persistent mutations" />
            <Integration icon={<KeyRound size={18} />} name="Supabase Auth" status={live ? 'Login enforced' : 'Bypassed in mock mode'} ready={live} detail="Cookie-based server-side sessions" />
            <Integration icon={<Tags size={18} />} name="Mock dataset" status={useMockData ? 'Active' : 'Disabled'} ready={!useMockData} detail="Fictional records are isolated from live CRM operations" />
            <Integration icon={<Webhook size={18} />} name="Website tracking API" status="Implemented" ready detail="UTMs, click IDs, sessions, CTA events and lead linking" />
          </div>
        </section>

        <section className="settings-integration-card card-pad">
          <div className="eyebrow">Channels</div>
          <div className="section-title mt-1">Messaging</div>
          <div className="mt-5 space-y-3">
            <Integration icon={<MessageCircle size={18} />} name="WhatsApp Cloud API" status={whatsappConnection.status} ready={whatsappConnection.ready} detail="Workspace-scoped inbound messages, outbound replies, templates and delivery/read status" />
            <Integration icon={<Instagram size={18} />} name="Instagram Messaging API" status={instagramStatus} ready={instagramReady} detail="Workspace-scoped Instagram Direct messaging and automation eligibility" />
          </div>
        </section>
      </div>

      <section className="settings-audit-card card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Change history</div>
            <div className="section-title mt-1">Settings audit</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">Forecast and pipeline-rule changes are recorded so operational changes can be traced later.</p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><History size={18} /></span>
        </div>

        {auditError ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            Settings audit could not be verified: {auditError}. This is not presented as an empty change history.
          </div>
        ) : (
          <div className="settings-table-wrap mt-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="settings-audit-table min-w-[760px] w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] uppercase tracking-[.1em] text-slate-400">
                  <th className="px-4 py-3">Setting</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Change</th><th className="px-4 py-3">Changed by</th><th className="px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {audit.length ? audit.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-700">{row.setting_group === 'revenue_forecast' ? 'Forecast probability' : row.setting_group === 'pipeline_aging' ? 'Pipeline aging' : pretty(row.setting_group)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{pretty(row.setting_key)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{auditChange(row)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{row.changed_by_name ?? 'System / SQL'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(row.changed_at)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No Settings changes recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="settings-security-card card-pad mt-4">
        <div className="eyebrow">Security</div>
        <div className="section-title mt-1">Implementation rules</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Rule icon={<ShieldCheck size={16} />} title="No privileged key in browser" text="Only browser-safe Supabase configuration is exposed. Service-role credentials and integration secrets stay server-side." />
          <Rule icon={<Database size={16} />} title="RLS + explicit grants" text="CRM tables remain protected by database policies and authenticated access rules." />
          <Rule icon={<Settings2 size={16} />} title="Privileged settings" text="Settings routes require Owner, Admin or Manager access; higher-risk team and provider administration remains Owner/Admin only." />
          <Rule icon={<Activity size={16} />} title="Audited configuration" text="Forecast and aging mutations record previous value, new value, user and timestamp." />
        </div>
      </section>
    </>
  );
}

async function loadSettings(live: boolean): Promise<LoadedSettings> {
  if (!live) {
    return {
      settings: fallbackSettings,
      audit: [],
      source: 'reference',
      settingsError: null,
      auditError: null,
    };
  }

  const supabase = await createClient();
  const [settingsResult, auditResult] = await Promise.all([
    supabase.rpc('get_crm_stage_settings'),
    supabase.rpc('get_crm_settings_audit', { p_limit: 30 }),
  ]);

  if (settingsResult.error) {
    return {
      settings: unavailableSettings,
      audit: [],
      source: 'unavailable',
      settingsError: settingsResult.error.message,
      auditError: auditResult.error?.message ?? null,
    };
  }

  return {
    settings: normalizeSettings(settingsResult.data),
    audit: auditResult.error ? [] : normalizeAudit(auditResult.data),
    source: 'database',
    settingsError: null,
    auditError: auditResult.error?.message ?? null,
  };
}

async function loadProviderVisibility(live: boolean): Promise<ProviderVisibilityState> {
  if (!live) {
    return { available: false, instagramConnected: false, whatsappConnected: false, error: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_current_provider_visibility_v1');
  if (error) {
    return { available: false, instagramConnected: false, whatsappConnected: false, error: error.message };
  }

  const row = isRecord(data) ? data : {};
  return {
    available: true,
    instagramConnected: row.instagram_connected === true,
    whatsappConnected: row.whatsapp_connected === true,
    error: null,
  };
}

async function loadWhatsAppConnectionState(
  live: boolean,
  visibility: ProviderVisibilityState,
): Promise<WhatsAppConnectionState> {
  if (!live) return { ready: false, status: 'Unavailable in mock mode' };

  try {
    const workspace = await getCurrentWorkspaceContext();
    if (!workspace.activeOrganizationId) {
      return {
        ready: false,
        status: workspace.selectionRequired ? 'Select a workspace' : 'No active workspace',
      };
    }

    const runtime = await getWhatsAppRuntimeForOrganization(workspace.activeOrganizationId);
    return {
      ready: true,
      status: runtime.displayPhoneNumber ? `Connected · ${runtime.displayPhoneNumber}` : 'Connected',
    };
  } catch {
    if (!visibility.available) return { ready: false, status: 'Status unavailable' };
    if (visibility.whatsappConnected) return { ready: false, status: 'Connected · runtime unavailable' };
    return { ready: false, status: 'Not connected' };
  }
}

function normalizeSettings(value: unknown): SettingsPayload {
  if (!isRecord(value)) return unavailableSettings;

  const probabilities = Array.isArray(value.forecast_probabilities)
    ? value.forecast_probabilities
        .filter(isRecord)
        .map((row): ForecastSetting => ({
          stage: String(row.stage ?? ''),
          probability: safeNumber(row.probability),
          probability_percent: safeNumber(row.probability_percent),
          updated_at: row.updated_at ? String(row.updated_at) : null,
        }))
        .filter((row) => Boolean(row.stage))
    : [];

  const aging = Array.isArray(value.pipeline_aging)
    ? value.pipeline_aging
        .filter(isRecord)
        .map((row): AgingSetting => ({
          stage: String(row.stage ?? ''),
          warning_hours: safeNumber(row.warning_hours),
          stuck_hours: safeNumber(row.stuck_hours),
        }))
        .filter((row) => Boolean(row.stage))
    : [];

  const schema = isRecord(value.pipeline_aging_schema)
    ? {
        table_exists: Boolean(value.pipeline_aging_schema.table_exists),
        stage_column: nullableString(value.pipeline_aging_schema.stage_column),
        warning_column: nullableString(value.pipeline_aging_schema.warning_column),
        stuck_column: nullableString(value.pipeline_aging_schema.stuck_column),
        warning_unit: nullableString(value.pipeline_aging_schema.warning_unit),
        stuck_unit: nullableString(value.pipeline_aging_schema.stuck_unit),
      }
    : { table_exists: false };

  const permissions = isRecord(value.permissions)
    ? { can_manage: Boolean(value.permissions.can_manage) }
    : { can_manage: false };

  return {
    forecast_probabilities: probabilities,
    pipeline_aging: aging,
    pipeline_aging_schema: schema,
    permissions,
  };
}

function normalizeAudit(value: unknown): AuditRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((row) => ({
    id: String(row.id ?? ''),
    setting_group: String(row.setting_group ?? ''),
    setting_key: String(row.setting_key ?? ''),
    previous_value: isRecord(row.previous_value) ? row.previous_value : null,
    new_value: isRecord(row.new_value) ? row.new_value : null,
    changed_by: row.changed_by ? String(row.changed_by) : null,
    changed_by_name: row.changed_by_name ? String(row.changed_by_name) : null,
    changed_at: String(row.changed_at ?? ''),
  }));
}

function Notice({ tone, text }: { tone: 'success' | 'error' | 'warning'; text: string }) {
  const classes = tone === 'success'
    ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
    : tone === 'error'
      ? 'border-rose-100 bg-rose-50 text-rose-800'
      : 'border-amber-100 bg-amber-50 text-amber-800';
  const Icon = tone === 'success' ? CheckCircle2 : AlertTriangle;
  return <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${classes}`}><Icon size={17} className="mt-0.5 shrink-0" /><span>{text}</span></div>;
}

function UnavailableBlock({ text }: { text: string }) {
  return <div className="p-5"><div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-500">{text}</div></div>;
}

function NumberField({ label, name, value, disabled }: { label: string; name: string; value: number; disabled: boolean }) {
  return (
    <label>
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">{label}</span>
      <div className="relative">
        <input type="number" name={name} min="0" step="0.5" defaultValue={cleanNumber(value)} disabled={disabled} className="input w-full pr-16 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">hours</span>
      </div>
    </label>
  );
}

function Integration({ icon, name, status, ready, detail }: { icon: ReactNode; name: string; status: string; ready: boolean; detail: string }) {
  return (
    <div className="settings-integration-row flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-brand">{icon}</div>
      <div className="min-w-0 flex-1"><div className="font-semibold text-slate-800">{name}</div><div className="mt-0.5 text-xs leading-5 text-slate-400">{detail}</div></div>
      <div className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold ${ready ? 'text-emerald-600' : 'text-slate-400'}`}>
        {ready ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}{status}
      </div>
    </div>
  );
}

function Rule({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="settings-rule rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><span className="text-brand">{icon}</span>{title}</div><p className="mt-1.5 text-xs leading-5 text-slate-500">{text}</p></div>;
}

function auditChange(row: AuditRow) {
  if (row.setting_group === 'revenue_forecast') {
    return `${cleanNumber(safeNumber(row.previous_value?.probability) * 100)}% → ${cleanNumber(safeNumber(row.new_value?.probability) * 100)}%`;
  }
  if (row.setting_group === 'pipeline_aging') {
    return `Warning ${formatHours(safeNumber(row.new_value?.warning_hours))} · Stuck ${formatHours(safeNumber(row.new_value?.stuck_hours))}`;
  }
  return 'Updated';
}

function formatHours(value: number) {
  const hours = safeNumber(value);
  if (hours > 0 && hours % 24 === 0) {
    const days = hours / 24;
    return `${cleanNumber(days)} ${days === 1 ? 'day' : 'days'}`;
  }
  return `${cleanNumber(hours)} ${hours === 1 ? 'hour' : 'hours'}`;
}

function cleanNumber(value: number) {
  const safe = safeNumber(value);
  return Number.isInteger(safe) ? String(safe) : String(Number(safe.toFixed(2)));
}

function safeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function pretty(value: string) {
  if (!value) return 'Unknown';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}
