const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Enrollments crashed once real rows existed: it asked for leads.lead_name, which isn't a column.
test('Enrollments reads only real lead columns', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib/enrollments-data.ts'), 'utf8');
  assert.match(src, /\.select\("id, lead_code, display_name, current_stage"\)/);
  assert.doesNotMatch(src, /lead_name/);
});
