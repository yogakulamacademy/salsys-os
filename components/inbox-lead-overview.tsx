"use client";

import { useFormStatus } from "react-dom";
import { Check, ChevronDown, Info, UserRound } from "lucide-react";
import { assignConversationOwnerAction, changeInboxLeadStageAction } from "@/app/conversations/team-actions";
import type { LeadStage, Channel } from "@/types/crm";

type Candidate={id:string;name:string;role:string};
type Props={
  leadId:string; stage:LeadStage; ownerUserId:string|null; ownerName:string|null;
  candidates:Candidate[]; canAssign:boolean; mock:boolean;
  channel:Channel; attributionSource:string; interest:string; country:string;
  lastContacted:string; state:string;
};
const stageOptions:LeadStage[]=[
  "new","contacted","engaged","qualified","high_intent","payment_pending",
  "enrolled","nurture","not_now","lost","unqualified","duplicate",
];
const pretty=(text:string)=>text.replaceAll("_"," ").replace(/\b\w/g, c=>c.toUpperCase());
function SavingIndicator(){const {pending}=useFormStatus();return pending?<span className="ibx-v3-field-saving" role="status">Saving…</span>:null;}
export function InboxLeadOverview({
  leadId,stage,ownerUserId,ownerName,candidates,canAssign,mock,channel,attributionSource,
  interest,country,lastContacted,state,
}:Props){
  const stageAction=changeInboxLeadStageAction.bind(null,leadId);
  const ownerAction=assignConversationOwnerAction.bind(null,leadId);
  return <section className="ibx-v3-overview" aria-label="Lead overview">
    <div className="ibx-v3-card-title"><UserRound size={18}/><h3>Lead overview</h3></div>
    <dl>
      <div className="ibx-v3-overview-line ibx-v3-editable">
        <dt>Stage</dt>
        <dd>
          <form action={stageAction}>
            <label className="sr-only" htmlFor="inbox-lead-stage">Lead stage</label>
            <select id="inbox-lead-stage" name="stage" defaultValue={stage} disabled={mock}
              onChange={event=>event.currentTarget.form?.requestSubmit()} aria-label="Lead stage">
              {stageOptions.map(item=><option key={item} value={item}>{pretty(item)}</option>)}
            </select>
            <ChevronDown size={12} aria-hidden="true"/>
            <SavingIndicator/>
          </form>
        </dd>
      </div>
      <div className="ibx-v3-overview-line ibx-v3-editable">
        <dt>Owner</dt>
        <dd>
          {canAssign&&!mock?<form action={ownerAction}>
            <label className="sr-only" htmlFor="inbox-lead-owner">Lead owner</label>
            <select id="inbox-lead-owner" name="owner_user_id" defaultValue={ownerUserId||""}
              onChange={event=>event.currentTarget.form?.requestSubmit()} aria-label="Lead owner">
              <option value="">Unassigned</option>
              {ownerUserId&&!candidates.some(candidate=>candidate.id===ownerUserId)?
                <option value={ownerUserId}>{ownerName||'Current owner'}</option>:null}
              {candidates.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
            <ChevronDown size={12} aria-hidden="true"/><SavingIndicator/>
          </form>:<span>{ownerName||"Unassigned"}</span>}
        </dd>
      </div>
      <div className="ibx-v3-overview-line"><dt>Channel</dt><dd>{pretty(channel)}</dd></div>
      <div className="ibx-v3-overview-line"><dt>Source</dt><dd>{attributionSource || "Not verified"}</dd></div>
      <div className="ibx-v3-overview-line"><dt>Status</dt><dd>{state}</dd></div>
      <div className="ibx-v3-overview-line"><dt>Interest</dt><dd>{interest||"Not selected"}</dd></div>
      <div className="ibx-v3-overview-line"><dt>Country</dt><dd>{country||"Not recorded"}</dd></div>
      <div className="ibx-v3-overview-line"><dt>Last contacted</dt><dd>{lastContacted}</dd></div>
    </dl>
    {mock?<p className="ibx-v3-data-note"><Info size={13}/> Demo mode: changes are not persisted.</p>:null}
  </section>;
}
