import { Clock3 } from "lucide-react";

import { snoozeConversationAction } from "@/app/conversations/team-actions";
import { formatDateTime } from "@/lib/format";

/** Shown under the header while this conversation is snoozed for the current user. */
export function InboxSnoozedBanner({ leadId, until }: { leadId: string; until: string }) {
  const action = snoozeConversationAction.bind(null, leadId);
  const when = formatDateTime(until);
  return (
    <form action={action} className="ibx-v3-snoozed-banner flex shrink-0 items-center justify-between gap-2 border-b border-line bg-brand-50 px-5 py-2 text-[12px] text-copy">
      <span className="inline-flex items-center gap-1.5"><Clock3 size={13} aria-hidden="true" />
        Snoozed until {when}: hidden from your queue until then.</span>
      <input type="hidden" name="snooze_for" value="clear" />
      <button type="submit" className="font-bold text-brand-700 hover:underline">Return to inbox now</button>
    </form>
  );
}
