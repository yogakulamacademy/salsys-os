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
  const copilot = readFileSync(new URL('../../lib/copilot-core.ts', import.meta.url), 'utf8');
  assert.match(copilot, /needsHumanEyes\(latestInbound\.body/);
  assert.match(copilot, /SHARE_UNREADABLE/);
  assert.match(copilot, /treat ad and post captions as marketing text, not as authoritative prices, dates or offers/);
  const shadow = readFileSync(new URL('../../app/conversations/autopilot-shadow-actions.ts', import.meta.url), 'utf8');
  assert.match(shadow, /stopReason: "no_context"/);
  const data = readFileSync(new URL('../../lib/lead-source-context-data.ts', import.meta.url), 'utf8');
  assert.match(data, /rpc\("can_access_lead"/);
});

test('an ad title is matched to our own post by its caption start', async () => {
  const { matchCaptionByPrefix } = await import('../../lib/lead-source-context.ts');
  const captions = [
    'Where the river flows, the mind slows. Join our 200-Hour Yoga Teacher Training in Kerala this January. #yogattc',
    '✨ Sound Healing Meditation Course in Mysore ✨ Step into the healing world of sound',
    'Morning practice by the river',
  ];
  const full = matchCaptionByPrefix('Instagram post: Where the river flows, the mind..._Group_1', captions);
  assert.match(full, /200-Hour Yoga Teacher Training in Kerala/);
  assert.equal(courseFromText(full, COURSES).code, '200H-YTT');
  assert.match(matchCaptionByPrefix('Instagram post: ✨ Sound Healing Meditation Course..._Group_1shadow', captions), /Mysore/);
  assert.equal(matchCaptionByPrefix('Instagram post: Morning...', captions), null); // too short to be sure
  assert.equal(matchCaptionByPrefix('Instagram post: A caption we never posted here...', captions), null);
});

test('drafts use Course Management batches for the course named in the latest message, else the lead course, share, then ad', async () => {
  const { inferCourseForFacts } = await import('../../lib/lead-source-context.ts');
  const courses = [
    { id: 'c-face', code: 'FACE-YOGA', name: 'Online Face Yoga TTC' },
    { id: 'c-pre', code: 'ONLINE-PRENATAL', name: 'Online Prenatal & Postnatal TTC' },
    { id: 'c-300o', code: 'ONLINE-300H', name: 'Online 300-Hour Yoga Teacher Training' },
    { id: 'c-200', code: '200H-YTT', name: '200-Hour Yoga Teacher Training' },
  ];
  const base = { interestedCourseId: null, latestMessage: 'When does it start?', sharedCourseId: null, adCourseId: null, courses };
  assert.deepEqual(inferCourseForFacts({ ...base, interestedCourseId: 'c-x' }), { courseId: 'c-x', source: 'lead' });
  assert.deepEqual(inferCourseForFacts({ ...base, interestedCourseId: 'c-x', latestMessage: 'I want details for Online 300 hour YTT' }), { courseId: 'c-300o', source: 'message' });
  assert.deepEqual(inferCourseForFacts({ ...base, interestedCourseId: 'c-x', latestMessage: 'ok thanks' }), { courseId: 'c-x', source: 'lead' });
  assert.deepEqual(inferCourseForFacts({ ...base, latestMessage: 'face yoga next batch dates?' , adCourseId: 'c-200' }), { courseId: 'c-face', source: 'message' });
  assert.deepEqual(inferCourseForFacts({ ...base, latestMessage: 'Is the online 300 hour course live?' }), { courseId: 'c-300o', source: 'message' });
  assert.deepEqual(inferCourseForFacts({ ...base, sharedCourseId: 'c-pre', adCourseId: 'c-200' }), { courseId: 'c-pre', source: 'shared_post' });
  assert.deepEqual(inferCourseForFacts({ ...base, adCourseId: 'c-200' }), { courseId: 'c-200', source: 'ad' });
  assert.equal(inferCourseForFacts({ ...base, adCourseId: 'unknown' }), null);
  assert.equal(inferCourseForFacts(base), null);
});
