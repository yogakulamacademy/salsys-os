'use server';

import {
  closeSettledTasksAction,
  completeFollowUpAction,
  confirmLostFromTaskAction,
  snoozeFollowUpAction,
} from '@/app/actions/crm';
import { asResult } from '@/lib/action-result';

/** Follow-ups buttons that save in place with a toast (owner request, 25 Nov 2026). */
const PATHS = ['/follow-ups', '/home', '/leads', '/admissions'];

export async function completeFollowUpInline(fd: FormData) {
  return asResult(() => completeFollowUpAction(fd), 'Follow-up done.', PATHS);
}

export async function snoozeFollowUpInline(fd: FormData) {
  return asResult(() => snoozeFollowUpAction(fd), 'Follow-up moved.', PATHS);
}

export async function confirmLostFromTaskInline(fd: FormData) {
  return asResult(() => confirmLostFromTaskAction(fd), 'Moved to Lost.', PATHS);
}

export async function closeSettledTasksInline(fd: FormData) {
  return asResult(() => closeSettledTasksAction(fd), 'Settled follow-ups closed.', PATHS);
}
