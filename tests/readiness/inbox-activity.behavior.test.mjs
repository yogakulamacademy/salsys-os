import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { activityKind, activityTitle, isMessageEcho, matchesFilter } from '../../lib/inbox-activity.ts';

test('chat interactions are echoes of messages; phone and email contacts are not', () => {
  assert.equal(isMessageEcho({ activity_type: 'inbound_interaction', channel: 'instagram' }), true);
  assert.equal(isMessageEcho({ activity_type: 'outbound_interaction', channel: 'whatsapp' }), true);
  assert.equal(isMessageEcho({ activity_type: 'inbound_interaction', channel: null }), true);
  assert.equal(isMessageEcho({ activity_type: 'outbound_interaction', channel: 'phone' }), false);
  assert.equal(isMessageEcho({ activity_type: 'outbound_interaction', channel: 'email' }), false);
  assert.equal(isMessageEcho({ activity_type: 'followup_created', channel: 'whatsapp' }), false);
});

test('production activity types land in the right group', () => {
  const k = (activity_type, channel = null) => activityKind({ activity_type, channel });
  assert.equal(k('outbound_interaction', 'phone'), 'contact');
  assert.equal(k('internal_note'), 'note');
  assert.equal(k('followup_created'), 'followup');
  assert.equal(k('followup_completed'), 'followup');
  assert.equal(k('owner_assignment'), 'update');
  assert.equal(k('lead_context_updated'), 'update');
  assert.equal(k('lead_created'), 'source');
  assert.equal(k('website_form_repeat'), 'source');
  assert.equal(matchesFilter('note', 'contacts'), true);
  assert.equal(matchesFilter('source', 'updates'), true);
  assert.equal(matchesFilter('message', 'contacts'), false);
  assert.equal(matchesFilter('followup', 'all'), true);
});

test('titles read as plain English', () => {
  assert.equal(activityTitle({ activity_type: 'outbound_interaction', channel: 'phone' }), 'Call made');
  assert.equal(activityTitle({ activity_type: 'inbound_interaction', channel: 'phone' }), 'Call received');
  assert.equal(activityTitle({ activity_type: 'website_form_repeat', channel: null }), 'Submitted the website form again');
  assert.equal(activityTitle({ activity_type: 'owner_assignment', channel: null, title: 'Assigned to Arun' }), 'Assigned to Arun');
  assert.equal(activityTitle({ activity_type: 'some_new_event', channel: null }), 'Some new event');
});

test('center view: filters, log a contact that returns to Inbox, and an add-note box', () => {
  const v = readFileSync(new URL('../../components/conversation-center-view.tsx', import.meta.url), 'utf8');
  assert.match(v, /crmActivity\.filter\(\(item\) => !isMessageEcho\(item\)\)/);
  assert.match(v, /ACTIVITY_FILTERS\.map/);
  assert.match(v, /name="return_to" value="conversations"/);
  assert.match(v, /type: "internal_note", body: value/);
  assert.doesNotMatch(v, /switch the reply composer to Internal note/);
  const page = readFileSync(new URL('../../app/conversations/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /logAction=\{mock \? undefined : interactionAction\}/);
});

test('activity shows teammate names, and "Automatic" for system-written rows', () => {
  const route = readFileSync(new URL('../../app/api/leads/[id]/activity/route.ts', import.meta.url), 'utf8');
  assert.match(route, /\.from\("profiles"\)\s*\.select\("id, full_name"\)/);
  assert.match(route, /actor_name: row\.actor_id \? names\.get\(row\.actor_id\) \?\? null : null/);
  const view = readFileSync(new URL('../../components/conversation-center-view.tsx', import.meta.url), 'utf8');
  assert.match(view, /if \(item\.actor_name\) return item\.actor_name;/);
  assert.match(view, /item\.actor_id === "service_role"/);
});
