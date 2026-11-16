import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildQuickReplies, cleanFirstName, followupDueAt, followupTitle } from '../../lib/inbox-quick-replies.ts';

test('greets by first name only when it looks like a name', () => {
  assert.equal(cleanFirstName('joelle'), 'Joelle');
  assert.equal(cleanFirstName('ankul___jatav___ji'), null);
  assert.equal(cleanFirstName('9002_sohit_651'), null);
  assert.equal(cleanFirstName(''), null);
});

test('fees reply uses real batch price and dates when we have them', () => {
  const r = buildQuickReplies({
    firstName: 'Joelle',
    courseName: '200 Hour YTT',
    batches: [
      { startDate: '2026-12-01', location: 'Kerala', mode: null, currency: 'USD', price: 1450 },
      { startDate: '2027-01-05', location: 'Mysore', mode: null, currency: 'USD', price: 1250 },
    ],
  });
  assert.match(r.fees, /^Namaste Joelle! The 200 Hour YTT fee is \$1,450 for the Kerala batch starting 1 Dec 2026\./);
  assert.match(r.fees, /• 5 Jan 2027 · Mysore/);
  assert.doesNotMatch(r.fees, /\[fee\]/);
  assert.match(r.dates, /Here are the next 200 Hour YTT batches:\n• 1 Dec 2026 · Kerala/);
});

test('missing data becomes visible placeholders, never invented numbers', () => {
  const r = buildQuickReplies({ firstName: 'kiran_kendre', courseName: 'Not selected', batches: [] });
  assert.match(r.fees, /^Namaste! The \[course\] fee is \[fee\]\./);
  assert.match(r.dates, /• \[batch dates\]/);
  assert.match(r.whatsapp, /WhatsApp number with the country code/);
});

test('follow-up times are in India time', () => {
  const now = new Date('2026-11-16T18:00:00Z'); // Mon 23:30 IST
  assert.equal(followupDueAt('2h', now).toISOString(), '2026-11-16T20:00:00.000Z');
  assert.equal(followupDueAt('tomorrow', now).toISOString(), '2026-11-17T04:30:00.000Z'); // Tue 10:00 IST
  assert.equal(followupDueAt('3d', now).toISOString(), '2026-11-19T04:30:00.000Z');
  assert.equal(followupDueAt('week', now).toISOString(), '2026-11-23T04:30:00.000Z'); // next Mon 10:00 IST
  const sunday = new Date('2026-11-22T06:00:00Z'); // Sun 11:30 IST
  assert.equal(followupDueAt('week', sunday).toISOString(), '2026-11-23T04:30:00.000Z');
  assert.equal(followupTitle('call'), 'Call follow-up');
});

test('quick actions fill the reply box as a team draft, not an AI draft', () => {
  const qa = readFileSync(new URL('../../components/inbox-quick-actions.tsx', import.meta.url), 'utf8');
  assert.match(qa, /source: "quick_reply"/);
  assert.match(qa, /name="return_to" value="conversations"/);
  assert.match(qa, /name="stage" value="lost"/);
  for (const f of ['conversation-safe-composer.tsx', 'conversation-composer.tsx']) {
    const c = readFileSync(new URL(`../../components/${f}`, import.meta.url), 'utf8');
    assert.match(c, /setCopilotAssisted\(detail\.source !== "quick_reply"\)/, f);
  }
  const panel = readFileSync(new URL('../../components/conversation-intelligence-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /FOLLOWUP_WHENS\.map/);
  assert.match(panel, /quickSchedule\(followupDueAt\(value\), label\)/);
});
