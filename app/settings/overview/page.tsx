import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  Activity, ArrowRight, BarChart3, BrainCircuit, Building2, CheckCircle2,
  ChevronRight, CircleAlert, Clock3, Database, FileImage, History,
  LayoutDashboard, Layers3, PlugZap, ShieldCheck, Sparkles, Target,
  UsersRound, Zap,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { getSupabasePublicConfig, useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import './workspace-settings.css';

type Stage = { name: string; weight: number | null };
type Aging = { name: string; warning: number | null; stuck: number | null };
type Change = { id: string; group: string; key: string; by: string | null; at: string };
type Source = 'loaded' | 'unavailable' | 'reference';
type Snapshot = {
  settings: Source; stages: Stage[]; aging: Aging[]; agingReady: boolean;
  auditState: Source; changes: Change[];
  connections: Source | 'restricted'; whatsapp: boolean | null; instagram: boolean | null;
};

const stageColors: Record<string, string> = {
  new:'#aeb5c5', contacted:'#64b5f6', engaged:'#7147f2',
  qualified:'#ffbf57', high_intent:'#ec7cc8', payment_pending:'#f8a04a',
  enrolled:'#20b56b', nurture:'#ac8aee', not_now:'#a8aab3',
  lost:'#eb728a', unqualified:'#a8aab3', duplicate:'#a8aab3',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function human(value: string): string {
  return value.replaceAll('_',' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
function hourText(value: number | null): string {
  if (value === null) return 'Not set';
  if (value > 0 && value % 24 === 0) {
    const days = value / 24;
    return String(days) + (days === 1 ? ' day' : ' days');
  }
  return String(value) + (value === 1 ? ' hour' : ' hours');
}
function dateText(value: string): string {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata',
  }).format(date) + ' IST';
}
function referenceSnapshot(admin: boolean): Snapshot {
  return {
    settings:'reference', stages:[], aging:[], agingReady:false,
    auditState:'reference', changes:[], connections:admin ? 'reference' : 'restricted',
    whatsapp:null, instagram:null,
  };
}
async function loadSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  live: boolean,
  admin: boolean,
): Promise<Snapshot> {
  if (!live) return referenceSnapshot(admin);
  // Only use the same tenant-bound, read-only RPCs as the existing Settings page.
  const [settingsRead, auditRead, providerRead] = await Promise.all([
    supabase.rpc('get_crm_stage_settings'),
    supabase.rpc('get_crm_settings_audit', { p_limit: 5 }),
    admin ? supabase.rpc('get_current_provider_visibility_v1') : Promise.resolve(null),
  ]);
  const data = settingsRead.error ? null : asRecord(settingsRead.data);
  const rawStages = data?.forecast_probabilities;
  const rawAging = data?.pipeline_aging;
  const settings: Source = Array.isArray(rawStages) && Array.isArray(rawAging)
    ? 'loaded' : 'unavailable';
  const stages: Stage[] = settings === 'loaded' && Array.isArray(rawStages)
    ? rawStages.flatMap((entry: unknown) => {
        const row = asRecord(entry);
        const name = asText(row?.stage);
        if (!name) return [];
        const weight = asNumber(row?.probability_percent);
        return [{ name, weight: weight !== null && weight <= 100 ? weight : null }];
      })
    : [];
  const aging: Aging[] = settings === 'loaded' && Array.isArray(rawAging)
    ? rawAging.flatMap((entry: unknown) => {
        const row = asRecord(entry);
        const name = asText(row?.stage);
        return name ? [{
          name, warning:asNumber(row?.warning_hours), stuck:asNumber(row?.stuck_hours),
        }] : [];
      })
    : [];
  const schema = asRecord(data?.pipeline_aging_schema);
  const agingReady = schema?.table_exists === true &&
    Boolean(asText(schema.stage_column) && asText(schema.warning_column) && asText(schema.stuck_column));

  const auditState: Source = !auditRead.error && Array.isArray(auditRead.data)
    ? 'loaded' : 'unavailable';
  const changes: Change[] = auditState === 'loaded' && Array.isArray(auditRead.data)
    ? auditRead.data.flatMap((entry: unknown) => {
        const row = asRecord(entry);
        const at = asText(row?.changed_at);
        if (!row || !at || !Number.isFinite(Date.parse(at))) return [];
        return [{
          id:asText(row.id) || at, group:asText(row.setting_group),
          key:asText(row.setting_key), by:asText(row.changed_by_name) || null, at,
        }];
      }).sort((a: Change,b: Change) => Date.parse(b.at) - Date.parse(a.at))
    : [];

  const provider = admin && providerRead && !providerRead.error
    ? asRecord(providerRead.data) : null;
  const providerAvailable = provider &&
    typeof provider.whatsapp_connected === 'boolean' &&
    typeof provider.instagram_connected === 'boolean';
  return {
    settings, stages, aging, agingReady, auditState, changes,
    connections: !admin ? 'restricted' : providerAvailable ? 'loaded' : 'unavailable',
    whatsapp: providerAvailable && provider ? provider.whatsapp_connected as boolean : null,
    instagram: providerAvailable && provider ? provider.instagram_connected as boolean : null,
  };
}

export default async function SettingsOverviewPage() {
  const supabase = await createClient();
  const { data:{ user }, error:authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');
  const workspace = await getCurrentWorkspaceContext(supabase);
  const role = workspace.activeWorkspace?.role ?? null;
  const admin = role === 'owner' || role === 'admin';
  const manager = role === 'manager';
  if (!admin && !manager) redirect('/dashboard?restricted=1');
  const platformAdmin = admin && workspace.activeWorkspace?.organizationSlug === 'salsysos';

  const { configured } = getSupabasePublicConfig();
  const live = configured && !useMockData;
  const mode = live ? 'Live mode' : useMockData ? 'Mock mode' : 'Setup required';
  const data = await loadSnapshot(supabase, live, admin);
  const linked = data.connections === 'loaded'
    ? Number(data.whatsapp === true) + Number(data.instagram === true) : null;

  const recommendation = data.settings === 'unavailable' ? {
    title:'Review your CRM configuration',
    detail:'The current stage and aging values could not be verified. Review the source before making changes.',
    href:'/settings', cta:'Review configuration',
  } : admin && data.connections === 'unavailable' ? {
    title:'Verify your messaging connections',
    detail:'Instagram and WhatsApp connection status could not be verified from the provider visibility read.',
    href:'/settings/integrations', cta:'Review integrations',
  } : data.settings === 'loaded' && (!data.agingReady || !data.aging.length) ? {
    title:'Review lead-aging settings',
    detail:'No usable aging rules are available in the current read. Review warning and stuck thresholds.',
    href:'/settings', cta:'Review aging rules',
  } : {
    title:'Keep CRM configuration up to date',
    detail:'Review planning weights, aging rules and audited changes whenever your admissions process changes.',
    href:'/settings', cta:'Open CRM Rules',
  };

  return (
    <section className="wso space-y-5" aria-label="Workspace settings overview">
      <PageHeader
        eyebrow="Settings"
        title="Workspace settings"
        description="Configure your CRM, team, integrations, AI knowledge and operational data from one focused workspace."
      />

      <div className="wso-top">
        <section className="wso-status" aria-label="Workspace configuration overview">
          <div className="wso-identity">
            <span className="wso-status-ring" aria-hidden="true"><ShieldCheck size={25}/></span>
            <div>
              <span className="wso-label">Environment</span>
              <strong>{mode}</strong>
              <p>Configuration mode, not a health percentage.</p>
              {admin ? <Link className="wso-text-link" href="/system-health">System health <ArrowRight size={13}/></Link> : null}
            </div>
          </div>
          <div className="wso-checks">
            <StatusLine label="CRM environment" value={mode} ok={live}/>
            <StatusLine label="Pipeline rules" value={data.settings === 'loaded' ? 'Verified read' : data.settings === 'reference' ? 'Reference mode' : 'Unavailable'} ok={data.settings === 'loaded'}/>
            {admin ? <StatusLine label="Messaging channels" value={linked === null ? 'Not verified' : String(linked) + ' / 2 linked'} ok={linked !== null}/> : null}
          </div>
          <div className="wso-glance">
            <div className="wso-glance-title"><Target size={18}/> Your setup at a glance</div>
            <div className="wso-metrics">
              <MiniMetric icon={<Layers3 size={18}/>} value={data.settings === 'loaded' ? String(data.stages.length) : '—'} label="Forecast stages"/>
              <MiniMetric icon={<Clock3 size={18}/>} value={data.settings === 'loaded' && data.agingReady ? String(data.aging.length) : '—'} label="Aging rules"/>
              <MiniMetric icon={<History size={18}/>} value={data.auditState === 'loaded' ? String(data.changes.length) : '—'} label="Audit entries" note="Last 5"/>
            </div>
          </div>
        </section>
        <section className="wso-copilot" aria-label="CRM Co-Pilot">
          <div className="wso-copilot-top">
            <Sparkles size={28}/>
            <div><h2>CRM Co-Pilot</h2><p>{admin
              ? 'Manage approved facts, policies and guidance for contextual sales assistance.'
              : 'Review your permission-bound CRM configuration and sales workflow.'}</p></div>
          </div>
          <Link href={admin ? '/settings/knowledge' : '/settings'}>
            {admin ? 'Manage AI Knowledge' : 'Open CRM Rules'} <ArrowRight size={15}/>
          </Link>
        </section>
      </div>

      <nav className="wso-nav" aria-label="Workspace settings sections">
        <Link href="/settings/overview" aria-current="page"><LayoutDashboard size={16}/> Overview</Link>
        <Link href="/settings"><Layers3 size={16}/> CRM Rules</Link>
        {admin ? <>
          <Link href="/settings/team"><UsersRound size={16}/> Team & Permissions</Link>
          <Link href="/settings/integrations"><PlugZap size={16}/> Integrations</Link>
          <Link href="/tracking"><Database size={16}/> Tracking & Data</Link>
          <Link href="/settings/assets"><FileImage size={16}/> Sales Assets</Link>
          <Link href="/settings/knowledge"><BrainCircuit size={16}/> AI Knowledge</Link>
        </> : null}
      </nav>

      <div className="wso-body">
        <section className="wso-card wso-crm" aria-labelledby="wso-crm-heading">
          <div className="wso-heading">
            <span><Layers3 size={20}/></span>
            <div><h2 id="wso-crm-heading">CRM Rules & Pipeline</h2>
              <p>How leads move, contribute to forecasts and get flagged when aging.</p></div>
            <Link href="/settings">Manage <ChevronRight size={17}/></Link>
          </div>
          <div className="wso-rules">
            <section className="wso-rule-panel" aria-labelledby="wso-stages-heading">
              <div className="wso-panel-title">
                <h3 id="wso-stages-heading">Pipeline stages</h3>
                <span>{data.settings === 'loaded' ? data.stages.length : '—'}</span>
              </div>
              <p className="wso-rule-help">Planning weights, not historical conversion rates.</p>
              {data.settings === 'loaded' && data.stages.length ? <>
                <ul className="wso-stage-list">
                  {data.stages.slice(0,6).map(stage => <li key={stage.name}>
                    <span className="wso-stage-name">
                      <i style={{ backgroundColor:stageColors[stage.name] || '#a5a4b1' }}/>
                      {human(stage.name)}
                    </span>
                    <strong>{stage.weight === null ? 'Not set' : String(stage.weight) + '%'}</strong>
                  </li>)}
                </ul>
                {data.stages.length > 6 ? <Link href="/settings" className="wso-more">+ {data.stages.length - 6} more stages <ArrowRight size={13}/></Link> : null}
              </> : <EmptyState subject="pipeline stages" source={data.settings}/>}
            </section>

            <section className="wso-rule-panel" aria-labelledby="wso-aging-heading">
              <div className="wso-panel-title">
                <h3 id="wso-aging-heading"><Clock3 size={16} className="inline-block"/> Aging rules</h3>
                <Link href="/settings">Edit <ArrowRight size={12} className="inline-block"/></Link>
              </div>
              <p className="wso-rule-help">Warn when a lead needs attention; flag when it is stuck.</p>
              {data.settings === 'loaded' && data.agingReady && data.aging.length ? <>
                <div className="wso-aging-list">
                  {data.aging.slice(0,3).map(rule => <div className="wso-aging-row" key={rule.name}>
                    <span className="wso-aging-icon"><Clock3 size={16}/></span>
                    <div><strong>{human(rule.name)}</strong>
                      <small>Warn after {hourText(rule.warning)} · Stuck after {hourText(rule.stuck)}</small></div>
                  </div>)}
                </div>
                {data.aging.length > 3 ? <Link href="/settings" className="wso-more">View all {data.aging.length} rules <ArrowRight size={13}/></Link> : null}
              </> : <EmptyState subject="aging rules" source={data.settings} detail={data.settings === 'loaded' && !data.agingReady ? 'Aging schema is not ready for the current workspace.' : undefined}/>}
            </section>
          </div>
        </section>

        <aside className="wso-aside" aria-label="Quick actions and recent settings changes">
          <section className="wso-card wso-side">
            <div className="wso-side-header"><Zap size={19}/><h2>Quick actions</h2></div>
            <QuickAction href="/settings" icon={<BarChart3 size={16}/>} text="Edit forecast planning weights"/>
            <QuickAction href="/settings" icon={<Clock3 size={16}/>} text="Update aging thresholds"/>
            {admin ? <>
              <QuickAction href="/settings/team" icon={<UsersRound size={16}/>} text="Manage team access"/>
              <QuickAction href="/settings/integrations" icon={<PlugZap size={16}/>} text="Review integrations"/>
            </> : <QuickAction href="/settings" icon={<ShieldCheck size={16}/>} text="Review CRM permissions"/>}
          </section>
          <section className="wso-card wso-side">
            <div className="wso-side-header">
              <History size={19}/><h2>Recent changes</h2>
              <Link href="/settings">View audit <ArrowRight size={12} className="inline-block"/></Link>
            </div>
            {data.auditState === 'loaded' && data.changes.length ? <ol className="wso-audit">
              {data.changes.slice(0,4).map(item => <li key={item.id}>
                <span className="wso-audit-dot" aria-hidden="true"/>
                <div>
                  <strong>{human(item.key || item.group || 'Settings updated')}</strong>
                  <small>{human(item.group) || 'Workspace settings'}{item.by ? ' · ' + item.by : ''}</small>
                  <time dateTime={item.at}>{dateText(item.at)}</time>
                </div>
              </li>)}
            </ol> : <EmptyState subject="audit changes" source={data.auditState}/>}
          </section>
        </aside>
      </div>

      <section className="wso-tip" aria-label="Configuration recommendation">
        <Sparkles size={24}/>
        <div className="wso-tip-content">
          <div className="wso-tip-heading"><h2>{recommendation.title}</h2><span className="wso-tip-label">Configuration guidance</span></div>
          <p>{recommendation.detail}</p>
        </div>
        <Link href={recommendation.href}>{recommendation.cta} <ArrowRight size={14}/></Link>
      </section>
      <div className="wso-footer">
        {admin ? <Link href="/system-health"><Activity size={15}/> System Health <ArrowRight size={13}/></Link> : null}
        {platformAdmin ? <Link href="/settings/organizations"><Building2 size={15}/> Customer Organizations <ArrowRight size={13}/></Link> : null}
        {manager ? <span><ShieldCheck size={15}/> Manager scope: CRM rules only. Administrative settings remain Owner/Admin restricted.</span> : null}
      </div>
    </section>
  );
}

function StatusLine({ label, value, ok }: { label:string; value:string; ok:boolean }) {
  return <div className="wso-check">
    {ok ? <CheckCircle2 size={16}/> : <CircleAlert size={16} className="wso-unknown"/>}
    <span>{label}</span><strong>{value}</strong>
  </div>;
}
function MiniMetric({ icon, value, label, note }: { icon:ReactNode; value:string; label:string; note?:string }) {
  return <div className="wso-metric">{icon}<strong>{value}</strong><span>{label}</span>{note ? <small>{note}</small> : null}</div>;
}
function QuickAction({ href, icon, text }: { href:string; icon:ReactNode; text:string }) {
  return <Link className="wso-action" href={href}><span className="wso-action-icon">{icon}</span><span>{text}</span><ChevronRight size={16}/></Link>;
}
function EmptyState({ subject, source, detail }: { subject:string; source:Source; detail?:string }) {
  const message = detail || (source === 'reference'
    ? 'No live tenant values in mock or setup mode.'
    : source === 'unavailable'
      ? 'The current workspace read is unavailable; values are not estimated.'
      : 'No ' + subject + ' were found in the loaded records.');
  return <div className="wso-placeholder">{message}</div>;
}
