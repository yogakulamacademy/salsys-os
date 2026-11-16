"use client";

import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown, Clock3, Ellipsis, CalendarClock, FileText } from "lucide-react";
import { setConversationDoneAction, snoozeConversationAction } from "@/app/conversations/team-actions";

export function InboxHeaderActions({ leadId, resolved, canResolve, mock, snoozed=false }:{
  leadId:string; resolved:boolean; canResolve:boolean; mock:boolean; snoozed?:boolean;
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
      nextPanel?.querySelector<HTMLButtonElement>('.ibx-v2-link-action')?.click();
    },0);
  };
  const openNotes=()=>{
    const tab=Array.from(document.querySelectorAll<HTMLButtonElement>('.ibx-v2-center-tabs [role="tab"]'))
      .find(node=>node.textContent?.includes('Notes'));
    tab?.click();
  };
  const doneAction=setConversationDoneAction.bind(null,leadId);
  const snoozeAction=snoozeConversationAction.bind(null,leadId);
  return <div className="ibx-v3-header-buttons" aria-label="Conversation actions">
    <button type="button" className="ibx-v3-head-btn ibx-v3-next" onClick={nextStep}>
      <CalendarClock size={14}/> Next step <ChevronDown size={12}/>
    </button>
    <form action={doneAction}>
      <input type="hidden" name="operation" value={resolved?'reopen':'done'}/>
      <button type="submit" disabled={!canResolve || mock}
        title={mock?'Demo mode does not persist inbox resolution':!canResolve?'Inbox resolution is unavailable':'Changes inbox reply status, not independent CRM follow-up tasks'}
        className="ibx-v3-head-btn">
        <Check size={14}/> {resolved?'Reopen':'Mark done'}
      </button>
    </form>
    <form action={snoozeAction} className="ibx-v3-head-snooze">
      <Clock3 size={14} aria-hidden="true"/>
      <label htmlFor="inbox-header-snooze" className="sr-only">Snooze this conversation</label>
      <select id="inbox-header-snooze" name="snooze_for" defaultValue="" disabled={mock}
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
    <Link href={`/leads/${leadId}`} className="ibx-v3-head-btn" title="Open full lead profile">
      Profile <ArrowUpRight size={13}/>
    </Link>
    <details className="ibx-v3-head-more">
      <summary aria-label="More conversation actions" title="More actions"><Ellipsis size={18}/></summary>
      <div className="ibx-v3-head-menu">
        <button type="button" onClick={openNotes}><FileText size={14}/> View notes</button>
        <button type="button" onClick={nextStep}><CalendarClock size={14}/> Schedule follow-up</button>
      </div>
    </details>
  </div>;
}
