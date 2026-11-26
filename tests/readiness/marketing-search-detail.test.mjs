import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthStory, buildIdeasStory, buildSearchesStory, buildTopics, isSearchDetail } from '../../lib/marketing-search-detail.ts';
import { pageLabel } from '../../lib/marketing-web.ts';

const text = (parts) => parts.map((p) => p.text).join('');
const q = (path, query, views, clicks, position) => ({ path, query, views, clicks, position });
const BLR = '/courses/bengaluru/200-hour-weekend-yoga-teacher-training-in-bengaluru.php';
const FACE = '/courses/online/online-face-yoga-teacher-training.php';
const DAILY = '/courses/yoga-classes/daily-yoga-classes-in-bengaluru.php';
const d = {
  brandToken: 'yogakulam', views: 29417, clicks: 876, viewsBefore: 27047, clicksBefore: 948, queryClicks: 401, brandClicks: 259,
  nonBrandViews: 18410, nonBrandPage1Views: 5905, dataTo: '2026-11-23',
  pageQueries: [
    q('/', 'yoga teacher training in india', 338, 1, 28.4), q('/', 'yoga teacher training india', 273, 0, 24), q('/', 'best yoga teacher training in india', 109, 0, 15.4),
    q('/', 'yoga teacher training course', 320, 3, 10.8), q('/', 'yoga courses online', 311, 0, 5.8),
    q('/', '200 hour yoga teacher training bangalore', 153, 0, 3.6), q(BLR, '200 hour yoga teacher training bangalore', 94, 3, 5.8), q('/', 'yoga teacher training bangalore', 76, 1, 6),
    q(DAILY, 'yoga classes', 148, 0, 6.8), q('/', 'yoga classes near me', 119, 2, 4.9), q(DAILY, 'pregnancy yoga classes near me', 82, 0, 11.2),
    q(FACE, 'face yoga course', 50, 3, 5), q(FACE, 'face yoga certification course', 45, 7, 4.1), q(FACE, 'face yoga teacher training course', 49, 4, 4.8),
    q(FACE, 'face yoga course online free with certificate', 51, 4, 3.8), q(FACE, 'face yoga course online', 42, 3, 5.6), q('/', 'yoga courses online', 1, 0, 6), q('/courses/online/online-nutrition-course.php', 'yoga courses online', 8, 0, 78.6),
    q('/', 'yoga teacher training in delhi', 55, 0, 5.9),
  ],
  courses: [{ name: '200-Hour Yoga Teacher Training', next: '2026-12-07' }, { name: '85-Hour Prenatal & Postnatal Yoga TTC', next: '2026-12-01' }, { name: 'Online Face Yoga TTC', next: '2026-12-15' }, { name: 'Online 200-Hour Yoga Teacher Training', next: '2026-12-15' }],
  places: ['Bengaluru - RT Nagar', 'Kerala', 'Mysore', 'Online'],
  crawl: { at: '2026-10-14T15:59:12Z', fetched: 20, discovered: 195, host: 'www.yogakulam.com', known: 195, pages: [
    { path: '/', status: 200, ms: 156, title: 'Yoga Teacher Training in India | Yogakulam Academy', titleLength: 50, descLength: 157, descShared: 0, h1: 1, words: 2174, indexable: true, reason: null },
    { path: '/contact.php', status: 200, ms: 169, title: 'Contact Us', titleLength: 10, descLength: 149, descShared: 1, h1: 1, words: 696, indexable: true, reason: null },
    { path: '/teachers.php', status: 200, ms: 447, title: 'Our Teachers', titleLength: 12, descLength: 56, descShared: 2, h1: 1, words: 1753, indexable: true, reason: null },
    { path: '/courses.php', status: 200, ms: 453, title: 'Our Courses | Yogakulam Academy', titleLength: 31, descLength: 230, descShared: 1, h1: 1, words: 974, indexable: false, reason: 'noindex' },
  ] },
  sites: [{ host: 'www.yogakulam.com', active: false }, { host: 'yogakulamacademy.com', active: true }, { host: 'yogakulam.com', active: true }],
  webHost: 'www.yogakulam.com',
  ai: [{ at: '2026-10-19T01:53:01Z', question: 'Recommend a few reputable residential yoga teacher training schools in Mysore, India.', provider: 'anthropic', host: 'yogakulamacademy.com', mentioned: false, recommended: false, others: ['A', 'B'] }],
  aiVisits: 147, aiEnquiries: 8, googleEnquiries: 36,
};
const now = Date.parse('2026-11-26T10:00:00Z');

test('topics group searches by course, place and intent', () => {
  assert.ok(isSearchDetail(d));
  const t = buildTopics(d, pageLabel);
  const by = Object.fromEntries(t.map((x) => [x.key, x]));
  assert.equal(by.india.views, 720);
  assert.equal(by.india.homeShare, 100);
  assert.equal(by['p-bengaluru'].views, 323);
  assert.equal(by['c-face'].clicks, 21);
  assert.equal(by['c-prenatal'].views, 82);
  assert.ok(!by['c-200']);
});

