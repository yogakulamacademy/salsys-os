const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('admissions: demand and stale payments are org-scoped; team members see their own leads', () => {
  const d = read('lib/admissions-story-data.ts');
  assert.ok((d.match(/\.eq\("organization_id", organizationId\)/g) || []).length >= 3);
  assert.match(d, /if \(isAdmin !== true\) q = q\.eq\("owner_user_id", auth\.user!\.id\)/);
});

test('pipeline board renders a page of cards per column', () => {
  const b = read('components/crm/pipeline-board-studio.tsx');
  assert.match(b, /const CARDS_PER_STEP = 30;/);
  assert.match(b, /stageItems\.slice\(0, shownPerStage\[stage\] \?\? CARDS_PER_STEP\)/);
});
