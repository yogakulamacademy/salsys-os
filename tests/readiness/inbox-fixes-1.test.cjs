const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync('app/conversations/page.tsx', 'utf8');
const overview = fs.readFileSync('components/inbox-lead-overview.tsx', 'utf8');
const sidebar = fs.readFileSync('components/conversations-sidebar.tsx', 'utf8');
const layout = fs.readFileSync('app/conversations/layout.tsx', 'utf8');

test('stage and owner selects remount for each conversation', () => {
  assert.ok(page.includes('<InboxLeadOverview key={selected.id} leadId={selected.id}'));
});

test('phone comes from the authorized contacts RPC, never from masked values', () => {
  assert.ok(page.includes('get_admissions_lead_contacts_secure'));
  assert.ok(page.includes('!row.pii_masked'));
  assert.ok(page.includes('phone: usable(row.whatsapp) ?? usable(row.phone)'));
  assert.ok(!page.includes('href={`tel:${selected.phone'));
  assert.ok(page.includes('Boolean(selectedPhone) && await resolveTelephoneCapability(selectedId)'));
});

test('the timestamp is labelled for what it is', () => {
  assert.ok(!overview.includes('<dt>Last contacted</dt>'));
  assert.ok(overview.includes('>Last message</dt>'));
});

test('filter tabs cannot overlap and floating chrome does not cover the context panel', () => {
  assert.ok(!sidebar.includes('className="ibx-v2-tabs grid grid-cols-4"'));
  assert.ok(sidebar.includes('[&>button]:whitespace-nowrap'));
  assert.ok(layout.includes('body:has(.inbox-standalone-scope) .live-refresh-badge'));
  assert.ok(layout.includes('padding-bottom: 88px'));
});
