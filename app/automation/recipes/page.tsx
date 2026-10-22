import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Inbox,
  ListChecks,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Workflow,
} from 'lucide-react';

import { installSmartTriggerRecipeAction } from '@/app/automation/recipes/actions';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Recipe={key:string;name:string;description:string;eventName:'lead.created'|'message.received'|'lead.stage_changed'|'payment.pending';followupTitle:string;delayMinutes:number;icon:typeof UserPlus;useCase:string};
const recipes:Recipe[]=[
 {key:'new_lead_response_sla',name:'New lead response SLA',description:'Create an immediate internal follow-up when a new lead enters SalsysOS.',eventName:'lead.created',followupTitle:'Respond to new lead',delayMinutes:0,icon:UserPlus,useCase:'Lead capture → follow-up task'},
 {key:'inbound_message_review',name:'Inbound message review',description:'Create a reply task whenever an inbound customer message is recorded.',eventName:'message.received',followupTitle:'Review and reply to inbound message',delayMinutes:0,icon:Inbox,useCase:'Inbound message → reply task'},
 {key:'payment_pending_followup',name:'Payment pending follow-up',description:'Create a controlled follow-up task one hour after a payment-pending event.',eventName:'payment.pending',followupTitle:'Follow up on pending payment',delayMinutes:60,icon:CreditCard,useCase:'Payment pending → admissions follow-up'},
 {key:'lead_stage_change_review',name:'Lead stage change review',description:'Create an internal review task whenever a lead changes stage.',eventName:'lead.stage_changed',followupTitle:'Review lead stage change',delayMinutes:0,icon:Workflow,useCase:'Pipeline change → review task'},
];
function prettyEvent(v:Recipe['eventName']){if(v==='lead.created')return'New lead created';if(v==='message.received')return'Inbound message received';if(v==='lead.stage_changed')return'Lead stage changed';return'Payment pending'}

export default async function AutomationRecipesPage({searchParams}:{searchParams:Promise<{notice?:string;error?:string}>}){
 const query=await searchParams;const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return <div className="card-pad text-sm text-slate-600">Sign in to use starter recipes.</div>;
 let organizationName='Current organization',canManage=false,installedRecipeKeys=new Set<string>(),loadError:string|null=null;
 try{const workspace=await getCurrentWorkspaceContext(supabase);const organizationId=workspace.activeOrganizationId;organizationName=workspace.activeWorkspace?.organizationName||organizationName;if(organizationId){const[{data:manageData,error:manageError},{data:workflowRows,error:workflowError}]=await Promise.all([supabase.rpc('can_manage_organization',{p_organization_id:organizationId}),supabase.from('automation_workflows').select('metadata').eq('organization_id',organizationId).neq('status','archived')]);if(manageError||workflowError)throw manageError||workflowError;canManage=manageData===true;installedRecipeKeys=new Set((workflowRows??[]).map(row=>{const metadata=row.metadata&&typeof row.metadata==='object'?(row.metadata as Record<string,unknown>):{};return typeof metadata.recipe_key==='string'?metadata.recipe_key:''}).filter(Boolean));}}catch(error){loadError=error instanceof Error?error.message:'Unable to load starter recipes.'}
 return <div className="space-y-5">
  <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Automation · Build</div><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Starter Recipes</h1><p className="mt-1.5 text-sm text-slate-500">Start from safe workflow patterns for {organizationName}, then customize them in Flow Builder.</p></div><Link href="/automation/flow-builder" className="btn-secondary">Open Flow Builder <ArrowRight size={13}/></Link></header>
  {query.notice?<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{query.notice}</div>:null}{query.error||loadError?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{query.error||'Starter recipes are temporarily unavailable.'}</div>:null}
  <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3.5"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-700"/><div><div className="text-sm font-bold text-emerald-950">Safe starting point</div><div className="mt-0.5 text-xs leading-5 text-emerald-800">Recipes install as drafts with runtime off. They create internal follow-up actions only.</div></div></div>
  <section className="grid gap-4 xl:grid-cols-2">{recipes.map(recipe=>{const Icon=recipe.icon;const installed=installedRecipeKeys.has(recipe.key);return <article key={recipe.key} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-violet-200 hover:shadow-sm"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700"><Icon size={19}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold text-slate-950">{recipe.name}</h2>{installed?<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11}/> Installed</span>:null}</div><p className="mt-1 text-sm leading-6 text-slate-500">{recipe.description}</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">When</div><div className="mt-1 text-sm font-semibold text-slate-800">{prettyEvent(recipe.eventName)}</div></div><div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Then</div><div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><ListChecks size={14}/>{recipe.followupTitle}</div></div></div><div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 size={12}/>{recipe.delayMinutes===0?'Immediate task':`${recipe.delayMinutes}-minute delay`}</span><span>·</span><span>{recipe.useCase}</span></div><div className="mt-4 border-t border-slate-100 pt-4">{canManage?<form action={installSmartTriggerRecipeAction}><input type="hidden" name="recipe_key" value={recipe.key}/><button type="submit" disabled={installed} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"><Sparkles size={14}/>{installed?'Installed':'Install as draft'}</button></form>:<div className="text-xs text-slate-500">Admin access is required to install recipes.</div>}</div></article>})}</section>
  <div className="rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3.5 text-xs leading-5 text-violet-800"><strong className="text-violet-950">Need customer messaging?</strong> Install the recipe first, then add approved WhatsApp template actions, waits, branches and human approvals in Flow Builder.</div>
 </div>;
}
