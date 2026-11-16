const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

test('managers assign the owner from the header; others see read-only text', () => {
  const owner = read('components/inbox-header-owner.tsx');
  assert.match(owner, /if \(!canAssign \|\| mock\)/);
  assert.match(owner, /assignConversationOwnerAction\.bind\(null, leadId\)/);
  assert.match(owner, /id="inbox-header-owner"/);
  assert.match(owner, /requestSubmit\(\)/);
  const page = read('app/conversations/page.tsx');
  assert.match(page, /<InboxHeaderOwner[\s\S]*canAssign=\{team\.canManageAssignments\}/);
});

test('one place to assign: overview owner is read-only and the duplicate ownership panel is gone', () => {
  const page = read('app/conversations/page.tsx');
  assert.match(page, /candidates=\{team\.assignmentCandidates\} canAssign=\{false\}/);
  assert.doesNotMatch(page, /id="inbox-assignment"/);
  assert.doesNotMatch(page, /ConversationTeamControls/);
  assert.doesNotMatch(read('components/inbox-quick-actions.tsx'), /inbox-assignment/);
});

test('header snooze offers durations and a way back; banner shows while snoozed', () => {
  const actions = read('components/inbox-header-actions.tsx');
  for (const v of ['"1h"', '"4h"', '"tomorrow"', '"week"', '"clear"']) assert.ok(actions.includes(`value=${v}`), v);
  assert.match(actions, /href=\{`\/leads\/\$\{leadId\}`\}/);
  assert.doesNotMatch(actions, /Snooze for 1 hour/);
  const banner = read('components/inbox-snoozed-banner.tsx');
  assert.match(banner, /name="snooze_for" value="clear"/);
  assert.match(read('app/conversations/page.tsx'), /isSnoozedNow && selected\.snoozedUntil \?/);
});
