'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BarChart3, CheckCircle2, Facebook, Globe2, Instagram, Layers3, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { IntegrationConnectButton } from '@/components/integration-connect-button';
import { ProviderBrand } from '../provider-brand';
import type { IntegrationProvider, IntegrationStatus } from '@/lib/integrations/types';

const choices:{id:IntegrationProvider;name:string;subtitle:string;tags:string[];features:string[];group:string;icon:React.ReactNode}[]=[
  {id:'google',name:'Google',subtitle:'Analytics, Search Console, Google Ads',
    tags:['all','marketing','ads','analytics'],
    features:['Discover eligible GA4 properties','Choose available Search Console sites','Select accessible Google Ads customers'],
    group:'Analytics & Ads',icon:<ProviderBrand provider="google"/>},
  {id:'meta',name:'Meta',subtitle:'Facebook, Instagram, Meta Ads',
    tags:['all','marketing','ads','messaging'],
    features:['Authorize a Meta business account','Discover accessible ad accounts','Review supported Facebook assets'],
    group:'Marketing & Ads',icon:<ProviderBrand provider="meta"/>},
  {id:'instagram',name:'Instagram',subtitle:'Professional Direct messaging account',
    tags:['all','messaging','marketing'],
    features:['Authorize the professional Instagram account','Review granted messaging permissions','Use supported CRM conversation workflows'],
    group:'Messaging',icon:<ProviderBrand provider="instagram"/>},
  {id:'whatsapp',name:'WhatsApp Business',subtitle:'Business Cloud API, phone and templates',
    tags:['all','messaging'],
    features:['Connect an eligible WhatsApp Business account','Configure your business phone number','Review Cloud API messaging setup'],
    group:'Messaging',icon:<ProviderBrand provider="whatsapp"/>},
];
const providerServices:Record<IntegrationProvider,{title:string;detail:string}[]> = {
  google:[
    {title:'Google Analytics (GA4)',detail:'Select an eligible property after authorization'},
    {title:'Search Console',detail:'Select a verified site after authorization'},
    {title:'Google Ads',detail:'Select an accessible Ads customer'},
  ],
  meta:[
    {title:'Meta Business',detail:'Authorize the eligible Business Portfolio'},
    {title:'Meta Ads',detail:'Discover and select permitted ad accounts'},
    {title:'Facebook assets',detail:'Review available Pages and linked assets'},
  ],
  instagram:[
    {title:'Professional account',detail:'Authorize an eligible Instagram profile'},
    {title:'Direct messages',detail:'Grant the permissions required for messaging'},
    {title:'CRM conversations',detail:'Use supported conversation workflows'},
  ],
  whatsapp:[
    {title:'WhatsApp Business Account',detail:'Connect through the Cloud API setup'},
    {title:'Business phone number',detail:'Select and verify the sender'},
    {title:'Messaging settings',detail:'Review templates and account setup'},
  ],
};
const categories=[{id:'all',label:'All'},{id:'marketing',label:'Marketing'},{id:'messaging',label:'Messaging'},{id:'ads',label:'Ads'},{id:'analytics',label:'Analytics'}];
export function IntegrationConnectionPicker({selected,connected,available}:{selected:IntegrationProvider;connected:Record<IntegrationProvider,IntegrationStatus|null>;available:boolean}) {
  const [category,setCategory]=useState('all');
  const picked=choices.find(x=>x.id===selected)||choices[0];
  const already=connected[picked.id]==='connected';
  const eligible=choices.filter(x=>x.tags.includes(category));
  return <div className="aiu-wizard-layout">
    <section className="aiu-panel aiu-wizard-choose">
      <h2>Select an integration</h2>
      <div className="aiu-wizard-filter" role="group" aria-label="Integration categories">
        {categories.map(categoryOption=><button key={categoryOption.id} type="button" aria-pressed={category===categoryOption.id}
          className={category===categoryOption.id?'aiu-filter-active':''} onClick={()=>setCategory(categoryOption.id)}>{categoryOption.label}</button>)}
      </div>
      <div className="aiu-wizard-provider-grid">
        {eligible.map(choice=><Link key={choice.id} className="aiu-choice" data-selected={choice.id===picked.id?'true':undefined} href={'/settings/integrations/connect?provider='+choice.id}>
          <div className="aiu-choice-heading"><span className="aiu-provider-icon">{choice.icon}</span><div><strong>{choice.name}</strong><p>{choice.subtitle}</p></div><span className="aiu-choice-radio" aria-hidden="true">{choice.id===picked.id?<CheckCircle2 size={19}/>:null}</span></div>
          <ul>{choice.features.map(feature=><li key={feature}><CheckCircle2 size={15}/> {feature}</li>)}</ul>
          {connected[choice.id]==='connected'?<span className="aiu-choice-existing">Already connected</span>:null}
        </Link>)}
      </div>
    </section>
    <section className="aiu-panel aiu-wizard-detail" aria-label="Selected integration">
      <div className="aiu-wizard-selected"><span className="aiu-provider-icon">{picked.icon}</span><div>
        <h2>Connect {picked.name}</h2>
        <p>Authorize your {picked.name} account using the existing provider setup flow.</p>
      </div></div>
      <div className="aiu-wizard-feature-box"><h3>What can be connected?</h3>
        <p className="aiu-wizard-feature-explainer">Available services — selection and permissions are confirmed after authorization.</p>
        {providerServices[picked.id].map(service=><div className="aiu-wizard-service" key={service.title}>
          <span className="aiu-service-indicator"><CheckCircle2 size={17}/></span>
          <span><strong>{service.title}</strong><small>{service.detail}</small></span>
        </div>)}
      </div>
      <div className="aiu-safe-note"><ShieldCheck size={18}/><div><strong>Secure, scoped authorization</strong>
        <p>Provider permissions are requested by the existing connection flow. No credentials are entered or saved in this wizard.</p>
      </div></div>
      <div className="aiu-wizard-cta">
        {!available?<p className="aiu-error-note">Integration setup is unavailable. Please review connection infrastructure first.</p>
        :already?<Link className="aiu-primary" href={'/settings/integrations/connect?provider='+picked.id+'&step=configure'}>
          Continue to configuration <ArrowRight size={16}/></Link>
        :picked.id==='whatsapp'?<Link className="aiu-primary" href="/settings/integrations/whatsapp">
          Continue to WhatsApp setup <ArrowRight size={15}/></Link>
        :<IntegrationConnectButton provider={picked.id as 'google'|'meta'|'instagram'} mode="connect"/>}
        <Link className="aiu-secondary" href="/settings/integrations">Cancel</Link>
      </div>
      {already ? <p className="aiu-wizard-hint">This provider is already connected. To use a different account, remove the current connection from its Manage panel first.</p>:
      <p className="aiu-wizard-hint">After authorization, return to this page to review connected assets and finish setup. OAuth permission scopes may vary by account.</p>}
    </section>
  </div>;
}
