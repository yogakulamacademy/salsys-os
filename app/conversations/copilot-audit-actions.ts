'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type SupportedChannel = 'instagram' | 'whatsapp';

export async function markCopilotAssistedMessageAction({
  leadId,
  messageId,
  channel,
}: {
  leadId: string;
  messageId: string;
  channel: SupportedChannel;
}) {
  const normalizedLeadId = String(leadId ?? '').trim();
  const normalizedMessageId = String(messageId ?? '').trim();

  if (!normalizedLeadId || !normalizedMessageId) {
    return { ok: false as const };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false as const };
  }

  const { data: canWorkLead, error: accessError } = await supabase.rpc(
    'can_work_lead',
    { p_lead_id: normalizedLeadId },
  );

  if (accessError || canWorkLead !== true) {
    return { ok: false as const };
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from('leads')
    .select('organization_id')
    .eq('id', normalizedLeadId)
    .maybeSingle();

  if (!lead?.organization_id) {
    return { ok: false as const };
  }

  const { data: conversation } = await admin
    .from('conversations')
    .select('id')
    .eq('organization_id', lead.organization_id)
    .eq('lead_id', normalizedLeadId)
    .eq('channel', channel)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!conversation?.id) {
    return { ok: false as const };
  }

  const { data, error } = await admin
    .from('messages')
    .update({
      ai_generated: true,
      human_approved: true,
    })
    .eq('id', normalizedMessageId)
    .eq('organization_id', lead.organization_id)
    .eq('lead_id', normalizedLeadId)
    .eq('conversation_id', conversation.id)
    .eq('direction', 'outbound')
    .select('id')
    .maybeSingle();

  if (error || !data?.id) {
    console.error('Unable to mark Co-Pilot assisted message', {
      leadId: normalizedLeadId,
      messageId: normalizedMessageId,
      channel,
      error: error?.message,
    });

    return { ok: false as const };
  }

  return { ok: true as const };
}
