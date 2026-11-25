'use client';

import {useState} from 'react';
import {lifecycleConfirmationReady,type LifecycleView} from '@/lib/platform-lifecycle-view';

export function PlatformLifecyclePanel({view}:{view:LifecycleView}){
  const [preview,setPreview]=useState(false);
  const [reason,setReason]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const reset=()=>{setPreview(false);setReason('');setConfirmation('');};
  if(view.state==='unavailable')return <section className="rounded-xl border border-line bg-surface p-5"><h2 className="font-semibold">Organization lifecycle</h2><p role="status" className="mt-3 text-sm text-copy-muted">Lifecycle information unavailable. No actions can be performed.</p></section>;
  const action=view.action;
  const ready=action!==null&&lifecycleConfirmationReady(action,reason,confirmation);
  return <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Organization lifecycle</h2><span className="rounded-md bg-surface-soft px-2 py-1 text-xs capitalize">{view.status}</span></div>
    <p className="mt-2 text-sm text-copy-muted">Recorded organization status · revision {view.revision}</p>
    <p className="mt-2 text-xs text-copy-muted">Rehearsal only. No change is submitted or applied. Subscription records are separate; complete worker enforcement is not verified.</p>
    {action?<button type="button" className="mt-4 rounded-lg border border-line px-3 py-2 text-sm font-medium capitalize" onClick={()=>setPreview(true)}>Preview {action} confirmation</button>:<p className="mt-3 text-sm text-copy-muted">No eligible lifecycle action.</p>}
    {preview&&action&&<div className="mt-4 rounded-lg border border-line p-4" role="group" aria-label="Lifecycle confirmation rehearsal">
      <h3 className="font-semibold capitalize">{action} organization — rehearsal</h3>
      <p className="mt-2 break-all text-xs text-copy-muted">Target: {view.organizationId} · expected revision {view.revision}</p>
      <p className="mt-2 text-sm">{action==='suspend'?'A future approved suspension would restrict eligible operations while retaining records.':'A future approved restoration would re-evaluate access; existing queued actions must not automatically resume.'}</p>
      <label className="mt-4 block text-sm font-medium">Reason (10–512 characters)<textarea className="mt-1 block w-full rounded-lg border border-line bg-surface p-2 text-sm" maxLength={512} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <label className="mt-3 block text-sm font-medium">Type {action.toUpperCase()} to confirm<input className="mt-1 block w-full rounded-lg border border-line bg-surface p-2 text-sm" autoComplete="off" maxLength={12} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
      <p role="status" className="mt-3 text-sm text-copy-muted">{ready?'Confirmation requirements met. Actions remain disabled.':'Enter a reason and the exact confirmation word.'}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={reset} className="rounded-lg border border-line px-3 py-2 text-sm">Close preview</button><button type="button" disabled className="rounded-lg border border-line px-3 py-2 text-sm opacity-50">Apply change (disabled)</button></div>
    </div>}
    <h3 className="mt-6 font-semibold">Recent lifecycle history</h3>
    <p className="mt-1 text-xs text-copy-muted">Up to 20 recorded events; not a billing or customer activity timeline.</p>
    {view.events.length===0?<p className="mt-3 text-sm">No recorded lifecycle events.</p>:<ol className="mt-3 divide-y divide-line">{view.events.map(e=><li key={e.revision} className="py-3 text-sm"><p className="font-medium capitalize">{e.previousStatus} → {e.newStatus} · revision {e.revision}</p><p className="mt-1 break-words">{e.reason}</p><p className="mt-1 text-xs text-copy-muted">{new Date(e.occurredAt).toISOString()}</p></li>)}</ol>}
  </section>;
}
