"use client";

import { useFormStatus } from "react-dom";
import { ChevronDown, UserRound } from "lucide-react";

import { assignConversationOwnerAction } from "@/app/conversations/team-actions";

type Candidate = { id: string; name: string; role: string };

function Saving() {
  const { pending } = useFormStatus();
  return pending ? <span className="ibx-v3-field-saving" role="status">Saving…</span> : null;
}

/** Owner chip in the conversation header. Managers and admins can reassign from here. */
export function InboxHeaderOwner({ leadId, ownerUserId, ownerName, candidates, canAssign, mock }: {
  leadId: string; ownerUserId: string | null; ownerName: string | null;
  candidates: Candidate[]; canAssign: boolean; mock: boolean;
}) {
  if (!canAssign || mock) {
    return (
      <span className="ibx-v3-header-owner"><UserRound size={12} />
        Owner: {ownerName || "Unassigned"}
      </span>
    );
  }
  const action = assignConversationOwnerAction.bind(null, leadId);
  return (
    <form action={action} className={`ibx-v3-header-owner ibx-v3-header-owner-pick ${ownerUserId ? "" : "is-unassigned"}`}>
      <UserRound size={12} aria-hidden="true" />
      <label htmlFor="inbox-header-owner" className="sr-only">Assign this lead to a teammate</label>
      <select id="inbox-header-owner" name="owner_user_id" defaultValue={ownerUserId ?? ""}
        title="Assign this lead to a teammate"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}>
        <option value="">Unassigned</option>
        {ownerUserId && !candidates.some((c) => c.id === ownerUserId)
          ? <option value={ownerUserId}>{ownerName || "Current owner"}</option> : null}
        {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <ChevronDown size={11} aria-hidden="true" />
      <Saving />
    </form>
  );
}
