import test from 'node:test';
import assert from 'node:assert/strict';

import { learnPersona, fitScore, MIN_STRONG } from '../../lib/course-persona.ts';
import { buildInterestProfile } from '../../lib/interest-profile.ts';

const NOW = new Date('2026-11-20T12:00:00Z');
const at = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function profile({ price = false, back = false, asks = '' } = {}) {
  const events = price ? [{ name: 'web.pricing_viewed', at: at(1), props: { pagePath: '/courses/x.php' } }] : [];
  const sessions = back ? [{ startedAt: at(10) }, { startedAt: at(1) }] : price ? [{ startedAt: at(1) }] : [];
  const messages = asks ? [{ direction: 'inbound', at: at(2), body: asks }] : [];
  return buildInterestProfile({ now: NOW, coursePages: [], events, sessions, messages });
}

const lead = (i, stage, extra = {}) => ({
  leadId: `l${i}`, courseId: 'c1', stage, country: 'India', channel: 'instagram',
  profile: profile({ price: true, back: i % 2 === 0, asks: 'what is the fee and next batch date?' }), ...extra,
});

test('too few good outcomes: no persona is invented', () => {
  assert.equal(learnPersona([lead(1, 'qualified'), lead(2, 'engaged')]), null);
});

test('provisional persona when real conversions are few, and it says so', () => {
  const p = learnPersona([lead(1, 'qualified'), lead(2, 'high_intent'), lead(3, 'enrolled'), lead(4, 'qualified'), lead(5, 'payment_pending'), lead(6, 'engaged')]);
  assert.equal(p.outcome, 'provisional');
  assert.equal(p.sampleSize, 5);
  assert.equal(p.countries[0].value, 'india');
  assert.ok(p.topics.some((t) => t.value === 'fees'));
  assert.equal(p.behaviour.sawPrice, 1);
});

test('strong persona uses only real conversions once there are enough', () => {
  const leads = Array.from({ length: MIN_STRONG }, (_, i) => lead(i, 'enrolled', { country: 'Germany' }));
  leads.push(...Array.from({ length: 20 }, (_, i) => lead(100 + i, 'qualified', { country: 'India' })));
  const p = learnPersona(leads);
  assert.equal(p.outcome, 'strong');
  assert.equal(p.sampleSize, MIN_STRONG);
  assert.equal(p.countries[0].value, 'germany');
});

test('fit: a lead like the persona scores high with reasons; an unlike one scores low', () => {
  const persona = learnPersona(Array.from({ length: 8 }, (_, i) => lead(i, 'qualified')));
  const like = fitScore({ country: 'India', channel: 'instagram', profile: profile({ price: true, back: true, asks: 'fees for next batch?' }) }, persona);
  const unlike = fitScore({ country: 'Brazil', channel: 'email', profile: profile() }, persona);
  assert.ok(like.score >= 70, `like ${like.score}`);
  assert.equal(like.band, 'strong');
  assert.ok(like.reasons.length >= 3);
  assert.ok(unlike.score < 25, `unlike ${unlike.score}`);
  assert.equal(unlike.band, 'weak');
  assert.ok(like.score <= 100);
});

import { personaAdvice } from '../../lib/course-persona.ts';

test('advice comes from the persona numbers and never offers a discount', () => {
  const base = { version: 1, outcome: 'provisional', sampleSize: 34, countries: [], websiteSample: 0, behaviour: { sawPrice: 0, cameBack: 0, readTwoMinutes: 0, contactedYou: 0, medianVisits: 0 } };
  const a = personaAdvice({ ...base, channels: [{ value: 'instagram', share: 0.97 }], topics: [{ value: 'certification', share: 0.53 }, { value: 'discount', share: 0.24 }] });
  assert.match(a, /Mention the certificate early: 53% ask about it\./);
  assert.match(a, /24% ask for a discount: anything beyond the standard offer goes to a person\./);
  assert.match(a, /Almost all come through Instagram\./);
  assert.doesNotMatch(a, /offer (them )?a discount|give .*discount/i);
  assert.equal(personaAdvice({ ...base, channels: [], topics: [] }), 'Not enough detail yet to say more.');
});
