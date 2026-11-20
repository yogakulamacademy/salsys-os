"use server";

import { draftCopilotReply } from "@/lib/copilot-core";
import { interestNoteFor } from "@/lib/interest-profile";
import { getInterestProfile } from "@/lib/interest-profile-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type ReengageDraftResult =
  | { ok: true; draft: string; channel: string; handoff: boolean; reason: string }
  | { ok: false; error: string };

/**
 * Draft a re-engagement message for one lead, for a person to review in the
 * Inbox. Nothing is sent from here.
 */
export async function draftReengageMessageAction(leadId: string): Promise<ReengageDraftResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Your session has expired. Sign in again." };

  const { data: canWork, error: accessError } = await supabase.rpc("can_work_lead", { p_lead_id: leadId });
  if (accessError || canWork !== true) return { ok: false, error: "You do not have access to this lead." };

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const profile = await getInterestProfile(createAdminClient(), organizationId, [leadId]);

  const result = await draftCopilotReply({
    leadId,
    knowledgeClient: supabase,
    purpose: "reengage",
    interestNote: profile ? interestNoteFor(profile) : null,
  });
  if (!result.ok) return { ok: false, error: result.error.replace(/^[A-Z_]+:\s*/, "") };
  return { ok: true, draft: result.draft, channel: String(result.channel), handoff: result.nextAction === "handoff", reason: result.reason };
}
