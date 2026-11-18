'use server';

import { draftCopilotReply, type CopilotReplyResult } from '@/lib/copilot-core';
import { createClient } from '@/lib/supabase/server';

export type { CopilotReplyResult } from '@/lib/copilot-core';

export async function generateCopilotReplyAction(
  leadId: string,
): Promise<CopilotReplyResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: 'Your session has expired. Sign in again.' };
  }

  const { data: canWorkLead, error: accessError } = await supabase.rpc(
    'can_work_lead',
    { p_lead_id: leadId },
  );

  if (accessError || canWorkLead !== true) {
    return {
      ok: false,
      error: accessError?.message || 'You do not have access to this lead.',
    };
  }

  // The user's own client runs the knowledge search, so retrieval stays
  // scoped to the workspace their session is bound to.
  const { facts: _facts, ...result } = (await draftCopilotReply({ leadId, knowledgeClient: supabase, purpose: 'copilot' })) as CopilotReplyResult & { facts?: unknown };
  return result as CopilotReplyResult;
}
