"use client";

import Link from "next/link";
import { useTransition, type ReactNode } from "react";
import { ArrowUpRight, Check, Clock3, Ellipsis, CalendarClock, FileText } from "lucide-react";
import { setDoneInline, snoozeInline } from "@/app/conversations/inline-actions";
import { showInboxToast } from "@/lib/inbox-toast";

export function InboxHeaderActions({ leadId, resolved, canResolve, mock, snoozed=false, lead }:{
  leadId:string; resolved:boolean; canResolve:boolean; mock:boolean; snoozed?:boolean;
  /** Shown first, e.g. the Hand to AI button. */
  lead?: ReactNode;
}) {
  const nextStep=()=>{
    const panel=document.getElementById('inbox-next-steps');
    if(!panel) {
      document.querySelector<HTMLButtonElement>('button[aria-label="Open customer context"]')?.click();
      document.querySelector<HTMLButtonElement>('button[aria-label="Show customer context"]')?.click();
    }
    window.setTimeout(()=>{
      const nextPanel=document.getElementById('inbox-next-steps');
      nextPanel?.scrollIntoView({behavior:'smooth',block:'nearest'});
      nextPanel?.querySelector<HTMLButtonElement>('.ibx-v3-fu-whens button')?.focus();
    },0);
  };
  const openNotes=()=>{
    const tab=Array.from(document.querySelectorAll<HTMLButtonElement>('.ibx-v2-center-tabs [role="tab"]'))
      .find(node=>node.textContent?.includes('Notes'));
    tab?.click();
  };
  // In place: no page navigation; a toast says what happened (20 Nov 2026).
  const [pending,startTransition]=useTransition();
  const run=(action:typeof setDoneInline, formData:FormData)=>startTransition(async()=>{
    const result=await action(leadId,formData);
    showInboxToast(result.message,result.ok?'success':'error');
  });
  // Owner-approved design (20 Nov 2026): Hand to AI, Snooze, Mark done; the rest in "…".
  return <div className="ibx-v3-header-buttons ibx-v5-head-actions" aria-label="Conversation actions">
    {lead}
    <form onSubmit={event=>{event.preventDefault();run(snoozeInline,new FormData(event.currentTarget));event.currentTarget.reset();}} className="ibx-v3-head-snooze">
      <Clock3 size={14} aria-hidden="true"/>
      <label htmlFor="inbox-header-snooze" className="sr-only">Snooze this conversation</label>
      <select id="inbox-header-snooze" name="snooze_for" defaultValue="" disabled={mock||pending}
        title="Hide from your queue until later. Teammates still see it."
        onChange={event=>{ if(event.currentTarget.value) event.currentTarget.form?.requestSubmit(); }}>
        <option value="" disabled>{snoozed?'Snoozed':'Snooze'}</option>
        <option value="1h">For 1 hour</option>
        <option value="4h">For 4 hours</option>
        <option value="tomorrow">Until tomorrow 9:00 AM</option>
        <option value="week">Until next week 9:00 AM</option>
        {snoozed?<option value="clear">Return to inbox now</option>:null}
      </select>
    </form>
    <form onSubmit={event=>{event.preventDefault();run(setDoneInline,new FormData(event.currentTarget));}}>
      <input type="hidden" name="operation" value={resolved?'reopen':'done'}/>
      <button type="submit" disabled={!canResolve || mock || pending}
        title={mock?'Demo mode does not persist inbox resolution':!canResolve?'Inbox resolution is unavailable':'Changes inbox reply status, not independent CRM follow-up tasks'}
        className="ibx-v3-head-btn">
        <Check size={14}/> {resolved?'Reopen':'Mark done'}
      </button>
    </form>
    <details className="ibx-v3-head-more">
      <summary aria-label="More conversation actions" title="More actions"><Ellipsis size={18}/></summary>
      <div className="ibx-v3-head-menu">
        <button type="button" className="ibx-v3-next" onClick={nextStep}><CalendarClock size={14}/> Next step</button>
        <button type="button" onClick={nextStep}><CalendarClock size={14}/> Schedule follow-up</button>
        <button type="button" onClick={openNotes}><FileText size={14}/> View notes</button>
        <Link href={`/leads/${leadId}`} title="Open full lead profile"><ArrowUpRight size={14}/> Full profile</Link>
      </div>
    </details>
  </div>;
}
