import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDashed, Layers3, Link2, Settings2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWorkspaceContextForUser } from '@/lib/workspace';
import { GoogleIntegrationAssets } from '@/components/google-integration-assets';
import { MetaIntegrationAssets } from '@/components/meta-integration-assets';
import type { IntegrationAsset, IntegrationProvider, IntegrationStatus } from '@/lib/integrations/types';
import { PageHeader } from '@/components/ui';
import { IntegrationConnectionPicker } from './integration-connection-picker';
import { activeProviderConnection, INTEGRATION_PROVIDERS, type SafeIntegrationConnection } from '../integrations-dashboard';
import '../integrations-ui.css';

type Step = 'choose' | 'configure' | 'complete';
const providers: IntegrationProvider[] = ['google','meta','instagram','whatsapp'];
const validStep = (value:string|undefined):Step =>
  value==='configure'||value==='complete'?value:'choose';

export default async function ConnectAccountPage({
  searchParams,
}:{
  searchParams:Promise<{provider?:string;step?:string;notice?:string;error?:string}>;
}) {
  const query=await searchParams;
  const supabase=await createClient();
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user) redirect('/login');
  const {data:profile,error:profileError}=await supabase.from('profiles')
    .select('id, active').eq('id',user.id).maybeSingle();
  if(profileError||!profile||profile.active!==true) redirect('/dashboard');
  const workspaces=await getWorkspaceContextForUser(supabase,user.id);
  const activeWorkspace=workspaces.activeWorkspace;
  if(!activeWorkspace||!['owner','admin'].includes(activeWorkspace.role)) redirect('/dashboard');
  const orgId=activeWorkspace.organizationId;
  const admin=createAdminClient();
  const {data:org,error:orgError}=await admin.from('organizations')
    .select('id,status').eq('id',orgId).eq('status','active').maybeSingle();
  if(orgError||!org) redirect('/dashboard');

  const [connectionsResult,assetsResult]=await Promise.all([
    admin.from('integration_connections')
      .select('id, provider, status, account_name, account_email, last_verified_at, last_error, connected_at, updated_at, scopes')
      .eq('organization_id',orgId).order('updated_at',{ascending:false}),
    admin.from('integration_assets')
      .select('id, connection_id, asset_type, external_id, name, status, is_selected, metadata, discovered_at, updated_at')
      .eq('organization_id',orgId),
  ]);
  const available=!connectionsResult.error&&!assetsResult.error;
  const connections=available?(connectionsResult.data||[]) as unknown as SafeIntegrationConnection[]:[];
  const assets=available?(assetsResult.data||[]) as unknown as IntegrationAsset[]:[];
  const selected=providers.includes(query.provider as IntegrationProvider)?query.provider as IntegrationProvider:'google';
  const connection=available?activeProviderConnection(connections,selected):null;
  const connected=connection?.status==='connected';
  const requested=validStep(query.step);
  const step:Step=connected?requested:'choose';
  const definition=INTEGRATION_PROVIDERS.find(p=>p.id===selected)!;
  const selectedAssets=connected ? assets.filter(a=>a.connection_id===connection?.id && a.is_selected):[];
  const statusByProvider={} as Record<IntegrationProvider,IntegrationStatus|null>;
  providers.forEach(provider=>{statusByProvider[provider]=available?activeProviderConnection(connections,provider)?.status||null:null;});
  const stepHref=(next:Step)=>'/settings/integrations/connect?provider='+selected+'&step='+next;

  return <section className="aiu aiu-connect-page space-y-5" aria-label="Connect an account">
    <nav className="aiu-breadcrumb" aria-label="Account integrations breadcrumb">
      <Link href="/settings/overview">Settings</Link><ArrowRight size={13}/>
      <Link href="/settings/integrations">Account Integrations</Link>
      <ArrowRight size={13}/><span>Connect an Account</span>
    </nav>
    <div className="aiu-wizard-heading">
      <div><PageHeader eyebrow="Settings" title="Connect an Account"
        description="Choose a business provider, authorize it, and review supported configuration before returning to your CRM."/></div>
      <ol className="aiu-progress" aria-label="Connection steps">
        {([
          {key:'choose',name:'Choose & Connect',number:'1'},
          {key:'configure',name:'Configure',number:'2'},
          {key:'complete',name:'Review & Complete',number:'3'},
        ] as const).map(item=><li key={item.key} data-current={item.key===step?'true':undefined}>
          <span>{item.number}</span><strong>{item.name}</strong>
        </li>)}
      </ol>
    </div>
    {query.notice?<div className="aiu-success-note" role="status">{query.notice}</div>:null}
    {query.error?<div className="aiu-error-note" role="alert">{query.error}</div>:null}
    {!available?<div className="aiu-error-note" role="alert">
      Integration connection data could not be loaded. Configuration cannot be confirmed until the read succeeds.
    </div>:null}
    {step==='choose'?<IntegrationConnectionPicker selected={selected} connected={statusByProvider} available={available}/>
      :step==='configure'?<div className="aiu-configuration">
        <div className="aiu-panel aiu-config-banner">
          <span className="aiu-icon"><CheckCircle2 size={21}/></span>
          <div><h2>{definition.name} account authorized</h2>
            <p>{connection?.account_name||connection?.account_email||'Authorized business account'} · The provider connection is recorded as connected. Verify assets and permissions before relying on data sync.</p></div>
          <Link href={stepHref('complete')} className="aiu-primary">Review setup <ArrowRight size={14}/></Link>
        </div>
        {selected==='google'&&connection?<div className="aiu-config-assets">
          <GoogleIntegrationAssets connectionId={connection.id} assets={assets.filter(asset=>asset.connection_id===connection.id)}/>
        </div>:selected==='meta'&&connection?<div className="aiu-config-assets">
          <MetaIntegrationAssets connectionId={connection.id} assets={assets.filter(asset=>asset.connection_id===connection.id)}/>
        </div>:<section className="aiu-panel aiu-config-basic">
          <span className="aiu-icon">{selected==='whatsapp'?<Link2 size={22}/>:<ShieldCheck size={22}/>}</span>
          <div><h2>{selected==='whatsapp'?'WhatsApp Business setup':'Instagram permissions'}</h2>
            <p>{selected==='whatsapp'
              ? 'Manage the authorized business account, sender phone number and messaging configuration on the existing WhatsApp setup page.'
              : 'Instagram uses an authorized professional-account connection. No additional asset selector is available in this wizard.'}</p>
            <Link href={selected==='whatsapp'?'/settings/integrations/whatsapp':'/settings/integrations'} className="aiu-secondary">
              {selected==='whatsapp'?'Open WhatsApp setup':'Review connection'} <ArrowRight size={14}/></Link>
          </div>
        </section>}
        <div className="aiu-wizard-footer"><Link href={stepHref('choose')} className="aiu-secondary"><ArrowLeft size={14}/> Back to providers</Link>
          <Link href={stepHref('complete')} className="aiu-primary">Review connection <ArrowRight size={15}/></Link></div>
      </div>
      :<section className="aiu-panel aiu-complete-state">
        <span className="aiu-complete-icon"><CheckCircle2 size={40}/></span>
        <h2>{definition.name} connection confirmed</h2>
        <p>We verified an authorized connection in this workspace. This is not a claim that data synchronization or ingestion has completed.</p>
        <div className="aiu-complete-facts">
          <div><strong>Provider</strong><span>{definition.name}</span></div>
          <div><strong>Account</strong><span>{connection?.account_name||connection?.account_email||'Authorized account'}</span></div>
          <div><strong>Assets selected</strong><span>{selectedAssets.length}</span></div>
          <div><strong>Data sync</strong><span>Not verified by this connection read</span></div>
        </div>
        <div className="aiu-wizard-footer">
          <Link href={stepHref('configure')} className="aiu-secondary"><Settings2 size={14}/> Configure assets</Link>
          <Link href="/settings/integrations" className="aiu-primary">Go to Integrations <ArrowRight size={15}/></Link>
        </div>
      </section>}
  </section>;
}
