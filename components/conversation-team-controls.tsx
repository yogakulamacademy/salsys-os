import { Clock3, UserRoundCheck } from 'lucide-react';

import {
  assignConversationOwnerAction,
  snoozeConversationAction,
} from '@/app/conversations/team-actions';
import type { ConversationAssignmentCandidate } from '@/lib/conversations-data';

export function ConversationTeamControls({
  leadId,
  ownerUserId,
  ownerName,
  snoozedUntil,
  canManageAssignments,
  assignmentCandidates,
}: {
  leadId: string;
  ownerUserId: string | null;
  ownerName: string | null;
  snoozedUntil: string | null;
  canManageAssignments: boolean;
  assignmentCandidates: ConversationAssignmentCandidate[];
}) {
  const assignAction = assignConversationOwnerAction.bind(null, leadId);
  const snoozeAction = snoozeConversationAction.bind(null, leadId);
  const snoozed = Boolean(
    snoozedUntil && new Date(snoozedUntil).getTime() > Date.now(),
  );

  return (
    <section className="border-b border-line px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-copy-strong">
            Inbox ownership
          </div>
          <div className="mt-0.5 text-[11px] text-copy-muted">
            Shared CRM owner · personal snooze state
          </div>
        </div>
        <UserRoundCheck size={15} className="text-brand-700" />
      </div>

      <div className="mt-3 rounded-ui border border-line bg-surface p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">
              Current owner
            </div>
            <div className={`mt-1 text-[13px] font-semibold ${ownerUserId ? 'text-copy-strong' : 'text-warning'}`}>
              {ownerName || 'Unassigned'}
            </div>
          </div>
        </div>

        {canManageAssignments ? (
          <form action={assignAction} className="mt-3 flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Assign conversation owner</span>
              <select
                name="owner_user_id"
                defaultValue={ownerUserId ?? ''}
                className="input h-10 w-full text-[12px]"
              >
                <option value="">Unassigned</option>
                {assignmentCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} · {prettyRole(candidate.role)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn-secondary shrink-0 px-3">
              Save
            </button>
          </form>
        ) : (
          <div className="mt-2 text-[11px] leading-5 text-copy-muted">
            Assignment changes are available to Sales managers and administrators.
          </div>
        )}
      </div>

      <form action={snoozeAction} className="mt-3 rounded-ui border border-line bg-surface p-3">
        <div className="flex items-start gap-2">
          <Clock3 size={14} className="mt-0.5 shrink-0 text-brand-700" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-copy-strong">
              {snoozed ? 'Snoozed for you' : 'Snooze this conversation'}
            </div>
            <div className="mt-0.5 text-[11px] leading-5 text-copy-muted">
              {snoozed && snoozedUntil
                ? `Returns to your active queue ${formatDateTime(snoozedUntil)}.`
                : 'Hide it from your active queue without changing the team queue.'}
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Snooze duration</span>
            <select
              name="snooze_for"
              defaultValue={snoozed ? 'clear' : '1h'}
              className="input h-10 w-full text-[12px]"
            >
              {snoozed ? <option value="clear">Return to inbox now</option> : null}
              <option value="1h">For 1 hour</option>
              <option value="4h">For 4 hours</option>
              <option value="tomorrow">Until tomorrow 9:00 AM</option>
              <option value="week">Until next week 9:00 AM</option>
            </select>
          </label>
          <button type="submit" className="btn-secondary shrink-0 px-3">
            {snoozed ? 'Update' : 'Snooze'}
          </button>
        </div>
      </form>
    </section>
  );
}

function prettyRole(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'later';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
