import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdvisor, coursePages, measureFunnel, normalise, PRESETS } from '../../lib/funnel-advisor.ts';

const P = (course, cls, replied, qualified, paid, n) => ({ course, cls, replied, qualified, paid, n });
const data = normalise({
  from: '2026-08-28T00:00:00Z', to: '2026-11-26T00:00:00Z',
  people: [
    P(null, 'instagram', true, false, false, 1300), P(null, 'instagram', true, true, false, 170), P(null, 'instagram', true, true, true, 3),
    P(null, 'website_search', false, false, false, 30), P(null, 'website_search', true, true, false, 3),
    P(null, 'website_other', true, true, true, 5), P(null, 'website_ai', false, false, false, 8),
    P('c200', 'instagram', true, false, false, 250), P('c200', 'instagram', true, true, false, 41), P('c200', 'website_search', false, false, false, 10),
    P('cpre', 'instagram', true, false, false, 200), P('cpre', 'instagram', true, true, false, 55), P('cpre', 'instagram', true, true, true, 1),
    P('conl', 'website_other', true, true, true, 5), P('conl', 'instagram', true, false, false, 30),
  ],
  pages: [
    { path: '/courses/mysore/200-hour-yoga-teacher-training-in-mysore.php', visits: 78, leads: 1 },
    { path: '/courses/kerala/200-hour-yoga-teacher-training-in-kerala.php', visits: 56, leads: 7 },
    { path: '/courses/mysore/prenatal-yoga-teacher-training-in-mysore.php', visits: 25, leads: 8 },
    { path: '/courses/online/online-prenatal-yoga-teacher-training.php', visits: 148, leads: 9 },
    { path: '/courses/kerala/sound-healing-meditation-course-level-1-in-kerala.php', visits: 32, leads: 0 },
  ],
  searchPages: [{ path: '/courses/mysore/200-hour-yoga-teacher-training-in-mysore.php', views: 900, clicks: 15, position: 33 }],
  searchTerms: [
    { query: '200 hour yoga teacher training bangalore', views: 174, clicks: 2, position: 5.6 },
    { query: 'prenatal yoga course', views: 54, clicks: 5, position: 8.2 },
    { query: 'yoga teacher training course', views: 314, clicks: 4, position: 11.2 },
  ],
  mediums: [{ source: 'google', medium: 'organic', visits: 1410 }, { source: 'chatgpt.com', medium: 'ai-assistant', visits: 128 }],
  courses: [
    { id: 'c200', name: '200-Hour Yoga Teacher Training', next: '2026-12-07', places: ['Kerala', 'Mysore'] },
    { id: 'cpre', name: '85-Hour Prenatal & Postnatal Yoga TTC', next: '2026-12-01', places: ['Kerala', 'Mysore'] },
    { id: 'conl', name: 'Online Prenatal & Postnatal TTC', next: '2026-12-10', places: ['Online'] },
  ],
  switches: [{ asked: '85-Hour Prenatal & Postnatal Yoga TTC', bought: 'Online Prenatal & Postnatal TTC', n: 3 }],
});

test('course pages are matched from the course name', () => {
  const paths = data.pages.map((p) => p.path);
  assert.deepEqual(coursePages('200-Hour Yoga Teacher Training', paths).length, 2);
  assert.deepEqual(coursePages('85-Hour Prenatal & Postnatal Yoga TTC', paths), ['/courses/mysore/prenatal-yoga-teacher-training-in-mysore.php']);
  assert.deepEqual(coursePages('Online Prenatal & Postnatal TTC', paths), ['/courses/online/online-prenatal-yoga-teacher-training.php']);
});

test('an SEO funnel measures search terms, pages and Google enquiries', () => {
  const seo = { ...PRESETS[0].def, courseId: 'c200', terms: ['200 hour yoga teacher training'] };
  const m = measureFunnel(seo, data);
  assert.deepEqual(m.steps.map((s) => s.value), [174, 2, 134, 10, 0, 0]);
  assert.equal(m.steps[1].rate, 1.1);
  assert.ok(m.steps[2].adds);
  assert.equal(m.weakest, 4);
  assert.match(m.fix, /reply once/);
});

test('a people funnel follows one channel', () => {
  const f = { kind: 'general', name: 'x', courseId: 'c200', goal: null, steps: ['enq_instagram', 'replied', 'qualified', 'paid'], pages: [], terms: [], status: 'live' };
  const m = measureFunnel(f, data);
  assert.deepEqual(m.steps.map((s) => s.value), [291, 291, 41, 0]);
  assert.equal(m.weakest, 3);
  assert.match(m.fix, /early-bird/);
});

test('advisor: follow-ups, page leaks, switches and SEO', () => {
  const a = buildAdvisor(data, '2026-11-26');
  assert.deepEqual(a.top.map((s) => s.id), ['follow', 'switch', 'pagefix']);
  assert.match(a.top[0].title, /^Follow up 96 Qualified people/);
  const y = a.courses.find((c) => c.id === 'c200');
  assert.ok(y.suggestions.some((s) => s.type === 'page' && /mysore/.test(s.title)));
  assert.ok(y.suggestions.some((s) => s.type === 'search' && /200 hour/.test(s.title)));
  assert.equal(a.searches[0].query, 'yoga teacher training course');
  assert.match(a.headline[0].text, /^Online Prenatal & Postnatal TTC brings the most payments: 5 of 8/);
});
