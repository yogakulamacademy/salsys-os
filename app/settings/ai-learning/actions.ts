'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { isWhatsAppBusinessAiReport, parseWhatsAppBusinessAiReport, readZipTextEntries, type ExportFile } from '@/lib/chat-export-import';
import { analyzeConversations, type ConversationOutcome, type LearningMessage, type LearningResult } from '@/lib/conversation-learning';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

const PAGE = 1000;
const MAX_MESSAGES = 50_000;
const WINDOW_DAYS = 180;

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/settings/ai-learning?${type}=${encodeURIComponent(message)}`);
}

async function managerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) go('error', 'Your session has expired. Sign in again.');
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage } = await supabase.rpc('can_manage_organization', { p_organization_id: organizationId });
  if (canManage !== true) go('error', 'Only organization admins and managers can run or review AI learning.');
  return { supabase, userId: user.id, organizationId };
}

type SaveRunInput = {
  organizationId: string;
  userId: string;
  result: LearningResult;
  source: 'crm_messages' | 'whatsapp_export' | 'instagram_export';
  sourceLabel: string;
  windowStart: Date | null;
  windowEnd: Date | null;
};

async function saveLearningRun({ organizationId, userId, result, source, sourceLabel, windowStart, windowEnd }: SaveRunInput) {
  const admin = createAdminClient();
  const { data: run, error: runError } = await admin
    .from('conversation_learning_runs')
    .insert({
      organization_id: organizationId,
      started_by: userId,
      status: 'completed',
      source,
      source_label: sourceLabel.slice(0, 200),
      window_start: windowStart?.toISOString() ?? null,
      window_end: windowEnd?.toISOString() ?? null,
      conversations_analyzed: result.conversationsAnalyzed,
      messages_analyzed: result.messagesAnalyzed,
      inbound_messages: result.inboundMessages,
      outbound_messages: result.outboundMessages,
      conversations_with_team_reply: result.conversationsWithTeamReply,
      won_conversations: result.outcomeEvidence.won,
      enough_for_outcome_learning: result.outcomeEvidence.enoughForOutcomeLearning,
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (runError || !run) go('error', 'The learning run could not be saved.');

  if (result.insights.length) {
    const { error: insightError } = await admin.from('conversation_learning_insights').insert(
      result.insights.map((insight) => ({
        run_id: run.id,
        organization_id: organizationId,
        kind: insight.kind,
        insight_key: insight.key,
        label: insight.label.slice(0, 160),
        conversations: insight.conversations,
        share: Math.min(1, Math.max(0, Number(insight.share.toFixed(5)))),
        detail: insight.detail.slice(0, 600),
        examples: insight.examples.slice(0, 3),
        // Data gaps are facts about the data, not advice: no review needed.
        review_status: insight.kind === 'data_gap' ? 'approved' : 'pending',
      })),
    );
    if (insightError) {
      await admin.from('conversation_learning_runs').update({ status: 'failed', error: 'insight insert failed' }).eq('id', run.id);
      go('error', 'Insights could not be saved. The run was marked as failed.');
    }
  }

}

/** Analyses this organization's last 180 days of conversations and stores insights for review. */
export async function runConversationLearningAction() {
  if (useMockData) go('error', 'Demo mode does not analyse live conversations.');
  const { userId, organizationId } = await managerContext();
  const admin = createAdminClient();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const messages: LearningMessage[] = [];
  for (let from = 0; from < MAX_MESSAGES; from += PAGE) {
    const { data, error } = await admin
      .from('messages')
      .select('conversation_id, direction, body, message_type, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', windowStart.toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) go('error', 'Conversations could not be loaded. Nothing was saved.');
    for (const row of data ?? []) {
      if (!row.conversation_id) continue;
      messages.push({
        conversationId: row.conversation_id,
        direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
        body: row.body,
        messageType: row.message_type,
        createdAt: row.created_at,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  if (!messages.length) go('error', 'No conversations in the last 180 days to learn from.');

  // Outcomes: lead won = enrolled; a pending payment counts as payment_pending.
  const conversationIds = [...new Set(messages.map((m) => m.conversationId))];
  const outcomes = new Map<string, ConversationOutcome>();
  for (let i = 0; i < conversationIds.length; i += 500) {
    const chunk = conversationIds.slice(i, i + 500);
    const { data: convs, error } = await admin
      .from('conversations')
      .select('id, lead_id')
      .eq('organization_id', organizationId)
      .in('id', chunk);
    if (error) go('error', 'Conversation outcomes could not be loaded. Nothing was saved.');
    const convRows = (convs ?? []) as Array<{ id: string; lead_id: string | null }>;
    const leadIds = [...new Set(convRows.map((c) => c.lead_id).filter(Boolean))] as string[];
    if (!leadIds.length) continue;
    const [{ data: leads, error: leadError }, { data: payments, error: paymentError }] = await Promise.all([
      admin.from('leads').select('id, status').eq('organization_id', organizationId).in('id', leadIds),
      admin.from('payments').select('lead_id, status').eq('organization_id', organizationId).in('lead_id', leadIds),
    ]);
    if (leadError || paymentError) go('error', 'Conversation outcomes could not be loaded. Nothing was saved.');
    const leadRows = (leads ?? []) as Array<{ id: string; status: string | null }>;
    const paymentRows = (payments ?? []) as Array<{ lead_id: string | null; status: string | null }>;
    const won = new Set(leadRows.filter((l) => l.status === 'won').map((l) => l.id));
    const paid = new Set(paymentRows.filter((p) => p.status === 'paid').map((p) => p.lead_id));
    const pending = new Set(paymentRows.filter((p) => p.status === 'pending').map((p) => p.lead_id));
    for (const c of convRows) {
      if (!c.lead_id) continue;
      outcomes.set(c.id, won.has(c.lead_id) || paid.has(c.lead_id) ? 'won' : pending.has(c.lead_id) ? 'payment_pending' : 'open');
    }
  }

  const result = analyzeConversations(messages, { outcomes, timeZone: 'Asia/Kolkata' });

  await saveLearningRun({ organizationId, userId, result, source: 'crm_messages', sourceLabel: 'Messages stored in SalsysOS (last 180 days)', windowStart, windowEnd });

  revalidatePath('/settings/ai-learning');
  go('notice', `Learned from ${result.conversationsAnalyzed.toLocaleString('en-IN')} conversations. Review the insights below; only approved ones reach the AI.`);
}

/** Approve or reject one insight. Uses the user's session so RLS enforces manager rights. */
export async function reviewConversationInsightAction(formData: FormData) {
  if (useMockData) go('error', 'Demo mode does not save reviews.');
  const { supabase, userId, organizationId } = await managerContext();
  const id = String(formData.get('insight_id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['approved', 'rejected', 'pending'].includes(decision)) go('error', 'Invalid review.');
  const { data, error } = await supabase
    .from('conversation_learning_insights')
    .update({ review_status: decision, reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('id');
  if (error || !data?.length) go('error', 'The review could not be saved.');
  revalidatePath('/settings/ai-learning');
  go('notice', decision === 'approved' ? 'Approved: the AI can now use this insight.' : decision === 'rejected' ? 'Rejected: the AI will ignore this insight.' : 'Moved back to review.');
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Learns from a chat export a manager uploads (WhatsApp Business AI report, zip or .txt).
 * Raw chats are parsed in memory and discarded; only insights are stored.
 */
export async function importChatExportAction(formData: FormData) {
  if (useMockData) go('error', 'Demo mode does not import chat exports.');
  const { userId, organizationId } = await managerContext();
  const upload = formData.get('export');
  if (!(upload instanceof File) || upload.size === 0) go('error', 'Choose the export file (.zip or .txt) first.');
  if (upload.size > MAX_UPLOAD_BYTES) go('error', 'The export is larger than 25 MB. Export a shorter period.');
  const buffer = Buffer.from(await upload.arrayBuffer());
  let files: ExportFile[];
  try {
    files = /\.zip$/i.test(upload.name) || buffer.readUInt32LE(0) === 0x04034b50
      ? readZipTextEntries(buffer)
      : [{ name: upload.name || 'conversation_0.txt', text: buffer.toString('utf8') }];
  } catch {
    go('error', 'The file could not be read. Upload the original export zip.');
  }
  if (!isWhatsAppBusinessAiReport(files)) {
    go('error', 'This is not a WhatsApp Business AI report. Instagram exports are coming next.');
  }
  const parsed = parseWhatsAppBusinessAiReport(files);
  if (!parsed.conversations) go('error', 'No conversations were found in the export.');
  const result = analyzeConversations(parsed.messages, { outcomes: parsed.outcomes });
  const label = `WhatsApp export: ${upload.name.slice(0, 120)} (${parsed.conversations} chats${parsed.skippedTestConversations ? `, ${parsed.skippedTestConversations} test chats skipped` : ''})`;
  await saveLearningRun({ organizationId, userId, result, source: 'whatsapp_export', sourceLabel: label, windowStart: null, windowEnd: null });
  revalidatePath('/settings/ai-learning');
  go('notice', `Learned from ${parsed.conversations} WhatsApp chats (${result.outcomeEvidence.won} reached payment). The chats themselves were not stored. Review the insights below.`);
}
