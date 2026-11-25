'use server';

import { completeDashboardFollowUpAction, snoozeDashboardFollowUpAction } from '@/app/dashboard/actions';
import { asResult } from '@/lib/action-result';

// Saves in place with a toast instead of reloading the page (owner request, 25 Nov 2026).
const PATHS = ['/dashboard', '/follow-ups', '/home'];

export async function completeDashboardFollowUpInline(fd: FormData) {
  return asResult(() => completeDashboardFollowUpAction(fd), 'Follow-up done.', PATHS);
}

export async function snoozeDashboardFollowUpInline(fd: FormData) {
  return asResult(() => snoozeDashboardFollowUpAction(fd), 'Follow-up moved.', PATHS);
}
