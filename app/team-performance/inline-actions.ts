'use server';

import { assignTeamPerformanceLeadAction } from '@/app/team-performance/actions';
import { asResult } from '@/lib/action-result';

// Saves in place with a toast instead of reloading the page (owner request, 25 Nov 2026).
const PATHS = ['/team-performance', '/leads'];

export async function assignTeamPerformanceLeadInline(fd: FormData) {
  return asResult(() => assignTeamPerformanceLeadAction(fd), 'Lead assigned.', PATHS);
}
