import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConnectionsStory, buildFormsStory, formLabel, isTrackingDetail } from '../../lib/marketing-tracking-detail.ts';
import { pageLabel } from '../../lib/marketing-web.ts';

const text = (parts) => parts.map((p) => p.text).join('');
const now = Date.parse('2026-11-26T10:55:00Z');
const days = [['12', 271, 5], ['13', 237, 3], ['14', 69, 5], ['15', 93, 8], ['16', 259, 11], ['17', 170, 10], ['18', 176, 12], ['19', 228, 6], ['20', 272, 2], ['21', 917, 0], ['22', 326, 3], ['23', 585, 9], ['24', 354, 3], ['25', 621, 8], ['26', 537, 4]]
  .map(([dd, events, forms]) => ({ day: `2026-11-${dd}`, events, forms }));
const d = {
  base: {
    website: { lastEventAt: '2026-11-26T10:48:48Z', events: 15421, rejected: 0, visits24h: 62 }, unusedSources: ['Website: yogakulamacademy.com'],
    lastWebsiteLeadAt: '2026-11-26T03:35:50Z', webLeads30d: 111, lastInstagramAt: '2026-11-26T10:36:27Z', lastWhatsAppAt: '2026-11-19T17:54:49Z',
    ga4: { status: 'completed', at: '2026-11-26T04:30:09Z', dataTo: '2026-11-25' }, gsc: { status: 'success', at: '2026-11-26T05:15:25Z', dataTo: '2026-11-23' },
    meta: { status: 'success', at: '2026-10-07T06:33:51Z', lastSuccessAt: '2026-10-07T06:33:51Z' },
    google: { status: 'failed', at: '2026-11-26T05:45:05Z', error: 'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION', lastSuccessAt: '2026-10-07T06:38:32Z' },
    visits30d: { all: 2803, tagged: 9, metaClickIds: 281, googleClickIds: 1, withLead: 142 },
  },
  days,
  sources: [
    { name: 'Website backend', type: 'api', status: 'active', lastAt: '2026-11-26T02:44:14Z', accepted: 131, rejected: 0 },
    { name: 'Website: yogakulam.com', type: 'website', status: 'active', lastAt: '2026-11-26T10:48:48Z', accepted: 15421, rejected: 0 },
    { name: 'Website: yogakulamacademy.com', type: 'website', status: 'active', lastAt: null, accepted: 0, rejected: 0 },
  ],
  counts: { formSends: 257, bookings: 99, payments: 26, lastBookingAt: '2026-11-26T02:44:13Z', leadsByChannel: { website: 111, whatsapp: 2, instagram: 1513 } },
  forms: {
    sends: 208, visits: 159, missedVisits: 21,
    byForm: [{ form: 'leadPopupForm', sends: 132, missed: 12 }, { form: 'reservationForm', sends: 33, missed: 1 }, { form: 'ykEnrollPopupForm', sends: 28, missed: 7 }, { form: 'contactfrmForm', sends: 15, missed: 1 }],
    missedPages: [{ form: 'ykEnrollPopupForm', path: '/courses/mysore/300-hour-yoga-teacher-training-in-mysore.php', n: 2 }, { form: 'leadPopupForm', path: '/', n: 2 }],
    missedDays: [{ form: 'ykEnrollPopupForm', day: '2026-10-27', n: 5 }],
    test: { path: '/courses/kerala/test.php', sends: 49 },
  },
  webLeadSources: [{ source: 'direct', n: 56 }, { source: 'www.google.com', n: 35 }, { source: 'ig', n: 10 }, { source: 'chatgpt.com', n: 8 }, { source: 'com.google.android.googlequicksearchbox', n: 1 }, { source: 'l.instagram.com', n: 1 }],
  links: { made: 110, sent: 9, opened: 4, opens: 4, since: '2026-11-19T07:45:11Z' },
};

test('connections and data', () => {
  assert.ok(isTrackingDetail(d));
  const s = buildConnectionsStory(d, now);
  assert.equal(text(s.headline), '6 of 8 connections are working. Meta Ads hasn’t sent anything since 7 Oct, and Google Ads is blocked until Google approves your API access. The website, bookings, Instagram, Google Analytics and Search Console are up to date.');
  assert.deepEqual(s.ranks.map((r) => r.id), ['meta', 'google', 'unused']);
  assert.match(text(s.ranks[0].body), /50 days ago/);
  const row = (k) => s.rows.find((r) => r.key.startsWith(k));
  assert.equal(row('web-').last, 'today, 4:18 pm');
  assert.equal(row('wa').status, 'warn');
  assert.equal(row('old-').status, 'off');
  assert.equal(s.kpis[0].value, '6 of 8');
  assert.equal(s.days.length, 15);
  assert.equal(s.gaps, 0);
  assert.deepEqual(s.signals.map((x) => x.id), ['spike', 'gaps', 'gsc']);
  assert.match(s.signals[0].title, /^21 Nov had 3 times the usual website data, with no form sends$/);
});

test('forms and links', () => {
  const s = buildFormsStory(d, pageLabel);
  assert.equal(text(s.headline), 'In the last 30 days a website form was sent in 159 visits and 138 of them became enquiries. In 21, no enquiry was created, and the enrol pop-up on course pages loses the most: 7 of 28 sends. Half of website enquiries can’t say where the person came from, because almost no shared links carry campaign tags.');
  assert.deepEqual(s.ranks.map((r) => r.id), ['worst', 'tags', 'test']);
  assert.match(text(s.ranks[0].body), /5 of them on 27 Oct alone/);
  assert.deepEqual(s.sources.map((x) => [x.label, x.n]), [['Typed / unknown', 56], ['Google search', 36], ['Instagram links', 11], ['AI assistants', 8]]);
  assert.equal(s.webLeads, 111);
  assert.equal(formLabel('contactfrmForm'), 'Contact form');
  assert.equal(formLabel('reservationForm'), 'Enrol page form');
  assert.equal(s.forms.find((f) => f.key === 'ykEnrollPopupForm').pages[0].n, 2);
  assert.deepEqual(s.signals.map((x) => x.id), ['ig', 'fbclid', 'links']);
});
