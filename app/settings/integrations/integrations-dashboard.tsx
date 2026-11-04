import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2,
  CircleDashed, Clock3, Database, ExternalLink, Facebook, Globe2, Instagram,
  KeyRound, Layers3, Link2, MessageCircle, Plus, RefreshCw, Settings2,
  ShieldCheck, Sparkles, Unplug, WandSparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { IntegrationConnectButton } from '@/components/integration-connect-button';
import { GoogleIntegrationAssets } from '@/components/google-integration-assets';
import { MetaIntegrationAssets } from '@/components/meta-integration-assets';
import { WhatsAppRemoveButton } from '@/components/whatsapp-remove-button';
import { InstagramHistorySyncControl } from '@/components/instagram-history-sync-control';
import type { IntegrationConnection, IntegrationAsset, IntegrationProvider, IntegrationStatus } from '@/lib/integrations/types';
import { disconnectIntegrationAction } from './actions';
import { ProviderBrand } from './provider-brand';

export type SafeIntegrationConnection = Pick<IntegrationConnection,
  'id' | 'provider' | 'status' | 'account_name' | 'account_email' |
  'last_verified_at' | 'last_error' | 'connected_at' | 'updated_at' | 'scopes'>;

export const INTEGRATION_PROVIDERS: { id: IntegrationProvider; name: string; description: string; icon: ReactNode; features: string[] }[] = [
  { id:'google', name:'Google', description:'Analytics · Search Console · Google Ads', icon:<ProviderBrand provider="google"/>,
    features:['Google Analytics 4','Search Console','Google Ads'] },
  { id:'meta', name:'Meta', description:'Business Portfolio · Pages · Meta Ads', icon:<ProviderBrand provider="meta"/>,
    features:['Business assets','Ad accounts','Facebook Pages'] },
  { id:'instagram', name:'Instagram', description:'Professional account · Direct messages', icon:<ProviderBrand provider="instagram"/>,
    features:['Instagram authorization','Messaging permissions','Lead conversations'] },
  { id:'whatsapp', name:'WhatsApp Business', description:'Cloud API · business messaging', icon:<ProviderBrand provider="whatsapp"/>,
    features:['Business Account','Phone number','Messaging setup'] },
];

const modules: Partial<Record<IntegrationProvider, Record<string, string>>> = {
  google:{ga4_property:'Google Analytics 4',search_console_site:'Search Console',google_ads_customer:'Google Ads'},
  meta:{meta_business:'Business',meta_ad_account:'Meta Ads',facebook_page:'Facebook Page',instagram_account:'Instagram assets'},
  whatsapp:{whatsapp_business_account:'Business Account',whatsapp_phone_number:'Phone number'},
};

export function activeProviderConnection(connections: SafeIntegrationConnection[], provider: IntegrationProvider) {
  return connections.find(row=>row.provider===provider && row.status==='connected') ??
    connections.find(row=>row.provider===provider && !['disconnected','revoked'].includes(row.status)) ?? null;
}
function previousConnection(connections: SafeIntegrationConnection[], provider: IntegrationProvider) {
  return connections.find(row=>row.provider===provider && ['disconnected','revoked'].includes(row.status)) ?? null;
}
function formatTimestamp(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not verified';
  return new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value))+' IST';
}
function connectionStatus(status: IntegrationStatus | null) {
  return status==='connected' ? 'Connected' : status==='expired' ? 'Expired' : status==='error' ? 'Needs attention' :
    status==='pending' ? 'Pending authorization' : 'Not connected';
}
function providerManageHref(provider: IntegrationProvider) {
  return provider==='whatsapp' ? '/settings/integrations/whatsapp' :
    provider==='google' ? '#ai-google-assets' :
    provider==='meta' ? '#ai-meta-assets' : '/settings/integrations/connect?provider=instagram';
}
function safeModuleState(provider: IntegrationProvider, assets: IntegrationAsset[], feature: string, connected: boolean) {
  if (!connected) return 'Not configured';
  const types = modules[provider] || {};
  const matching = Object.entries(types).filter(([,label])=>label===feature).map(([type])=>type);
  if (!matching.length) return 'Check permissions';
  return assets.some(asset=>matching.includes(asset.asset_type) && asset.is_selected) ? 'Selected' : 'Not selected';
}

