'use server';

import { dismissIdentityResolutionConflictAction, mergeIdentityResolutionConflictAction } from '@/app/actions/identity-resolution';
import { asResult } from '@/lib/action-result';

// Saves in place with a toast instead of reloading the page (owner request, 25 Nov 2026).
const PATHS = ['/data-quality', '/leads', '/personas'];

export async function dismissIdentityResolutionConflictInline(fd: FormData) {
  return asResult(() => dismissIdentityResolutionConflictAction(fd), 'Marked as different people.', PATHS);
}

export async function mergeIdentityResolutionConflictInline(fd: FormData) {
  return asResult(() => mergeIdentityResolutionConflictAction(fd), 'Merged into one person.', PATHS);
}
