import test from 'node:test';
import assert from 'node:assert/strict';

import { detectFollowup, localTime, safeTimeZone } from '../../lib/followup-detection.ts';

// Tue 17 Nov 2026, 08:00 India time.
const NOW = new Date('2026-11-17T02:30:00Z');
const ist = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replaceAll(',', '');
const run = (body, extra = {}) => detectFollowup({ body, now: NOW, timeZone: 'Asia/Kolkata', channel: 'whatsapp', ...extra });

test('vague "I will get back" messages from real chats become a 3-day follow-up', () => {
  for (const body of ['Will let you know', "I'll think about it and get back . Thank you", 'Ok I will plan and get back to you', 'Namaste!🙏 Let me decide And will let you know', 'Ok mam I will get back to u']) {
    const r = run(body);
    assert.equal(r.isFollowup, true, body);
    assert.equal(r.kind, 'will_get_back', body);
    assert.equal(ist(r.dueAt), 'Fri 20 Nov 10:00', body);
  }
});

test('named times are honoured in the lead time zone', () => {
  assert.equal(ist(run('I will confirm u till tomorrow').dueAt), 'Wed 18 Nov 10:00');
  assert.equal(ist(run('Oh ok, i will let you know in a couple of days').dueAt), 'Thu 19 Nov 10:00');
  assert.equal(ist(run('Message me next week').dueAt), 'Mon 23 Nov 10:00');
  assert.equal(ist(run("I'll decide after my salary on the 1st").dueAt), 'Wed 2 Dec 10:00');
  const month = run('Hello Ma’am am currently unable to arrange the amount I’ll need about a month to arrange the funds');
  assert.equal(month.kind, 'requested_time');
  assert.equal(ist(month.dueAt), 'Thu 17 Dec 10:00');
});

test('call requests become call follow-ups at the asked hour', () => {
  const r = run('Call me tomorrow evening');
  assert.equal(r.method, 'call');
  assert.equal(r.kind, 'call_request');
  assert.equal(ist(r.dueAt), 'Wed 18 Nov 18:00');
  assert.equal(ist(run('please call me friday at 5').dueAt), 'Fri 20 Nov 17:00');
});

test('"not now / maybe later / next year" become a gentle check-in', () => {
  assert.equal(run('not now…may be later. thank you').kind, 'not_now');
  assert.equal(ist(run('Maybe at a later point.').dueAt), 'Thu 17 Dec 10:00');
  assert.equal(run('Will plan later next year..').kind, 'not_now');
});

test('questions and unrelated text are not follow-ups', () => {
  for (const body of ['Can I join later ?', 'and what are the fees for 300 hour later on?', 'What is the fee for 200 hour TTC', 'Tomorrow?', 'Hi']) {
    assert.equal(run(body).isFollowup, false, body);
  }
});

test('Instagram leads get an Instagram follow-up; a time in the past moves to 2 hours from now', () => {
  assert.equal(run('will get back to you', { channel: 'instagram' }).method, 'instagram');
  const late = detectFollowup({ body: 'call me today', now: new Date('2026-11-17T15:00:00Z'), timeZone: 'Asia/Kolkata', channel: 'whatsapp' });
  assert.equal(late.isFollowup, true);
  assert.ok(late.dueAt.getTime() > Date.parse('2026-11-17T15:00:00Z'));
});

test('time zones: a European lead gets 10:00 their time; bad zones fall back to India', () => {
  const r = detectFollowup({ body: 'Message me tomorrow', now: NOW, timeZone: 'Europe/Brussels', channel: 'whatsapp' });
  assert.equal(r.dueAt.toISOString(), '2026-11-18T09:00:00.000Z');
  assert.equal(safeTimeZone('Not/AZone'), 'Asia/Kolkata');
  assert.equal(localTime(NOW, 'Asia/Kolkata', 0, 10).toISOString(), '2026-11-17T04:30:00.000Z');
});

test('real-chat false matches stay out; same-day promises land today', () => {
  for (const body of [
    'Any weekend session',
    'The time you have shared is a bit not comfortable for me... except on satirday and sunday',
    '3 days i can come and attend, after i can take online classes',
    'Is there any classes available fall in last two weeks in Dec month',
    'I have my class today',
    'Thanks for letting me know. I was thinking of buying singing bowl.',
  ]) assert.equal(run(body).isFollowup, false, body);
  assert.equal(ist(run('Okay i will let you know till evening').dueAt), 'Tue 17 Nov 18:00');
  assert.equal(run('Okay will let you know by night. Till then you can share your payment details.').dueAt.getTime() > NOW.getTime(), true);
  assert.equal(run('I need some time to think about it first.').kind, 'will_get_back');
  assert.equal(run('No, not yet decided.').kind, 'will_get_back');
  assert.equal(run('Yes I am but not immediately cause i have just finished my 200 hrs course last month').kind, 'not_now');
  assert.equal(ist(run('Message me on Friday').dueAt), 'Fri 20 Nov 10:00');
});
