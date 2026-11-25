'use server';

import { logLeadInteractionAction } from '@/app/actions/crm';
import { sendWhatsAppTemplateAction } from '@/app/conversations/actions';
import { updateConversationLeadContextWithActivityAction } from '@/app/conversations/context-actions';
import {
  assignConversationOwnerAction,
  changeInboxLeadStageAction,
  setConversationDoneAction,
  snoozeConversationAction,
} from '@/app/conversations/team-actions';
import { asResult, type ActionResult } from '@/lib/action-result';

/**
 * Inbox buttons that update in place (owner requests, 20 and 25 Nov 2026): no
 * page reload, a toast instead. These wrap the existing actions, which end in
 * redirect(...?notice=|error=); asResult reads the redirect, refreshes the
 * Inbox data in place and returns { ok, message }.
 */
export type InboxActionResult = ActionResult;

const INBOX = ['/conversations'];

export async function assignOwnerInline(leadId: string, fd: FormData) {
  return asResult(() => assignConversationOwnerAction(leadId, fd), 'Owner updated.', INBOX);
}

export async function snoozeInline(leadId: string, fd: FormData) {
  return asResult(() => snoozeConversationAction(leadId, fd), 'Conversation snoozed.', INBOX);
}

export async function setDoneInline(leadId: string, fd: FormData) {
  return asResult(() => setConversationDoneAction(leadId, fd), 'Conversation updated.', INBOX);
}

export async function changeStageInline(leadId: string, fd: FormData) {
  return asResult(() => changeInboxLeadStageAction(leadId, fd), 'Lead stage updated.', [...INBOX, '/leads', '/admissions']);
}

export async function logInteractionInline(leadId: string, fd: FormData) {
  return asResult(() => logLeadInteractionAction(leadId, fd), 'Contact recorded on the lead.', INBOX);
}

export async function sendWhatsAppTemplateInline(leadId: string, fd: FormData) {
  return asResult(() => sendWhatsAppTemplateAction(leadId, fd), 'WhatsApp template sent.', INBOX);
}

export async function updateLeadContextInline(leadId: string, fd: FormData) {
  return asResult(() => updateConversationLeadContextWithActivityAction(leadId, fd), 'Lead details updated.', [...INBOX, '/leads']);
}
