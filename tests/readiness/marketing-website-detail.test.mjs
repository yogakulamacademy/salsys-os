import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClicksStory, buildVisitsStory, isWebsiteDetail } from '../../lib/marketing-website-detail.ts';

const label = (p) => (p === '/' ? 'Home page' : p.split('/').pop().replace(/\.php$/, '').replace(/-/g, ' '));
const text = (parts) => parts.map((p) => p.text).join('');
const d = {
  visits: 3166, visitsBefore: 3983, engaged: 1830, dataTo: '2026-11-24',
  weeks: [{ week: '2026-11-09', visits: 602, engaged: 351 }, { week: '2026-11-16', visits: 823, engaged: 492 }, { week: '2026-11-23', visits: 240, engaged: 117 }],
  sources: [
    { source: 'google', medium: 'organic', visits: 1410, before: 1286 }, { source: '(direct)', medium: '(none)', visits: 889, before: 970 },
    { source: 'ig', medium: 'social', visits: 383, before: 306 }, { source: 'chatgpt.com', medium: 'ai-assistant', visits: 128, before: 128 },
    { source: 'yogakulam.substack.com', medium: 'referral', visits: 37, before: 71 }, { source: 'substack', medium: 'email', visits: 20, before: 29 },
    { source: 'l.instagram.com', medium: 'referral', visits: 24, before: 78 }, { source: 'gemini.google.com', medium: 'ai-assistant', visits: 11, before: 4 },
  ],
  countries: [{ country: 'India', visits: 1935, before: 2676 }, { country: 'United States', visits: 342, before: 335 }, { country: 'Germany', visits: 92, before: 32 }],
  pages: [{ path: '/', visits: 1165, leads: 25 }, { path: '/courses/mysore/200-hour-yoga-teacher-training-in-mysore.php', visits: 78, leads: 1 }, { path: '/courses/mysore/prenatal-yoga-teacher-training-in-mysore.php', visits: 25, leads: 8 }],
  webLeads: [{ source: 'chatgpt.com', n: 8 }, { source: 'direct', n: 57 }, { source: 'ig', n: 10 }, { source: 'l.instagram.com', n: 1 }, { source: 'www.google.com', n: 35 }],
  tracked: { sessions: 2784, formStarted: 228, formSent: 171 },
  forms: [{ path: '/enroll.php', started: 43, sent: 29 }, { path: '/courses/kerala/test.php', started: 17, sent: 9 }, { path: '/courses/mysore/200-hour-yoga-teacher-training-in-mysore.php', started: 12, sent: 5 }, { path: '/courses/yoga-classes/online-pregnancy-yoga-classes.php', started: 9, sent: 1 }],
  bookings: { people: 30, paymentStarted: 13, bookedNoPayment: 18, value: [{ currency: 'INR', value: 303500 }, { currency: 'USD', value: 13444 }], courses: [{ course: 'Online 200 Hour', n: 9 }], providers: [{ provider: 'icici', n: 6 }, { provider: 'paypal', n: 6 }, { provider: 'direct_upi', n: 2 }] },
  enrolled: 8,
  clicks: { since: '2026-11-20T17:19:33Z', sessions: 251, pricing: 140, faq: 16, brochure: 7, phone: 12, whatsapp: 5, email: 4 },
};

test('visits and sources', () => {
  assert.ok(isWebsiteDetail(d));
  const s = buildVisitsStory(d, label, Date.parse('2026-11-26T10:00:00Z'));
  assert.match(text(s.headline), /^3,166 visits in the last 30 days\. Google search is growing \(1,410 visits, up 10%\), but only 2\.5 in 100 of them become enquiries, against 6\.4 for people who type your address\. The total is down 21% on the month before, mostly fewer visits from Substack and email, and the last day hasn’t synced yet\.$/);
  const ig = s.sources.find((x) => x.key === 'instagram');
  assert.deepEqual([ig.visits, ig.before, ig.enquiries], [407, 384, 11]);
  assert.equal(s.sources.find((x) => x.key === 'ai').visits, 11);
  assert.deepEqual(s.ranks.map((r) => r.id), ['google', 'links', 'leak']);
  assert.equal(s.kpis[3].value, '39%');
  assert.ok(s.signals.some((x) => x.id === 'grow' && /Germany nearly tripled/.test(x.title)));
});

test('clicks and forms', () => {
  const c = buildClicksStory(d, label);
  assert.match(text(c.headline), /^30 people filled in the booking form in the last 30 days, for courses worth ₹3,03,500 and \$13,444\. 12 of them started a payment, and 18 never did\./);
  assert.deepEqual(c.ranks.map((r) => r.id), ['nopay', 'forms', 'test']);
  assert.deepEqual(c.forms.filter((f) => f.flag).map((f) => f.flag), ['test', 'leak', 'leak']);
  assert.deepEqual(c.journey.map((j) => j.value), [2784, 228, 171, 30, 12, 8]);
  assert.ok(c.journey[4].leak);
  assert.deepEqual(c.providers.map((p) => p.label), ['Card (ICICI)', 'PayPal', 'UPI']);
  assert.equal(c.clicks[0].sub, '56% of visits');
});
