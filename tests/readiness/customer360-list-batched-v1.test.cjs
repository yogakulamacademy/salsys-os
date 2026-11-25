const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Customer 360 list reads people in batches for the visible leads, not one capped read', () => {
  const page = fs.readFileSync(path.join(__dirname, '../../app/customer-360/page.tsx'), 'utf8');
  assert.match(page, /\.in\("lead_id", chunk\)/);
  assert.match(page, /\.in\("id", chunk\)/);
  assert.match(page, /\.in\("person_id", chunk\)/);
  assert.doesNotMatch(page, /from\("person_leads"\)\s*\.select\("person_id,lead_id,resolution_method,confidence"\)\s*\.eq\("organization_id", organizationId\),/);
});
