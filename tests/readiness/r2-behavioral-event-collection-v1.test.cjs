const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'public/salsys-behavior-v1.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'public/salsys-intelligence-core-v1.6.0.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261105140000_r2_behavioral_event_contracts_v1.sql'), 'utf8'
);
const names = [
  'web.scroll_depth_reached',
  'web.cta_viewed',
  'web.pricing_viewed',
  'web.faq_expanded',
  'web.brochure_clicked',
  'web.form_validation_failed',
  'web.form_acknowledged',
];

function node(attributes = {}) {
  const item = {
    open: Boolean(attributes.open),
    isConnected: attributes.isConnected !== false,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    matches(selector) {
      return selector === 'details[data-salsys-faq-id]' &&
        Boolean(attributes['data-salsys-faq-id']);
    },
    closest(selector) {
      if (selector === '[data-salsys-brochure-id]' && attributes['data-salsys-brochure-id']) return item;
      if (selector === '[data-salsys-faq-id][aria-expanded]' && attributes['data-salsys-faq-id']) return item;
      return null;
    },
  };
  return item;
}

function setup(initialConsent = true, observedNodes = []) {
  let consent = initialConsent;
  const events = [];
  const documentListeners = new Map();
  const windowListeners = new Map();
  let intersection = null;
  let scrollY = 0;
  let page = '/programs';
  const timers = [];

  function register(map, name, fn) {
    const handlers = map.get(name) || [];
    handlers.push(fn);
    map.set(name, handlers);
  }
  const document = {
    visibilityState: 'visible',
    documentElement: { scrollHeight: 1000, clientHeight: 100 },
    body: { scrollHeight: 1000 },
    addEventListener(name, fn) { register(documentListeners, name, fn); },
    querySelectorAll() { return observedNodes; },
  };
  class FakeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = new Set();
      intersection = this;
    }
    observe(item) { this.observed.add(item); }
    unobserve(item) { this.observed.delete(item); }
    trigger(item, ratio = 0.75) {
      this.callback([{ target: item, isIntersecting: ratio > 0, intersectionRatio: ratio }]);
    }
  }
  const window = {
    SalsysIntelligence: {
      __universalTrackingIntelligenceV1: true,
      privacy() { return { analytics_allowed_locally: consent }; },
      track(name, properties) {
        events.push({ name, properties });
        return Promise.resolve({});
      },
    },
    location: { get pathname() { return page; } },
    innerHeight: 100,
    get scrollY() { return scrollY; },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    addEventListener(name, fn) { register(windowListeners, name, fn); },
    IntersectionObserver: FakeObserver,
  };
  vm.runInNewContext(source, { window, document });
  return {
    events, observer: () => intersection, document,
    setConsent(value) { consent = value; },
    setScroll(value) { scrollY = value; },
    setPage(value) { page = value; },
    sendDocument(name, payload) {
      for (const fn of documentListeners.get(name) || []) fn(payload);
    },
    sendWindow(name, payload) {
      for (const fn of windowListeners.get(name) || []) fn(payload);
    },
    flushTimers() {
      while (timers.length) timers.shift()();
    },
  };
}

test('R2 event contracts are registered once, with browser telemetry scope', () => {
  for (const name of names) assert.ok(migration.includes("'" + name + "'"), name);
  assert.match(migration, /organization_id is null/);
  assert.match(migration, /on conflict do nothing/i);
  assert.match(migration, /explicit_opt_in/);
  assert.match(migration, /form_values.*forbidden/);
});

test('Universal SDK only injects optional collector on explicit opt-in', () => {
  assert.match(core, /dataset\.salsysBehaviorTracking === 'true'/);
  assert.match(core, /__salsysBehaviorV1Queued/);
  assert.match(core, /salsys-behavior-v1\.js/);
});

test('visibility requires analytics consent, 50 percent intersection and valid ID', () => {
  const cta = node({ 'data-salsys-cta-id': 'enroll_now' });
  const ctx = setup(false, [cta]);
  ctx.observer().trigger(cta);
  assert.equal(ctx.events.length, 0);
  ctx.setConsent(true);
  ctx.sendWindow('salsys:consent-changed', {});
  ctx.observer().trigger(cta, 0.2);
  assert.equal(ctx.events.length, 0);
  ctx.observer().trigger(cta, 0.7);
  ctx.observer().trigger(cta);
  assert.equal(ctx.events.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.events[0])), {
    name: 'web.cta_viewed',
    properties: { cta_id: 'enroll_now' },
  });
});

test('invalid identifiers and hidden-page impressions are not captured', () => {
  const malformed = node({ 'data-salsys-pricing-id': 'price for alice@example.com' });
  const ctx = setup(true, [malformed]);
  ctx.observer().trigger(malformed);
  assert.equal(ctx.events.length, 0);
  ctx.document.visibilityState = 'hidden';
  const valid = node({ 'data-salsys-pricing-id': 'private_room' });
  ctx.observer().trigger(valid);
  assert.equal(ctx.events.length, 0);
  ctx.document.visibilityState = 'visible';
  ctx.observer().trigger(valid);
  assert.equal(ctx.events[0].name, 'web.pricing_viewed');
});

