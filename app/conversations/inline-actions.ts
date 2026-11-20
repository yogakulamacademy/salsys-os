'use server';

import { revalidatePath } from 'next/cache';

import { logLeadInteractionAction } from '@/app/actions/crm';
import {
  assignConversationOwnerAction,
  changeInboxLeadStageAction,
  setConversationDoneAction,
  snoozeConversationAction,
} from '@/app/conversations/team-actions';
import { noticeFor } from '@/lib/inbox-notices';

/**
 * Inbox buttons that update in place (owner request, 20 Nov 2026): no page
 * navigation, a small toast instead of a banner. These wrap the existing
 * actions, which end in redirect(...?notice=|error=); the redirect is read
 * here and turned into a result, and the Inbox data is refreshed in place.
 */
export type InboxActionResult = { ok: boolean; message: string };

type Action = (formData: FormData) => Promise<unknown>;

function redirectTarget(error: unknown): string | null {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== 'string' || !digest.startsWith('NEXT_REDIRECT')) return null;
  return digest.split(';')[2] ?? '';
}

async function run(action: Action, formData: FormData, fallback: string): Promise<InboxActionResult> {
  try {
    await action(formData);
    revalidatePath('/conversations');
    return { ok: true, message: fallback };
  } catch (error) {
    const target = redirectTarget(error);
    if (target === null) {
      console.error('[inbox] inline action failed', error instanceof Error ? error.message : error);
      return { ok: false, message: 'That did not go through. Please try again.' };
    }
    const params = new URL(target, 'https://inbox.local').searchParams;
    const failure = params.get('error');
    if (failure) return { ok: false, message: failure };
    revalidatePath('/conversations');
    return { ok: true, message: noticeFor(params.get('notice')) ?? fallback };
  }
}

export async function assignOwnerInline(leadId: string, formData: FormData) {
  return run((fd) => assignConversationOwnerAction(leadId, fd), formData, 'Owner updated.');
}

export async function snoozeInline(leadId: string, formData: FormData) {
  return run((fd) => snoozeConversationAction(leadId, fd), formData, 'Conversation snoozed.');
}

export async function setDoneInline(leadId: string, formData: FormData) {
  return run((fd) => setConversationDoneAction(leadId, fd), formData, 'Conversation updated.');
}

export async function changeStageInline(leadId: string, formData: FormData) {
  return run((fd) => changeInboxLeadStageAction(leadId, fd), formData, 'Lead stage updated.');
}

export async function logInteractionInline(leadId: string, formData: FormData) {
  return run((fd) => logLeadInteractionAction(leadId, fd), formData, 'Call recorded on the lead.');
}
