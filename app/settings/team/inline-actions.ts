'use server';

import { createEmployeeAction, setEmployeeActiveAction } from '@/app/settings/team/actions';
import { asResult } from '@/lib/action-result';

// Saves in place with a toast instead of reloading the page (owner request, 25 Nov 2026).
const PATHS = ['/settings/team', '/team-performance'];

export async function createEmployeeInline(fd: FormData) {
  return asResult(() => createEmployeeAction(fd), 'Team member created.', PATHS);
}

export async function setEmployeeActiveInline(fd: FormData) {
  return asResult(() => setEmployeeActiveAction(fd), 'Team member updated.', PATHS);
}
