import Link from 'next/link';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, CheckCircle2, CircleDashed,
  Clock3, Database, History, Instagram, KeyRound, Layers3, MessageCircle,
  Settings2, ShieldCheck, Sparkles, Tags, UserCog, Webhook,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { CrmRuleEditor } from './crm-rule-editor';
import './crm-rules.css';
import { PageHeader } from '@/components/ui';
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

  const workspace = await getCurrentWorkspaceContext();
  const role = workspace.activeWorkspace?.role ?? null;
  const admin = role === 'owner' || role === 'admin';
  const alerts: { text:string; description:string; href:string }[] = [];
  if (source === 'unavailable') {
    alerts.push({
      text:'Review CRM settings read',
      description:'Forecast and aging rules could not be verified.',
      href:'/system-health',
    });
  } else if (source === 'database' && !agingReady) {
    alerts.push({text:'Review aging schema',description:'Aging rule storage could not be verified.',href:'/settings'});
  } else if (source === 'database' && agingReady && agingRows.length === 0) {
    alerts.push({text:'Review aging rules',description:'No aging thresholds are recorded for this workspace.',href:'/settings'});
  }
  if (providerVisibility.error && live) {
    alerts.push({text:'Review provider status',description:'Messaging connection visibility is unavailable.',href:'/settings/integrations'});
  } else if (live && whatsappConnection.status.includes('runtime unavailable')) {
    alerts.push({text:'Review WhatsApp runtime',description:'Provider connection exists but the runtime is not verified.',href:'/settings/integrations'});
  }
  const suggestions = source === 'unavailable' ? [
    'Review tenant settings read availability',
    'Confirm workspace selection and access',
  ] : [
    ...(source === 'database' && (!agingReady || agingRows.length === 0) ? ['Verify pipeline aging thresholds'] : []),
    ...(providerVisibility.error && live ? ['Investigate messaging provider visibility'] : []),
    ...(!canManage ? ['Request settings access from an administrator'] : []),
  ];
  const showAudit = !auditError && audit.length > 0;
  const savedKey = query.notice || 'loaded';

  return (
    <section className="cr space-y-4" aria-label="CRM Rules configuration">
      <PageHeader eyebrow="Configuration" title="CRM Rules"
        description="Manage your pipeline, forecast weights, aging thresholds and operational configuration."
      />
      {admin ? <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3" aria-label="Knowledge Builder shortcut">
        <div>
          <h2 className="text-sm font-semibold text-copy-strong">Knowledge Builder</h2>
          <p className="mt-1 text-xs text-copy-muted">Maintain website sources, discovery reviews and approved knowledge anytime, including after onboarding.</p>
        </div>
        <Link href="/settings/knowledge" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-copy-strong hover:border-line-strong">
          Open Knowledge Builder <ArrowRight size={14} />
        </Link>
      </section> : null}


      {query.notice ? <Notice tone="success" text={query.notice}/> : null}
      {query.error ? <Notice tone="error" text={query.error}/> : null}
      {settingsError ? <Notice tone="warning"
        text={'Live Settings data could not be verified: '+settingsError+'. Tenant forecast and aging values are hidden rather than replaced with defaults. Live forecast probabilities could not be verified, so no fallback values are presented as tenant configuration. Live pipeline-aging rules could not be verified. No thresholds are inferred from fallback defaults.'}/> : null}
      {providerVisibility.error && live ? <Notice tone="warning"
        text={'Provider visibility could not be verified: '+providerVisibility.error+'. Messaging connection state is shown as unavailable rather than guessed.'}/> : null}

      {alerts.length ? <section className="cr-attention cr-panel" aria-label="Settings needing attention">
        <span className="cr-attention-icon"><Sparkles size={22}/></span>
        <div className="cr-attention-summary">
          <strong>{alerts.length} setting{alerts.length === 1 ? '' : 's'} need attention</strong>
          <p>Review verified configuration gaps to keep your CRM reliable.</p>
        </div>
        <div className="cr-alert-list">{alerts.slice(0,2).map((alert,index)=>
          <div className="cr-alert-item" key={index}>
            <span className="cr-alert-mark"><AlertTriangle size={16}/></span>
            <div><strong>{alert.text}</strong><p>{alert.description}</p></div>
            {(admin || alert.href==='/settings')?<Link className="cr-btn cr-btn-muted" href={alert.href}>Review</Link>:null}
          </div>
        )}</div>
      </section> : null}

      <div className="cr-stats">
        <SummaryStat icon={<Database size={20}/>} label="CRM environment" value={live?'Production':useMockData?'Mock mode':'Setup required'}
          tone={live?'ok':'neutral'} detail={live?'Supabase persistence configured, not a live health check.':useMockData?'Reference records only. No live writes.':'Environment configuration unavailable.'}/>
        <SummaryStat icon={<BarChart3 size={20}/>} label="Pipeline stages"
          value={settingsAvailable?String(forecastRows.length):'—'} tone={source==='database'?'ok':'neutral'}
          detail={source==='database'?'Database-backed stage probabilities.':source==='reference'?'Reference defaults only · not tenant data':'Live stage settings unavailable.'}/>
        <SummaryStat icon={<Clock3 size={20}/>} label="Aging rules"
          value={settingsAvailable && agingReady?String(agingRows.length):'—'} tone={source==='database'&&agingReady?'ok':'neutral'}
          detail={source==='unavailable'?'Live aging settings unavailable.':agingReady?'Configured tenant thresholds.':'Aging schema needs review.'}/>
        <SummaryStat icon={<UserCog size={20}/>} label="Access model" value={canManage?'Can manage':'Read only'}
          tone={canManage?'ok':'neutral'} detail={canManage?'Owner / Admin / Manager permissions':'Settings writes require authorized tenant access.'}/>
      </div>

      <div className="cr-main">
        <CrmRuleEditor key={savedKey} forecasts={forecastRows}
          aging={agingRows} source={source} agingReady={agingReady} canManage={canManage}/>
        <section className="cr-panel cr-connections" aria-labelledby="cr-connections-heading">
          <div className="cr-panel-heading">
            <span className="cr-icon"><Webhook size={20}/></span>
            <div><h2 id="cr-connections-heading">Operational Connections</h2>
              <p>Environment, tracking and messaging capabilities.</p></div>
            {admin?<Link className="cr-head-link" href="/settings/integrations">Manage <ArrowRight size={14}/></Link>:null}
          </div>
          <div className="cr-connections-list">
            <OperationalConnection icon={<Database size={17}/>} title="Supabase"
              status={live?'Configured':configured?'Mock mode':'Setup required'} good={live}
              description="PostgreSQL CRM, RLS and persistent mutations."/>
            <OperationalConnection icon={<KeyRound size={17}/>} title="Supabase Auth"
              status={live?'Login enforced':'Not verified live'} good={live}
              description="Cookie-based server-side sessions."/>
            <OperationalConnection icon={<Webhook size={17}/>} title="Website Tracking API"
              status="Implemented · runtime unverified" good={false}
              description="UTMs, click IDs, sessions, CTA events and lead linking."/>
            <OperationalConnection icon={<MessageCircle size={17}/>} title="WhatsApp Cloud API"
              status={whatsappConnection.status} good={whatsappConnection.ready}
              href={admin?'/settings/integrations/whatsapp':undefined}
              description="Workspace-scoped inbound/outbound messages and templates."/>
            <OperationalConnection icon={<Instagram size={17}/>} title="Instagram Messaging API"
              status={instagramStatus} good={instagramReady}
              href={admin?'/settings/integrations':undefined}
              description="Workspace-scoped Instagram Direct messaging and automation eligibility"/>
          </div>
        </section>
      </div>

      <div className="cr-secondary">
        <section className="cr-panel cr-security">
          <div className="cr-panel-heading"><span className="cr-icon"><ShieldCheck size={20}/></span>
            <div><h2>Security & Governance</h2><p>Access, data protection and audited configuration.</p></div>
             {admin ? <Link className="cr-head-link" href="/settings/ai-insights">AI pilot status <ArrowRight size={14}/></Link> : null}
          </div>
          <div className="cr-security-grid">
            <SecurityRule icon={<KeyRound size={16}/>} title="Browser-safe configuration"
              detail="Only public Supabase configuration is exposed."/>
            <SecurityRule icon={<Database size={16}/>} title="Explicit grants (RLS)"
              detail="Protected CRM tables and authenticated access."/>
            <SecurityRule icon={<UserCog size={16}/>} title="Privileged settings"
              detail="Owner / Admin / Manager permissions; higher-risk administration is restricted."/>
            <SecurityRule icon={<History size={16}/>} title="Audited configuration"
              detail="Previous and new rule values are recorded with timestamps."/>
          </div>
        </section>
        <section className="cr-panel cr-suggestions">
          <div className="cr-panel-heading"><span className="cr-icon"><Sparkles size={20}/></span>
            <div><h2>Suggested next steps</h2><p>Based on verified workspace configuration.</p></div>
          </div>
          {suggestions.length ? <ul className="cr-checklist">
            {suggestions.map(item=><li key={item}><CircleDashed size={15}/>{item}</li>)}
          </ul> : <p className="cr-recommend-empty"><CheckCircle2 size={16}/> No verified configuration gaps are currently flagged. Continue periodic checks.</p>}
          {admin&&alerts.length?<Link className="cr-suggestions-link" href={alerts[0].href}>Review first issue <ArrowRight size={13}/></Link>:null}
        </section>
      </div>

      <section className="cr-panel cr-audit" id="audit-history">
        <div className="cr-panel-heading">
          <span className="cr-icon"><History size={20}/></span>
          <div><h2>Recent Changes / Audit</h2>
            <p>Previous values, new values, responsible users and timestamps.</p></div>
          {showAudit?<span className="cr-audit-count">Latest {audit.length} records</span>:null}
        </div>
        {auditError?<div className="cr-audit-error" role="alert">
          Settings audit could not be verified: {auditError}. This is not presented as an empty change history.
        </div>:showAudit?<div className="cr-audit-table-wrap">
          <table className="cr-audit-table">
            <thead><tr><th scope="col">Change</th><th scope="col">Area</th><th scope="col">Changed by</th><th scope="col">Time</th></tr></thead>
            <tbody>{audit.slice(0,5).map(row=><AuditEntry key={row.id} row={row}/>)}</tbody>
          </table>
          {audit.length > 5?<details className="cr-audit-more">
            <summary>View remaining {audit.length-5} audited changes <ArrowRight size={13}/></summary>
            <table className="cr-audit-table"><tbody>{audit.slice(5).map(row=><AuditEntry key={row.id} row={row}/>)}</tbody></table>
          </details>:null}
        </div>:<div className="cr-audit-empty">No Settings changes recorded yet.</div>}
      </section>
    </section>
  );
}

