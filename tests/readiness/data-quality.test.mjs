import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { courseSuggestions, dqHeadline, isDataQuality, pctText } from '../../lib/data-quality.ts';
import { mentionedCourse } from '../../lib/person-checks.ts';

const courses = [['sh', 'Sound Healing Level 1'], ['pn', '85-Hour Prenatal & Postnatal Yoga TTC'], ['y2', '200-Hour Yoga Teacher Training']].map(([id, name]) => ({ id, name }));
const lead = (id, words) => ({ leadId: id, name: id, stage: 'engaged', channel: 'instagram', createdAt: '2026-11-20T00:00:00Z', lastIn: words, words });
const base = { open: 100, noCourse: 4, noValue: 4, noOwner: 98, persons: 100, personsVerified: 93, noOwnerSample: [], conflicts: [] };

test('suggestions: the ad first, then their own words, otherwise no clue', () => {
  const d = { ...base,
    adSuggestions: [{ leadId: 'a', courseId: 'sh', courseName: 'Sound Healing Level 1', n: 12, total: 12, adTitle: 'Instagram post: Where the river flows, the mind..._Group_1' },
                    { leadId: 'b', courseId: 'sh', courseName: 'Sound Healing Level 1', n: 12, total: 12, adTitle: 'x' }],
    noCourseLeads: [lead('a', 'What is the course fee?'), lead('b', 'No, I am looking for online.'), lead('c', 'I want the 200 hour TTC'), lead('d', 'What is the course fee?')] };
  assert.ok(isDataQuality(d));
  const { fill, noClue } = courseSuggestions(d, courses, mentionedCourse);
  assert.deepEqual(fill.map((r) => [r.leadId, r.courseId, r.source]), [['a', 'sh', 'ad'], ['b', 'sh', 'ad'], ['c', 'y2', 'words']]);
  assert.match(fill[0].why, /^Clicked “Where the river flows, the mind\.\.\.” · 12 of 12 from this ad chose it$/);
  assert.equal(fill[0].caution, null);
  assert.equal(fill[1].caution, 'they mentioned online');
  assert.deepEqual(noClue.map((l) => l.leadId), ['d']);
  assert.match(dqHeadline(d, fill.length), /^100 open enquiries: 4 have no course \(so no value either\) and only 2 have an owner\. 3 of the missing courses/);
});

test('percent text keeps small shares readable', () => {
  assert.equal(pctText(7 / 1637), '0.4%');
  assert.equal(pctText(0.62), '62%');
  assert.equal(pctText(0), '0%');
});

test('wiring: admin-only loader, read-only function, only the course changes', () => {
  const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  assert.match(read('lib/data-quality-data.ts'), /can_manage_organization/);
  const sql = read('supabase/migrations/20261125130000_data_quality_v1.sql');
  assert.match(sql, /grant execute on function public\.data_quality_v1\(uuid\) to service_role/);
  assert.match(sql, /b\.total >= 3 and b\.n::numeric \/ b\.total >= 0\.9/);
  assert.doesNotMatch(sql, /\b(insert|update|delete)\b/i);
  const actions = read('app/data-quality/actions.ts');
  assert.match(actions, /p_patch: \{ interested_course_id: courseId \}/);
  assert.match(actions, /dismiss_identity_resolution_conflict_v1/);
});
