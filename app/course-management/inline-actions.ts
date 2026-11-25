'use server';

import {
  setCourseBatchActiveStateAction,
  setCourseBatchEnrollmentStateAction,
  updateCourseAction,
  updateCourseBatchAdminAction,
} from '@/app/course-management/actions';
import { asResult } from '@/lib/action-result';

// Saves in place with a toast instead of reloading the page (owner request, 25 Nov 2026).
const PATHS = ['/course-management', '/admissions', '/leads'];

export async function updateCourseInline(fd: FormData) {
  return asResult(() => updateCourseAction(fd), 'Course saved.', PATHS);
}

export async function updateCourseBatchAdminInline(fd: FormData) {
  return asResult(() => updateCourseBatchAdminAction(fd), 'Batch saved.', PATHS);
}

export async function setCourseBatchEnrollmentStateInline(fd: FormData) {
  return asResult(() => setCourseBatchEnrollmentStateAction(fd), 'Batch enrolment updated.', PATHS);
}

export async function setCourseBatchActiveStateInline(fd: FormData) {
  return asResult(() => setCourseBatchActiveStateAction(fd), 'Batch updated.', PATHS);
}
