'use server';

import {
  createFollowUpAction,
  logLeadContactAction,
  updateLeadStageAction,
} from '@/app/actions/crm';
import { asResult } from '@/lib/action-result';

/**
 * Lead detail forms that save in place with a toast (owner request, 25 Nov
 * 2026). Each wraps the existing action unchanged; its redirect is read by
 * asResult instead of reloading the page.
 */
const paths = (leadId: string) => [`/leads/${leadId}`, '/leads', '/admissions', '/follow-ups'];

export async function updateLeadStageInline(leadId: string, fd: FormData) {
  return asResult(() => updateLeadStageAction(leadId, fd), 'Stage updated.', paths(leadId));
}

export async function createFollowUpInline(leadId: string, fd: FormData) {
  return asResult(() => createFollowUpAction(leadId, fd), 'Follow-up scheduled.', paths(leadId));
}

export async function logLeadContactInline(leadId: string, fd: FormData) {
  return asResult(() => logLeadContactAction(leadId, fd), 'Contact recorded on the lead.', paths(leadId));
}

// Report / verify payment and refunds keep their own flow: their financial
// tests pin the error behaviour, so they are not wrapped here.