function SummaryStat({icon,label,value,detail,tone}:{
  icon:ReactNode;label:string;value:string;detail:string;tone:'ok'|'neutral';
}) {
  return <section className="cr-stat">
    <span className="cr-icon">{icon}</span>
    <div className="cr-stat-content">
      <div className="cr-stat-label">{label}<span className="cr-status-tag" data-tone={tone}>{tone==='ok'?'Configured':'Check status'}</span></div>
      <strong>{value}</strong><p>{detail}</p>
    </div>
  </section>;
}
function OperationalConnection({icon,title,description,status,good,href}:{
  icon:ReactNode;title:string;description:string;status:string;good:boolean;href?:string;
}) {
  const content=<>
    <span className="cr-icon">{icon}</span>
    <span className="cr-connection-body"><strong>{title}</strong><small>{description}</small></span>
    <span className="cr-connection-status" data-good={good?'true':'false'}>
      {good?<CheckCircle2 size={13}/>:<CircleDashed size={13}/>} {status}
    </span>
    {href?<ArrowRight size={15}/>:null}
  </>;
  return href?<Link href={href} className="cr-connection-row">{content}</Link>
    :<div className="cr-connection-row">{content}</div>;
}
function SecurityRule({icon,title,detail}:{icon:ReactNode;title:string;detail:string}) {
  return <div className="cr-security-rule"><span className="cr-icon">{icon}</span>
    <div><strong>{title}</strong><p>{detail}</p></div></div>;
}
function AuditEntry({row}:{row:AuditRow}) {
  return <tr><td><strong>{pretty(row.setting_key)}</strong><small>{auditChange(row)}</small></td>
    <td><span className="cr-group">{row.setting_group==='revenue_forecast'?'Forecast':row.setting_group==='pipeline_aging'?'Pipeline aging':pretty(row.setting_group)}</span></td>
    <td>{row.changed_by_name??'System / SQL'}</td>
    <td><time dateTime={row.changed_at}>{formatDateTime(row.changed_at)}</time></td></tr>;
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
