'use server';

import { assignLeadOwnerAction } from '@/app/actions/lead-assignment';
import { asResult } from '@/lib/action-result';

// Saves in place with a toast instead of reloading the page (owner request, 25 Nov 2026).
const PATHS = ['/leads', '/team-performance', '/admissions', '/conversations', '/settings/team'];

export async function assignLeadOwnerInline(fd: FormData) {
  return asResult(() => assignLeadOwnerAction(fd), 'Owner updated.', PATHS);
}