test('scroll tracks each threshold crossing once; denied consent does not backfill', () => {
  const ctx = setup(false);
  ctx.setScroll(180);
  ctx.sendWindow('scroll');
  assert.equal(ctx.events.length, 0);
  ctx.setConsent(true);
  ctx.sendWindow('salsys:consent-changed', {});
  ctx.setScroll(500);
  ctx.sendWindow('scroll');
  ctx.sendWindow('scroll');
  ctx.setScroll(920);
  ctx.sendWindow('scroll');
  const thresholds = ctx.events.filter(e => e.name === 'web.scroll_depth_reached')
    .map(e => e.properties.threshold_percent);
  assert.deepEqual(thresholds, [50, 75, 90]);
});

test('FAQ, brochure, and form events only send bounded identifiers and categories', () => {
  const ctx = setup(true);
  const faq = node({ 'data-salsys-faq-id': 'certification', 'aria-expanded': 'true' });
  ctx.sendDocument('click', { target: faq });
  ctx.flushTimers();
  ctx.sendDocument('toggle', { target: node({ 'data-salsys-faq-id': 'certification', open: true }) });
  const brochure = node({ 'data-salsys-brochure-id': 'course_guide' });
  ctx.sendDocument('click', { target: brochure });
  ctx.sendDocument('click', { target: brochure });
  ctx.sendDocument('salsys:form-validation-failed',
    { detail: { form_id: 'apply', category: 'required', raw_input: 'SECRET' } });
  ctx.sendDocument('salsys:form-validation-failed',
    { detail: { form_id: 'apply', category: 'bad/email', raw_input: 'SECRET' } });
  ctx.sendDocument('salsys:form-acknowledged',
    { detail: { form_id: 'apply', response_body: 'SECRET' } });
  assert.deepEqual(ctx.events.map(e => e.name), [
    'web.faq_expanded', 'web.brochure_clicked', 'web.form_validation_failed', 'web.form_acknowledged',
  ]);
  assert.ok(!JSON.stringify(ctx.events).includes('SECRET'));
});


test('same CTA can be observed again after an explicit SPA route change', () => {
  const cta = node({ 'data-salsys-cta-id': 'enroll_now' });
  const ctx = setup(true, [cta]);
  ctx.observer().trigger(cta);
  assert.equal(ctx.events.length, 1);
  ctx.setPage('/different-program');
  ctx.sendWindow('salsys:page-change', {});
  ctx.flushTimers();
  ctx.observer().trigger(cta);
  assert.equal(ctx.events.length, 2);
});

test('long-lived SPA reclaims removed visibility markers at the 200-element observation cap', () => {
  const old = Array.from({ length: 200 }, (_, i) =>
    node({ 'data-salsys-cta-id': 'old-' + i }));
  const ctx = setup(true, old);
  assert.equal(ctx.observer().observed.size, 200);

  // A real SPA may replace an entire product/grid view without a hard reload.
  // New CTA controls must not be starved by 200 detached DOM nodes.
  for (const item of old) item.isConnected = false;
  old.splice(0, old.length);
  const fresh = node({ 'data-salsys-cta-id': 'new-cta' });
  old.push(fresh);
  ctx.sendWindow('salsys:page-change', {});
  ctx.flushTimers();

  assert.equal(ctx.observer().observed.size, 1);
  assert.equal(ctx.observer().observed.has(fresh), true);
  ctx.observer().trigger(fresh, 0.8);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.events)), [
    { name: 'web.cta_viewed', properties: { cta_id: 'new-cta' } },
  ]);
});

test('detached markers cannot emit stale visibility impressions', () => {
  const stale = node({ 'data-salsys-pricing-id': 'removed-pricing' });
  const ctx = setup(true, [stale]);
  stale.isConnected = false;
  ctx.observer().trigger(stale, 0.9);
  assert.equal(ctx.events.length, 0);
});

test('hidden scrolls are not counted as meaningful engagement', () => {
  const ctx = setup(true);
  ctx.document.visibilityState = 'hidden';
  ctx.setScroll(500);
  ctx.sendWindow('scroll');
  assert.equal(ctx.events.length, 0);
  ctx.document.visibilityState = 'visible';
  ctx.setScroll(800);
  ctx.sendWindow('scroll');
  assert.deepEqual(ctx.events.map(e => e.properties.threshold_percent), [75, 90]);
});

test('source never scrapes form values or installs session replay', () => {
  assert.doesNotMatch(source, /\.value\b|innerHTML|outerHTML|MutationRecord\.|recording/);
  assert.match(source, /analytics_allowed_locally === true/);
});