test('searches and pages', () => {
  const s = buildSearchesStory(d, pageLabel);
  assert.match(text(s.headline), /^Google showed you 29,417 times in the last 30 days and 876 people clicked\. Where Google shares the search, 2 in 3 clicks came from people searching your name\. For other searches only a third of your views are on page one, and Google often shows your Home page instead of the course page\.$/);
  assert.deepEqual(s.ranks.map((r) => r.id), ['home', 'near', 'star']);
  assert.match(text(s.ranks[0].body), /“200 hour yoga teacher training bangalore”.*Home page at #3\.6.*course page at #5\.8/);
  assert.match(s.ranks[1].title, /yoga teacher training course/);
  assert.notEqual(s.ranks[1].title, s.ranks[0].title);
  assert.match(s.ranks[2].title, /face yoga$/);
  assert.equal(s.kpis[2].value, '65%');
  assert.equal(s.kpis[3].value, '32%');
  const preg = s.near.find((r) => r.query === 'pregnancy yoga classes near me');
  assert.ok(preg.wrongPage);
  assert.equal(s.near.find((r) => r.query === 'yoga classes').wrongPage, false);
  assert.deepEqual(s.signals.map((x) => x.id), ['wrong', 'place', 'hidden']);
  assert.match(s.signals[1].title, /delhi/);
  assert.match(s.signals[2].title, /about half/);
});

test('content ideas', () => {
  const s = buildIdeasStory(d, pageLabel, 'Yogakulam Academy');
  assert.equal(s.ideas[0].key, 'india');
  assert.match(text(s.headline), /^The biggest gap is “teacher training in India”: 720 views in 30 days, 1 click, and Google shows your Home page at around position 25\./);
  assert.match(s.ideas[0].outline, /Bengaluru, Kerala, Mysore or Online \| Yogakulam Academy/);
  assert.ok(s.ideas.some((i) => i.key === 'p-bengaluru'));
  assert.doesNotMatch(s.ideas[0].meta, /1 clicks|\+ searches/);
  assert.ok(!s.ideas.some((i) => i.key === 'c-face'));
});

test('site health and AI answers', () => {
  const s = buildHealthStory(d, pageLabel, 'Yogakulam Academy', now);
  assert.match(text(s.headline), /^The last site check ran on 14 Oct and looked at 20 of 195 pages\. It found the All courses list page hidden from Google, and 2 pages with titles too short/);
  assert.match(text(s.headline), /not mentioned; that check also used yogakulamacademy\.com instead of www\.yogakulam\.com\.$/);
  assert.deepEqual(s.ranks.map((r) => r.id), ['hidden', 'titles', 'ai']);
  assert.equal(s.fixes[0].problem, 'Hidden from Google');
  assert.ok(s.fixes.some((f) => f.path === '/teachers.php' && f.problem === 'Same description as other pages'));
  assert.ok(!s.fixes.some((f) => f.path === '/contact.php' && f.problem === 'Same description as other pages'));
  assert.ok(s.crawl.stale);
  assert.deepEqual(s.signals.map((x) => x.id), ['stale']);
  assert.equal(s.siteNote, null);
  assert.equal(s.checkHost, 'yogakulam.com');
  const none = buildHealthStory({ ...d, sites: [{ host: 'other.com', active: true }] }, pageLabel, 'Yogakulam Academy', now);
  assert.equal(none.checkHost, null);
  assert.deepEqual(none.signals.map((x) => x.id), ['site']);
});

test('site health groups broken links and skips images', () => {
  const pg = (path, status, reason = null) => ({ path, status, ms: 200, title: '404 | Yogakulam Academy', titleLength: 23, descLength: 0, descShared: 0, h1: 1, words: 10, indexable: status < 300 && reason !== 'noindex', reason });
  const crawl = { ...d.crawl, at: '2026-11-26T10:00:00Z', fetched: 8, pages: [
    ...d.crawl.pages,
    pg('/courses/mysore/courses/mysore/200-hour-yoga-teacher-training-in-mysore.php', 404, 'noindex'),
    pg('/mysore/courses/mysore/sound-healing.php', 404, 'noindex'),
    pg('/courses/mysore/assets/images/gallery/courses/mysore/a.webp', 404, 'noindex'),
    pg('/careers.php', 404, 'noindex'),
    pg('/assets/images/a.webp', 200, 'non_html'),
  ] };
  const s = buildHealthStory({ ...d, crawl }, pageLabel, 'Yogakulam Academy', now);
  assert.match(text(s.headline), /^The last site check ran on 26 Nov: 4 pages open fine and 4 links lead nowhere\. It found most broken links|^The last site check ran on 26 Nov: 4 pages open fine and 4 links lead nowhere\./);
  assert.equal(s.ranks[0].id, 'broken');
  assert.match(text(s.ranks[0].body), /^3 of them repeat a folder/);
  assert.equal(s.fixes[0].label, '3 broken links with a repeated folder');
  assert.ok(s.fixes.some((f) => f.path === '/careers.php'));
  assert.ok(!s.fixes.some((f) => f.path.endsWith('.webp') && f.problem !== 'Page doesn’t open'));
  assert.ok(!s.fixes.some((f) => f.problem === 'Title too short' && f.now === '23 characters'));
});
