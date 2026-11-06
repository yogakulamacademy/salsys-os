/* Salsys Behavioral Event Collection V1 — optional extension, no session replay. */
(function () {
  'use strict';

  if (window.__salsysBehaviorV1Installed) return;
  var sdk = window.SalsysIntelligence;
  if (!sdk || !sdk.__universalTrackingIntelligenceV1 ||
      typeof sdk.track !== 'function' || typeof sdk.privacy !== 'function') return;
  window.__salsysBehaviorV1Installed = true;

  var visibleSelector = '[data-salsys-cta-id],[data-salsys-pricing-id]';
  var pageKey = window.location.pathname;
  var seen = Object.create(null);
  var watched = [];
  var scheduledScan = false;
  // Invalidate deferred interactions after navigation, consent, or tab state changes.
  var interactionEpoch = 0;
  var lastDepth = getDepth();
  var thresholds = [25, 50, 75, 90];
  var observer = null;

  // Identifiers must be supplied by the integrator, not extracted from visitor text.
  function safeId(value) {
    var text = String(value || '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_:.-]{0,79}$/.test(text) ? text : null;
  }

  function allowed() {
    try {
      return sdk.privacy().analytics_allowed_locally === true;
    } catch (_) {
      return false;
    }
  }

  function getDepth() {
    var root = document.documentElement;
    if (!root) return 0;
    var viewport = window.innerHeight || root.clientHeight || 0;
    var total = Math.max(root.scrollHeight || 0, document.body ? document.body.scrollHeight || 0 : 0);
    if (total <= viewport || viewport <= 0) return 0;
    var travelled = Math.max(0, window.scrollY || window.pageYOffset || 0);
    return Math.max(0, Math.min(100, Math.floor(((travelled + viewport) / total) * 100)));
  }

  function ensurePage() {
    var next = window.location.pathname;
    if (next !== pageKey) {
      interactionEpoch++;
      pageKey = next;
      seen = Object.create(null);
      lastDepth = getDepth();
      // Shared SPA navigation controls may persist across route changes.
      if (observer) reobserve();
    }
  }

  function emit(eventName, properties, dedupe) {
    ensurePage();
    if (!allowed() || seen[dedupe]) return false;
    seen[dedupe] = true;
    try {
      var result = sdk.track(eventName, properties, { keepalive: true });
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } catch (_) {
      // Optional telemetry must never interfere with website interactions.
    }
    return true;
  }

  function recordVisibility(element) {
    if (!element || element.isConnected === false ||
        document.visibilityState === 'hidden' || !allowed()) return false;
    var cta = safeId(element.getAttribute('data-salsys-cta-id'));
    var pricing = safeId(element.getAttribute('data-salsys-pricing-id'));
    if (cta) return emit('web.cta_viewed', { cta_id: cta }, 'cta:' + cta);
    if (pricing) return emit('web.pricing_viewed', { pricing_id: pricing }, 'pricing:' + pricing);
    return false;
  }

  if (typeof window.IntersectionObserver === 'function') {
    observer = new window.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
        if (recordVisibility(entry.target)) observer.unobserve(entry.target);
      });
    }, { threshold: [0.5] });
  }

  function dropDisconnected() {
    if (!observer) return;
    // SPA views can replace hundreds of nodes without a full reload. Keep
    // the 200 *live* observer cap, rather than exhausting it permanently on
    // elements which are no longer connected to the current document.
    for (var i = watched.length - 1; i >= 0; i--) {
      if (watched[i].isConnected === false) {
        observer.unobserve(watched[i]);
        watched.splice(i, 1);
      }
    }
  }

  function scan() {
    scheduledScan = false;
    ensurePage();
    if (!observer || !document.querySelectorAll) return;
    dropDisconnected();
    var nodes = document.querySelectorAll(visibleSelector);
    // Bound observation work on pages with very large or hostile DOM trees.
    for (var i = 0; i < nodes.length && watched.length < 200; i++) {
      if (watched.indexOf(nodes[i]) >= 0) continue;
      watched.push(nodes[i]);
      observer.observe(nodes[i]);
    }
  }

  function scheduleScan() {
    if (scheduledScan) return;
    scheduledScan = true;
    window.setTimeout(scan, 80);
  }

  function reobserve() {
    if (!observer) return;
    dropDisconnected();
    for (var i = 0; i < watched.length; i++) {
      observer.unobserve(watched[i]);
      observer.observe(watched[i]);
    }
  }

  // Scroll steps are threshold crossings after consent, never retroactive.
  function onScroll() {
    ensurePage();
    var next = getDepth();
    if (allowed() && document.visibilityState !== 'hidden') {
      thresholds.forEach(function (value) {
        if (lastDepth < value && next >= value) {
          emit('web.scroll_depth_reached', { threshold_percent: value }, 'scroll:' + value);
        }
      });
    }
    lastDepth = next;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  function onNavigationChange() {
    // SPA replacements may occur without a pathname change.
    interactionEpoch++;
    scheduleScan();
  }
  window.addEventListener('popstate', onNavigationChange);
  window.addEventListener('salsys:page-change', onNavigationChange);
  document.addEventListener('visibilitychange', function () {
    interactionEpoch++;
    if (document.visibilityState === 'visible') reobserve();
  });
  window.addEventListener('salsys:consent-changed', function () {
    // Deferred clicks initiated before a grant or withdrawal must never
    // become eligible just because consent changes before their timer fires.
    interactionEpoch++;
    lastDepth = getDepth();
    reobserve();
  });

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;

    var brochure = target.closest('[data-salsys-brochure-id]');
    if (brochure) {
      var brochureId = safeId(brochure.getAttribute('data-salsys-brochure-id'));
      if (brochureId) {
        emit('web.brochure_clicked', { brochure_id: brochureId }, 'brochure:' + brochureId);
      }
    }

    var faq = target.closest('[data-salsys-faq-id][aria-expanded]');
    if (faq && allowed() && document.visibilityState !== 'hidden') {
      // Accordion state is checked after the click handler, but permission
      // belongs to the initiating interaction, not just the deferred callback.
      var clickedEpoch = interactionEpoch;
      var clickedPath = window.location.pathname;
      window.setTimeout(function () {
        if (interactionEpoch !== clickedEpoch ||
            window.location.pathname !== clickedPath ||
            faq.isConnected === false ||
            !allowed() || document.visibilityState === 'hidden' ||
            faq.getAttribute('aria-expanded') !== 'true') return;
        var faqId = safeId(faq.getAttribute('data-salsys-faq-id'));
        if (faqId) emit('web.faq_expanded', { faq_id: faqId }, 'faq:' + faqId);
      }, 0);
    }
  }, true);

  document.addEventListener('toggle', function (event) {
    var faq = event.target;
    if (!faq || !faq.matches || !faq.matches('details[data-salsys-faq-id]') || !faq.open) return;
    var faqId = safeId(faq.getAttribute('data-salsys-faq-id'));
    if (faqId) emit('web.faq_expanded', { faq_id: faqId }, 'faq:' + faqId);
  }, true);

  // Applications must dispatch these events only after the relevant form outcome.
  // The event detail contains category/ID metadata only: never field names or values.
  document.addEventListener('salsys:form-validation-failed', function (event) {
    var detail = event && event.detail || {};
    var id = safeId(detail.form_id);
    var category = String(detail.category || '').toLowerCase();
    if (!id || ['required', 'format', 'network', 'server', 'other'].indexOf(category) < 0) return;
    // Each category is recorded once per form and page, avoiding a noisy per-keystroke stream.
    emit('web.form_validation_failed',
      { form_id: id, error_category: category },
      'form-error:' + id + ':' + category);
  });

  document.addEventListener('salsys:form-acknowledged', function (event) {
    var detail = event && event.detail || {};
    var id = safeId(detail.form_id);
    if (!id) return;
    emit('web.form_acknowledged', { form_id: id }, 'form-ack:' + id);
  });

  if (typeof window.MutationObserver === 'function' && document.documentElement) {
    new window.MutationObserver(scheduleScan).observe(document.documentElement, {
      childList: true, subtree: true
    });
  }
  scan();
})();