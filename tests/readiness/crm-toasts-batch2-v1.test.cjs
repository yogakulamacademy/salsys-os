const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

test('batch 2 forms save in place with toasts', () => {
  const cases = {
    'app/course-management/page.tsx': ['setCourseBatchEnrollmentStateInline', 'setCourseBatchActiveStateInline', 'updateCourseBatchAdminInline'],
    'components/course-management-selector.tsx': ['updateCourseInline'],
    'app/data-quality/page.tsx': ['dismissIdentityResolutionConflictInline', 'mergeIdentityResolutionConflictInline'],
    'components/lead-owner-control.tsx': ['assignLeadOwnerInline'],
    'components/team-assignment-panel.tsx': ['assignLeadOwnerInline'],
    'app/team-performance/page.tsx': ['assignTeamPerformanceLeadInline'],
    'app/dashboard/page.tsx': ['completeDashboardFollowUpInline', 'snoozeDashboardFollowUpInline'],
  };
  for (const [file, names] of Object.entries(cases)) {
    const src = read(file);
    for (const n of names) assert.match(src, new RegExp(`ToastForm[^>]*action=\\{${n}\\}`), `${file} ${n}`);
  }
  // Creating a course or batch still opens the new item.
  assert.match(read('components/course-management-selector.tsx'), /<form action=\{createCourseAction\}/);
  assert.match(read('lib/action-result.ts'), /full sentence/);
});
