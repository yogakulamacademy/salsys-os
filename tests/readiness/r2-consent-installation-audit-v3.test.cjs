const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../scripts/r2-consent-installation-audit.js'), 'utf8');
const boot = {
  src: 'https://salsysos.com/salsys-intelligence.js?site_id=TOP_SECRET',
  'data-salsys-site': 'TOP_SECRET',
  'data-consent-mode': 'required',
  'data-endpoint': 'https://salsysos.com/api/events/browser/v1?site_id=TOP_SECRET',
  'data-consent-endpoint': 'https://salsysos.com/api/privacy/consent/v1?site_id=TOP_SECRET',
};
const cmp = { src: 'https://salsysos.com/salsys-consent.js', 'data-consent-banner': 'auto' };

function run(tags) {
  const logs = [];
  const document = {
    baseURI: 'https://www.yogakulam.com/secret?token=DO_NOT_LOG',
    querySelectorAll(sel) {
      assert.equal(sel, 'script');
      return tags.map(attrs => ({
        getAttribute(key) { return Object.hasOwn(attrs, key) ? attrs[key] : null; },
        hasAttribute(key) { return Object.hasOwn(attrs, key); },
      }));
    },
    get cookie() { throw Error('Must not read cookies'); },
  };
  const result = vm.runInNewContext(source, {
    document, URL,
    console: { log: val => logs.push(String(val)) },
    fetch() { throw Error('Must not fetch'); },
    XMLHttpRequest: class { constructor() { throw Error('Must not call XHR'); } },
    localStorage: new Proxy({}, { get() { throw Error('Must not read storage'); } }),
    sessionStorage: new Proxy({}, { get() { throw Error('Must not read storage'); } }),
  }, { timeout: 1500 });
  const output = JSON.stringify(result) + logs.join('\n');
  assert.doesNotMatch(output, /TOP_SECRET|DO_NOT_LOG|\/api\/events|www\.yogakulam/);
  return result;
}
test('required mode is static-only, never E2E PASS', () => {
  const report = run([boot, cmp]);
  assert.equal(report.status, 'STATIC_ATTRIBUTES_MATCH_REQUIRED_NOT_E2E_VERIFIED');
  assert.equal(report.counts.intelligenceBootstrap, 1);
});
test('explicit granted is flagged', () => {
  assert.equal(run([{ ...boot, 'data-consent-mode': 'granted' }, cmp]).status, 'REVIEW_EXPLICIT_GRANTED_MODE');
});
test('missing mode is flagged', () => {
  const b = { ...boot }; delete b['data-consent-mode'];
  assert.equal(run([b, cmp]).status, 'REVIEW_MISSING_OR_UNEXPECTED_CONSENT_MODE');
});
test('unknown mode is redacted', () => {
  const r = run([{ ...boot, 'data-consent-mode': 'SECRET_MODE_TOP_SECRET' }, cmp]);
  assert.equal(r.configuration.bootstrapConsentMode, '(unrecognized-value-not-printed)');
});
test('duplicate bootstraps are flagged', () => {
  assert.equal(run([boot, boot, cmp]).status, 'REVIEW_DUPLICATE_SALSYS_TRACKERS');
});
test('missing bootstrap is inconclusive', () => {
  assert.equal(run([]).status, 'INCONCLUSIVE_NO_VISIBLE_TOP_DOCUMENT_LOADER');
});
test('legacy tracker is flagged', () => {
  assert.equal(run([{ src: 'https://salsysos.com/salsys-tracker.js' }, cmp]).status, 'REVIEW_LEGACY_TRACKER');
});
test('missing or duplicate consent UI is flagged', () => {
  assert.equal(run([boot]).status, 'REVIEW_MISSING_OR_DUPLICATE_CONSENT_UI');
  assert.equal(run([boot, cmp, cmp]).status, 'REVIEW_MISSING_OR_DUPLICATE_CONSENT_UI');
});
test('non-auto CMP is flagged', () => {
  assert.equal(run([boot, { ...cmp, 'data-consent-banner': 'manual' }]).status, 'REVIEW_MISSING_OR_DUPLICATE_CONSENT_UI');
});
test('untrusted named script is flagged', () => {
  const r = run([{ ...boot, src: 'https://salsysos.com.evil.invalid/salsys-intelligence.js' }, cmp]);
  assert.equal(r.status, 'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('unexpected HTTP origin is flagged', () => {
  const r = run([{ ...boot, src: 'http://salsysos.com/salsys-intelligence.js' }, cmp]);
  assert.equal(r.status, 'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('behavioral tracking requires authorization review', () => {
  const r = run([{ ...boot, 'data-salsys-behavior-tracking': 'true' }, cmp]);
  assert.equal(r.status, 'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('missing bootstrap endpoint is flagged', () => {
  const b = { ...boot }; delete b['data-endpoint'];
  assert.equal(run([b, cmp]).status, 'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('multiple runtime scripts are flagged', () => {
  const core = { src: 'https://salsysos.com/salsys-intelligence-core-v1.6.0.js' };
  assert.equal(run([boot, cmp, core, core]).status, 'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('one runtime script is permitted for a static check', () => {
  const core = { src: 'https://salsysos.com/salsys-intelligence-core-v1.6.0.js' };
  assert.equal(run([boot, cmp, core]).status, 'STATIC_ATTRIBUTES_MATCH_REQUIRED_NOT_E2E_VERIFIED');
});
test('tag manager is review-only', () => {
  assert.equal(run([boot, cmp, { src: 'https://www.googletagmanager.com/gtm.js?id=SECRET' }]).status,
    'STATIC_ATTRIBUTES_MATCH_BUT_DYNAMIC_LOADERS_REQUIRE_REVIEW');
});
test('website wrapper is review-only', () => {
  assert.equal(run([boot, cmp, { src: 'https://www.yogakulam.com/yogakulam-tracker.js' }]).status,
    'STATIC_ATTRIBUTES_MATCH_BUT_DYNAMIC_LOADERS_REQUIRE_REVIEW');
});

test('untrusted event endpoint is not a static match', () => {
  const report = run([{ ...boot, 'data-endpoint': 'https://third-party.invalid/api/events/browser/v1?site_id=TOP_SECRET' }, cmp]);
  assert.equal(report.status, 'REVIEW_STATIC_CONFIGURATION_WARNINGS');
  assert.equal(report.configuration.bootstrapEndpointsUseTrustedPathsAndSameSite, false);
});
test('relative event endpoint is not a static match', () => {
  assert.equal(run([{ ...boot, 'data-endpoint': '/api/events/browser/v1?site_id=TOP_SECRET' }, cmp]).status,
    'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('wrong event endpoint path is not a static match', () => {
  assert.equal(run([{ ...boot, 'data-endpoint': 'https://salsysos.com/api/events/other?site_id=TOP_SECRET' }, cmp]).status,
    'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('wrong consent endpoint origin is not a static match', () => {
  assert.equal(run([{ ...boot, 'data-consent-endpoint': 'https://third-party.invalid/api/privacy/consent/v1?site_id=TOP_SECRET' }, cmp]).status,
    'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('site ID mismatch between loader and endpoint is not a static match', () => {
  assert.equal(run([{ ...boot, 'data-endpoint': 'https://salsysos.com/api/events/browser/v1?site_id=DIFFERENT' }, cmp]).status,
    'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('duplicate site_id parameters are not a static match', () => {
  assert.equal(run([{ ...boot, 'data-endpoint': 'https://salsysos.com/api/events/browser/v1?site_id=TOP_SECRET&site_id=DIFFERENT' }, cmp]).status,
    'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('missing value for present bootstrap attribute is flagged', () => {
  assert.equal(run([{ ...boot, 'data-salsys-site': '' }, cmp]).status,
    'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('nested bootstrap path is not a static match', () => {
  assert.equal(run([{ ...boot, src: 'https://salsysos.com/different/salsys-intelligence.js' }, cmp]).status,
    'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('nested consent UI script path is not a static match', () => {
  assert.equal(run([boot, { ...cmp, src: 'https://salsysos.com/different/salsys-consent.js' }]).status,
    'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('endpoint embedded credentials are not a static match', () => {
  assert.equal(run([{ ...boot, 'data-endpoint': 'https://user:pass@salsysos.com/api/events/browser/v1?site_id=TOP_SECRET' }, cmp]).status,
    'REVIEW_STATIC_CONFIGURATION_WARNINGS');
});
test('trusted and correctly bound endpoints are reported only as boolean', () => {
  const report = run([boot, cmp]);
  assert.equal(report.configuration.bootstrapEndpointsUseTrustedPathsAndSameSite, true);
  assert.equal(report.status, 'STATIC_ATTRIBUTES_MATCH_REQUIRED_NOT_E2E_VERIFIED');
});
