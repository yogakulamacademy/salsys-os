/*
 * SalsysOS R2 website consent installation diagnostic v3.3 — READ ONLY.
 * Paste this whole file into DevTools > Console on a website you administer.
 *
 * Checks current top-document script attributes. It DOES NOT fetch, mutate,
 * inspect network traffic, read cookies/storage/PII, start tracking, or test CMP.
 * Reports booleans and approved enumerations; never prints URLs, Site IDs,
 * tokens, query parameters, form values, arbitrary attribute values or hosts.
 *
 * A configuration match is NOT E2E consent acceptance or a release GO.
 */
(() => {
  'use strict';
  const version = '3.3';
  const allowed = new Set([
    'salsys-intelligence.js', 'salsys-tracker.js',
    'yogakulam-tracker.js', 'salsys-consent.js',
  ]);
  const get = (s, a) => String(s.getAttribute(a) || '').trim().toLowerCase();
  const has = (s, a) => Boolean(s.hasAttribute(a));
  const kind = (s) => {
    const raw = String(s.getAttribute('src') || '');
    try {
      const parsed = new URL(raw, document.baseURI || 'https://example.invalid/');
      const file = (parsed.pathname.split('/').pop() || '').toLowerCase();
      const trusted = parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'salsysos.com' &&
        !parsed.username && !parsed.password && (!parsed.port || parsed.port === '443') &&
        parsed.pathname === '/' + file;
      return { file, trusted, tagManager: parsed.hostname.toLowerCase() === 'www.googletagmanager.com' &&
        /^\/(gtm|gtag)\.js$/i.test(parsed.pathname) };
    } catch {
      return { file: '', trusted: false, tagManager: false };
    }
  };
  const endpointMatches = (raw, path, siteId) => {
    if (!raw || !siteId) return false;
    try {
      const url = new URL(raw);
      const ids = url.searchParams.getAll('site_id');
      return url.protocol === 'https:' && url.hostname.toLowerCase() === 'salsysos.com' &&
        !url.username && !url.password && (!url.port || url.port === '443') &&
        url.pathname === path && ids.length === 1 && ids[0] === siteId;
    } catch {
      return false;
    }
  };
  const enumerateMode = (mode) => mode === 'required' || mode === 'granted'
    ? mode : mode === '' ? '(unset)' : '(unrecognized-value-not-printed)';

  const scripts = Array.from(document.querySelectorAll('script'));
  const entries = [];
  let tagManager = false;
  for (const script of scripts) {
    const k = kind(script);
    if (k.tagManager) tagManager = true;
    if (!allowed.has(k.file) && !/^salsys-intelligence-core(?:[.-]|$)/.test(k.file)) continue;
    entries.push({
      file: k.file,
      trusted: k.trusted,
      // Private comparisons only: site IDs never appear in the returned report.
      siteId: String(script.getAttribute('data-salsys-site') || '').trim(),
      legacyAliasesDisabled: get(script, 'data-legacy-aliases') === 'false',
      mode: enumerateMode(get(script, 'data-consent-mode')),
      autoBanner: get(script, 'data-consent-banner') === 'auto',
      siteAttribute: has(script, 'data-salsys-site'),
      eventEndpointAttribute: has(script, 'data-endpoint'),
      consentEndpointAttribute: has(script, 'data-consent-endpoint'),
      endpointsMatchSite: endpointMatches(
        script.getAttribute('data-endpoint'), '/api/events/browser/v1',
        String(script.getAttribute('data-salsys-site') || '').trim()
      ) && endpointMatches(
        script.getAttribute('data-consent-endpoint'), '/api/privacy/consent/v1',
        String(script.getAttribute('data-salsys-site') || '').trim()
      ),
      behaviorOn: get(script, 'data-salsys-behavior-tracking') === 'true',
      leadCaptureOn: get(script, 'data-salsys-lead-capture') === 'auto',
    });
  }
  const of = (n) => entries.filter((x) => x.file === n);
  const boot = of('salsys-intelligence.js');
  const old = of('salsys-tracker.js');
  const ui = of('salsys-consent.js');
  const wrapper = of('yogakulam-tracker.js');
  const cores = entries.filter(x => /^salsys-intelligence-core(?:[.-]|$)/.test(x.file));
  const installed = boot[0] || null;
  // The current first-party bootstrap loads one intelligence core, which
  // loads one inherited salsys-tracker.js with data-legacy-aliases="false".
  // This is static consistency, NOT proof of who inserted each script.
  const internalChainConsistent = boot.length === 1 && cores.length === 1 && old.length === 1 &&
    [installed, cores[0], old[0]].every((x) =>
      x.trusted && x.siteId && x.mode === 'required' && x.endpointsMatchSite
    ) &&
    cores[0].siteId === installed.siteId &&
    old[0].siteId === installed.siteId &&
    old[0].legacyAliasesDisabled;
  const warnings = [];
  if (boot.length > 1 || old.length > 1) warnings.push('DUPLICATE_TRACKER_LOADER');
  if (old.length && !internalChainConsistent) warnings.push('LEGACY_TRACKER_PRESENT');
  if (boot.length && old.length && !internalChainConsistent) {
    warnings.push('UNVERIFIED_ADDITIONAL_TRACKER');
  }
  if (wrapper.length) warnings.push('SITE_WRAPPER_REQUIRES_MANUAL_SOURCE_REVIEW');
  if (tagManager) warnings.push('TAG_MANAGER_MAY_INSERT_MORE_SCRIPTS');
  if (cores.length > 1) warnings.push('MULTIPLE_CORE_RUNTIME_SCRIPTS');
  if (entries.some(x => !x.trusted && x.file !== 'yogakulam-tracker.js')) {
    warnings.push('SALSYS_NAMED_SCRIPT_FROM_UNTRUSTED_ORIGIN');
  }
  if (entries.some(x => x.behaviorOn)) warnings.push('BEHAVIOR_TRACKING_ATTRIBUTE_ENABLED_REQUIRES_AUTHORIZATION');
  if (installed && (!installed.siteAttribute || !installed.eventEndpointAttribute || !installed.consentEndpointAttribute)) {
    warnings.push('BOOTSTRAP_MISSING_EXPECTED_ATTRIBUTES');
  }
  if (installed && !installed.endpointsMatchSite) {
    warnings.push('BOOTSTRAP_ENDPOINT_OR_SITE_BINDING_REQUIRES_REVIEW');
  }
  const staticMismatch = warnings.some(w => [
    'SALSYS_NAMED_SCRIPT_FROM_UNTRUSTED_ORIGIN',
    'BOOTSTRAP_MISSING_EXPECTED_ATTRIBUTES',
    'BOOTSTRAP_ENDPOINT_OR_SITE_BINDING_REQUIRES_REVIEW',
    'BEHAVIOR_TRACKING_ATTRIBUTE_ENABLED_REQUIRES_AUTHORIZATION',
    'MULTIPLE_CORE_RUNTIME_SCRIPTS',
  ].includes(w));
  let status;
  if (boot.length + old.length === 0) status = 'INCONCLUSIVE_NO_VISIBLE_TOP_DOCUMENT_LOADER';
  else if (boot.length > 1 || old.length > 1) status = 'REVIEW_DUPLICATE_SALSYS_TRACKERS';
  else if (!boot.length && old.length) status = 'REVIEW_LEGACY_TRACKER';
  else if (boot.length && old.length && !internalChainConsistent) status = 'REVIEW_UNVERIFIED_ADDITIONAL_TRACKER';
  else if (installed.mode === 'granted') status = 'REVIEW_EXPLICIT_GRANTED_MODE';
  else if (installed.mode !== 'required') status = 'REVIEW_MISSING_OR_UNEXPECTED_CONSENT_MODE';
  else if (ui.length !== 1 || !ui[0].autoBanner) status = 'REVIEW_MISSING_OR_DUPLICATE_CONSENT_UI';
  else if (staticMismatch) status = 'REVIEW_STATIC_CONFIGURATION_WARNINGS';
  else if (wrapper.length || tagManager) status = 'STATIC_ATTRIBUTES_MATCH_BUT_DYNAMIC_LOADERS_REQUIRE_REVIEW';
  else status = 'STATIC_ATTRIBUTES_MATCH_REQUIRED_NOT_E2E_VERIFIED';

  const report = {
    audit: 'SalsysOS R2 website consent installation',
    version,
    status,
    counts: {
      intelligenceBootstrap: boot.length,
      legacyTracker: old.length,
      consentUi: ui.length,
      coreRuntime: cores.length,
      siteSpecificWrapper: wrapper.length,
    },
    configuration: {
      bootstrapConsentMode: installed?.mode || '(no-bootstrap)',
      expectedInternalTrackerChainConsistent: Boolean(internalChainConsistent),
      consentUiAutoBanner: ui.length === 1 && ui[0].autoBanner,
      bootstrapHasSiteIdAttribute: Boolean(installed?.siteAttribute),
      bootstrapHasEventEndpointAttribute: Boolean(installed?.eventEndpointAttribute),
      bootstrapHasConsentEndpointAttribute: Boolean(installed?.consentEndpointAttribute),
      bootstrapEndpointsUseTrustedPathsAndSameSite: Boolean(installed?.endpointsMatchSite),
      behaviorTrackingAttributeEnabled: entries.some(x => x.behaviorOn),
      automaticLeadCaptureConfigured: entries.some(x => x.leadCaptureOn),
      tagManagerPresent: tagManager,
    },
    warnings,
    nextChecks: [
      'Check actual script initiators and GTM: a consistent internal chain does not prove execution provenance.',
      'Witness Reject All, Accept, withdraw, regrant, and GPC in an authorized environment.',
      'Verify optional events cannot be sent before consent; static attributes alone are insufficient.',
    ],
    limitations: 'Only script attributes in the current top document. Internal tracker-chain classification is inferred from attributes, NOT verified injection provenance. No iframe/GTM internals, runtime callbacks, network requests, CMP decisions, visitor data, or historical installation evidence. NOT an R2 acceptance or release approval.',
  };
  console.log('SalsysOS R2 consent diagnostic (read-only):');
  console.log(JSON.stringify(report, null, 2));
  return report;
})();