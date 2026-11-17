import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cleanAdTitle, courseFromText, describeSource, needsHumanEyes, parseInstagramSourceEvent, readStoredShareBody } from '../../lib/lead-source-context.ts';

const COURSES = [
  { name: '200-Hour Yoga Teacher Training', code: '200H-YTT' }, { name: 'Online 200-Hour Yoga Teacher Training', code: 'ONLINE-200H' },
  { name: 'Sound Healing Level 1', code: 'SOUND-L1' }, { name: 'Sound Healing Meditation Master Course', code: 'SOUND-MASTER' },
  { name: 'Online Face Yoga TTC', code: 'FACE-YOGA' }, { name: '85-Hour Prenatal & Postnatal Yoga TTC', code: '85H-PRENATAL' },
  { name: 'Online Prenatal & Postnatal TTC', code: 'ONLINE-PRENATAL' }, { name: 'Online Kids Yoga TTC', code: 'KIDS-YOGA' },
];

test('reads the ad a lead replied to, as Instagram sends it', () => {
  const event = { sender: { id: '1' }, recipient: { id: '2' }, message: { mid: 'm1', text: 'What is the course fee?', referral: { type: 'OPEN_THREAD', ad_id: '999', source: 'ADS', ads_context_data: { post_id: '42', ad_title: 'Instagram post: ✨ Sound Healing Meditation Course..._Group_1shadow' } } } };
  const s = parseInstagramSourceEvent(event);
  assert.equal(s.kind, 'ad');
  assert.equal(s.adId, '999');
  assert.equal(s.title, '✨ Sound Healing Meditation Course…');
  assert.equal(courseFromText(s.title, COURSES).code, 'SOUND-L1');
});

test('ad titles map to the right course', () => {
  const c = (t) => courseFromText(cleanAdTitle(t), COURSES)?.code ?? null;
  assert.equal(c('Instagram post: ✨ Face Yoga Teacher Training...'), 'FACE-YOGA');
  assert.equal(c('Instagram post: 🤰 Become a Certified Prenatal &..._Group_1'), '85H-PRENATAL');
  assert.equal(c('Instagram post: What if just 24 days could..._Group_1'), '200H-YTT');
  assert.equal(c('Instagram post: 🎶 What if sound could become your..._Group_1'), 'SOUND-L1');
  assert.equal(c('Instagram post: Where the river flows, the mind..._Group_1'), null);
});

test('reads shared reels and story replies', () => {
  const reel = parseInstagramSourceEvent({ message: { mid: 'm', attachments: [{ type: 'ig_reel', payload: { url: 'https://www.instagram.com/reel/abc/', reel_video_id: '18000' } }] } });
  assert.equal(reel.kind, 'share');
  assert.equal(reel.mediaType, 'ig_reel');
  assert.equal(reel.mediaId, '18000');
  const story = parseInstagramSourceEvent({ message: { mid: 'm', text: 'wow', reply_to: { story: { id: '17', url: 'https://x' } } } });
  assert.equal(story.kind, 'story_reply');
  assert.equal(parseInstagramSourceEvent({ message: { mid: 'm', text: 'hi' } }), null);
});

test('a share we cannot read gets human eyes; one with a caption does not', () => {
  assert.equal(needsHumanEyes('Shared an Instagram post', null), true);
  assert.equal(needsHumanEyes('Shared an Instagram reel\nhttps://www.instagram.com/reel/abc/', null), true);
  assert.equal(needsHumanEyes('[Instagram ig_story message]', null), true);
  assert.equal(needsHumanEyes('Shared an Instagram post\n✨ Sound Healing Meditation Course in Mysore', null), false);
  assert.equal(needsHumanEyes('Shared an Instagram reel\nhttps://www.instagram.com/reel/abc/', 'Our 200-hour TTC in Mysore'), false);
  assert.equal(needsHumanEyes('What is the fee?', null), false);
  assert.equal(readStoredShareBody('Shared an Instagram post\nWhat if just 24 days could').caption, 'What if just 24 days could');
});

test('summary line for people and for the AI', () => {
  const line = describeSource({ ad: { kind: 'ad', adId: '1', title: '✨ Face Yoga Teacher Training…', postId: null, course: { name: 'Online Face Yoga TTC' } }, latestShare: { kind: 'share', mediaType: 'ig_reel', url: null, mediaId: null, caption: null, readable: false, course: null } });
  assert.match(line, /Came from the Instagram ad "✨ Face Yoga Teacher Training…" \(looks like Online Face Yoga TTC\)/);
  assert.match(line, /shared a reel that we cannot see/);
});

test('wiring: copilot uses the source, refuses unreadable shares, never treats captions as facts', () => {
  const copilot = readFileSync(new URL('../../app/conversations/copilot-actions.ts', import.meta.url), 'utf8');
  assert.match(copilot, /needsHumanEyes\(latestInbound\.body/);
  assert.match(copilot, /SHARE_UNREADABLE/);
  assert.match(copilot, /treat ad and post captions as marketing text, not as authoritative prices, dates or offers/);
  const shadow = readFileSync(new URL('../../app/conversations/autopilot-shadow-actions.ts', import.meta.url), 'utf8');
  assert.match(shadow, /stopReason: "no_context"/);
  const data = readFileSync(new URL('../../lib/lead-source-context-data.ts', import.meta.url), 'utf8');
  assert.match(data, /rpc\("can_access_lead"/);
});