export async function IntegrationsDashboard({ connections, assets, installed, error, encryptionConfigured, notice, actionError, instagramHistorySyncEnabled }:{
  connections:SafeIntegrationConnection[]; assets:IntegrationAsset[]; installed:boolean;
  error:string|null; encryptionConfigured:boolean; notice?:string; actionError?:string;
  instagramHistorySyncEnabled: boolean;
}) {
  const readable = installed && !error;
  const current = INTEGRATION_PROVIDERS.map(item=>({ ...item, connection:activeProviderConnection(connections,item.id) }));
  const connectedCount = readable ? current.filter(x=>x.connection?.status==='connected').length : null;
  const needsAttention = readable ? current.filter(x=>['error','expired'].includes(x.connection?.status||'') || Boolean(x.connection?.last_error)).length : null;
  const selectedCount = readable ? assets.filter(asset=>asset.is_selected &&
    current.some(p=>p.connection?.status==='connected' && p.connection.id===asset.connection_id)).length : null;
  const noneConnected = readable && current.every(x=>!x.connection || ['disconnected','revoked'].includes(x.connection.status));
  const activeRows = readable ? current.filter(x=>x.connection) : [];
  const google = current.find(x=>x.id==='google')?.connection;
  const meta = current.find(x=>x.id==='meta')?.connection;

  return <section className="aiu space-y-5" aria-label="Account integrations">
    <PageHeader eyebrow="Settings" title="Account Integrations"
      description="Connect business accounts to manage CRM leads, conversations, advertising and website activity."
      actions={<div className="aiu-heading-actions">
        <details className="aiu-setup-guide">
          <summary><WandSparkles size={16}/> Setup guide</summary>
          <div className="aiu-guide-content">
            <h3>Account connection checklist</h3>
            <p>Choose a provider, authorize access, then select eligible assets where supported. SalsysOS keeps each connection scoped to the active workspace.</p>
            <Link href="/settings/integrations/connect">Choose an integration <ArrowRight size={13}/></Link>
          </div>
        </details>
        <Link href="/settings/overview" className="aiu-secondary"><ArrowLeft size={15}/> Back to Settings</Link>
      </div>}
    />

    {notice ? <div className="aiu-success-note" role="status">{notice}</div> : null}
    {actionError ? <div className="aiu-error-note" role="alert">{actionError}</div> : null}
    {!installed ? <div className="aiu-error-note" role="alert">Integration database setup is unavailable. Foundation migrations are required before connecting accounts.</div> : null}
    {error && installed ? <div className="aiu-error-note" role="alert">Unable to load connected accounts. Connection counts are unavailable. {error}</div> : null}

    <section className="aiu-health aiu-panel" aria-label="Integration health">
      <div className="aiu-health-label">
        <span className="aiu-icon"><Link2 size={21}/></span>
        <span><strong>Integration Health</strong><small>Authorized accounts and available configuration evidence</small></span>
      </div>
      <div className="aiu-health-score">
        <span className="aiu-gauge" aria-label="Health percentage unavailable">—</span>
        <small>No verified health score</small>
      </div>
      <HealthStat icon={<CheckCircle2 size={20}/>} label="Connected" value={connectedCount===null?'—':String(connectedCount)} tone="success"/>
      <HealthStat icon={<RefreshCw size={20}/>} label="Syncing" value="—" note="Not monitored"/>
      <HealthStat icon={<AlertTriangle size={20}/>} label="Needs attention" value={needsAttention===null?'—':String(needsAttention)} tone={needsAttention?'warning':undefined}/>
      <HealthStat icon={<Layers3 size={20}/>} label="Records synced" value="—" note="Not verified"/>
    </section>

    <div className="aiu-section-heading">
      <div><Link2 size={20}/><h2>Connected Accounts</h2></div>
      <Link href="/settings/integrations/connect" className="aiu-secondary"><Plus size={15}/> Connect Account</Link>
    </div>

    {!readable
      ? <div className="aiu-panel aiu-blank"><CircleDashed size={37}/><h3>Connection status unavailable</h3>
        <p>Accounts are not shown as disconnected until the workspace read succeeds.</p></div>
      : noneConnected
        ? <div className="aiu-panel aiu-empty-connected">
          <div className="aiu-empty-graphic" aria-hidden="true">
            <span className="aiu-empty-orbit"><Globe2 size={24}/></span>
            <span className="aiu-empty-orbit"><Facebook size={24}/></span>
            <span className="aiu-empty-center"><Link2 size={43}/></span>
            <span className="aiu-empty-orbit"><Instagram size={24}/></span>
            <span className="aiu-empty-orbit"><MessageCircle size={24}/></span>
          </div>
          <div className="aiu-empty-description">
            <h3>No accounts connected yet</h3>
            <p>Connect Google, Meta, Instagram or WhatsApp Business to authorize your tools for this workspace.</p>
            <Link className="aiu-primary" href="/settings/integrations/connect"><Plus size={16}/> Connect Your First Account</Link>
          </div>
        </div>
        : <div className="aiu-account-grid">
          {current.map(definition=>{
            const {connection} = definition;
            const connected=connection?.status==='connected';
            const historical=previousConnection(connections,definition.id);
            const providerAssets=assets.filter(asset=>connection && asset.connection_id===connection.id);
            return <article key={definition.id} className="aiu-panel aiu-provider-card" data-provider={definition.id}>
              <div className="aiu-provider-heading">
                <span className="aiu-provider-icon">{definition.icon}</span>
                <div><h3>{definition.name}</h3><p>{definition.description}</p></div>
                <span className={'aiu-status '+(connected?'aiu-connected':connection && ['expired','error'].includes(connection.status)?'aiu-problem':'aiu-inactive')}>
                  {connectionStatus(connection?.status||null)}
                </span>
              </div>
              <div className="aiu-module-list">
                {definition.features.map(feature=><div key={feature}><CheckCircle2 size={14} className={connected?'aiu-module-icon':'aiu-module-muted'}/>
                  <span>{feature}</span>
                  <small>{safeModuleState(definition.id,providerAssets,feature,connected)}</small></div>)}
              </div>
              {connection ? <div className="aiu-provider-meta">
                <span className="aiu-truncate" title={connection.account_name||connection.account_email||''}>{connection.account_name || connection.account_email || 'Connected account'}</span>
                <span>Verified: {formatTimestamp(connection.last_verified_at)}</span>
              </div> : historical ? <p className="aiu-historical">Previous account removed. Its CRM history is preserved.</p> : null}
              {connection?.last_error ? <p className="aiu-provider-warning">Provider reported a connection issue. Review authorization and assets.</p> : null}
              <div className="aiu-provider-actions">
                {connected ? <>
                  <Link className="aiu-secondary" href={providerManageHref(definition.id)}><Settings2 size={14}/> Manage</Link>
                  {definition.id==='whatsapp' ? <WhatsAppRemoveButton connectionId={connection!.id} displayPhoneNumber={connection!.account_name}/> :
                    <IntegrationConnectButton provider={definition.id as 'google'|'meta'|'instagram'} mode="reconnect"/>}
                </> : <Link className="aiu-primary" href={'/settings/integrations/connect?provider='+definition.id}>Connect {definition.name} <ArrowRight size={13}/></Link>}
              </div>
              {connected && definition.id==='instagram' && connection ?
                <InstagramHistorySyncControl connectionId={connection.id} enabled={instagramHistorySyncEnabled}/> : null}
              {connection && definition.id!=='whatsapp' ? <details className="aiu-remove-area">
                <summary>Connection options</summary>
                <p>Removing credentials keeps historical CRM data. This must be done before changing to a different account.</p>
                <form action={disconnectIntegrationAction}>
                  <input type="hidden" name="connection_id" value={connection.id}/>
                  <button type="submit" className="aiu-danger"><Unplug size={13}/> Remove connection</button>
                </form>
              </details> : null}
            </article>;
          })}
        </div>}

    {readable && google?.status==='connected' ? <div id="ai-google-assets" className="aiu-asset-area">
      <GoogleIntegrationAssets connectionId={google.id} assets={assets.filter(asset=>asset.connection_id===google.id)}/>
    </div> : null}
    {readable && meta?.status==='connected' ? <div id="ai-meta-assets" className="aiu-asset-area">
      <MetaIntegrationAssets connectionId={meta.id} assets={assets.filter(asset=>asset.connection_id===meta.id)}/>
    </div> : null}

    <div className="aiu-lower-grid">
      <section className="aiu-panel aiu-lower-card" aria-labelledby="ai-sync-heading">
        <div className="aiu-subheading"><span className="aiu-icon"><Layers3 size={20}/></span><div><h2 id="ai-sync-heading">Data & Sync Settings</h2><p>Review how connected assets are selected for CRM use.</p></div></div>
        {!readable ? <EmptyCard icon={<CircleDashed size={29}/>} title="Sync setup unavailable" detail="The integration database could not be read."/>
          : noneConnected ? <EmptyCard icon={<Settings2 size={29}/>} title="Set up your data sync" detail="Connect an account before configuring eligible assets and tracking."/>
          : <div className="aiu-mini-settings">
              <SettingShortcut icon={<Clock3 size={18}/>} title="Sync frequency" detail="Managed by connected services" href={null}/>
              <SettingShortcut icon={<Database size={18}/>} title="Asset mapping" detail={selectedCount===null?'Unavailable':selectedCount+' selected asset(s)'} href={google?.status==='connected'?'#ai-google-assets':meta?.status==='connected'?'#ai-meta-assets':'/settings/integrations/connect'}/>
              <SettingShortcut icon={<BarChart3 size={18}/>} title="Lead source tracking" detail="Review capture and attribution" href="/tracking"/>
            </div>}
      </section>
      <section className="aiu-panel aiu-lower-card" aria-labelledby="ai-insights-heading">
        <div className="aiu-subheading"><span className="aiu-icon"><BarChart3 size={20}/></span><div><h2 id="ai-insights-heading">Integration Insights</h2><p>Only verified integration evidence is shown.</p></div></div>
        {!readable ? <EmptyCard icon={<CircleDashed size={29}/>} title="Integration data unavailable" detail="A read error prevents accurate reporting."/>
          : noneConnected ? <EmptyCard icon={<BarChart3 size={29}/>} title="No integration data yet" detail="Connect an account to begin collecting supported data."/>
          : <div className="aiu-insight-evidence">
              <div><strong>{connectedCount}</strong><span>Connected providers</span></div>
              <div><strong>{selectedCount}</strong><span>Selected assets</span></div>
              <p>30-day synced leads, messages and advertising totals are not available from this connection inventory. They are not estimated.</p>
            </div>}
      </section>
    </div>
    <div className="aiu-lower-grid aiu-last-grid">
      <section className="aiu-panel aiu-lower-card">
        <div className="aiu-subheading"><span className="aiu-icon"><ShieldCheck size={20}/></span><div><h2>Security & Access</h2><p>Connection credentials and access boundaries.</p></div></div>
        <div className="aiu-security-grid">
          <SecurityItem icon={<KeyRound size={15}/>} text="Credential protection" state={encryptionConfigured?'Configured':'Setup required'}/>
          <SecurityItem icon={<ShieldCheck size={15}/>} text="Tenant isolation" state="Tenant scoped"/>
          <SecurityItem icon={<Layers3 size={15}/>} text="Provider credentials" state="Server managed"/>
          <SecurityItem icon={<Activity size={15}/>} text="Sync status" state="Check provider"/>
        </div>
      </section>
      <section className="aiu-panel aiu-lower-card aiu-guidance">
        <div className="aiu-subheading"><span className="aiu-icon"><Sparkles size={20}/></span>
          <div><h2>{needsAttention ? 'Action needed' : noneConnected ? 'Get started faster' : 'Review your setup'}</h2>
            <p>{needsAttention ? 'One or more provider connections require attention. Review authorization and settings.'
              : noneConnected ? 'Choose a provider to start secure account setup.'
                : 'Choose or verify the assets and permissions you intend to use.'}</p></div></div>
        <Link className="aiu-secondary" href="/settings/integrations/connect">{needsAttention?'Review connections':'Account setup guide'} <ArrowRight size={14}/></Link>
      </section>
    </div>
    <p className="aiu-policy-note">One active account per provider per workspace. Account replacement requires removing the previous connection; historical CRM leads and audit evidence remain preserved.</p>
  </section>;
}
function HealthStat({icon,label,value,note,tone}:{icon:ReactNode;label:string;value:string;note?:string;tone?:'success'|'warning'}) {
  return <div className="aiu-health-stat" data-tone={tone}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small>{note?<em>{note}</em>:null}</div></div>;
}
function EmptyCard({icon,title,detail}:{icon:ReactNode;title:string;detail:string}) {
  return <div className="aiu-card-empty"><span>{icon}</span><strong>{title}</strong><p>{detail}</p></div>;
}
function SettingShortcut({icon,title,detail,href}:{icon:ReactNode;title:string;detail:string;href:string|null}) {
  const inside=<><span className="aiu-icon">{icon}</span><div><strong>{title}</strong><p>{detail}</p></div>{href?<ArrowRight size={15}/>:null}</>;
  return href?<Link href={href} className="aiu-setting-shortcut">{inside}</Link>:<div className="aiu-setting-shortcut aiu-setting-static">{inside}</div>;
}
function SecurityItem({icon,text,state}:{icon:ReactNode;text:string;state:string}) {
  return <span className="aiu-security-item">{icon}<span>{text}</span><small>{state}</small></span>;
}
