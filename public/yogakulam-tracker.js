/* Deprecated compatibility URL. Runtime implementation is Salsys-only. */
(function () {
  'use strict';

  var current = document.currentScript;
  var base = window.location.origin;

  try {
    if (current && current.src) base = new URL(current.src, window.location.href).origin;
  } catch (_) {}

  function mapElement(element) {
    if (!element || !element.getAttribute || !element.setAttribute) return;

    if (element.hasAttribute('data-yk-lead-form') && !element.hasAttribute('data-salsys-lead-form')) {
      element.setAttribute('data-salsys-lead-form', '');
    }

    if (element.hasAttribute('data-yk-event') && !element.hasAttribute('data-salsys-track')) {
      element.setAttribute('data-salsys-track', element.getAttribute('data-yk-event') || 'cta_click');
    }

    if (element.hasAttribute('data-yk-channel') && !element.hasAttribute('data-salsys-prop-channel')) {
      element.setAttribute('data-salsys-prop-channel', element.getAttribute('data-yk-channel') || '');
    }

    if (element.hasAttribute('data-yk-label') && !element.hasAttribute('data-salsys-prop-legacy-label')) {
      element.setAttribute('data-salsys-prop-legacy-label', element.getAttribute('data-yk-label') || '');
    }
  }

  function mapLegacyMarkup(root) {
    root = root || document;

    if (root.matches) mapElement(root);

    if (!root.querySelectorAll) return;
    var nodes = root.querySelectorAll(
      '[data-yk-lead-form],[data-yk-event],[data-yk-channel],[data-yk-label]'
    );
    for (var i = 0; i < nodes.length; i++) mapElement(nodes[i]);
  }

  function dispatchCanonicalConsent(detail) {
    window.dispatchEvent(new CustomEvent('salsys:consent', {
      detail: detail && typeof detail === 'object' ? detail : {}
    }));
  }

  function bridgeStoredConsent() {
    var match = document.cookie.match(/(?:^|; )yk_analytics_consent=([^;]*)/);
    if (!match) return;

    var value = decodeURIComponent(match[1]);
    if (value === '1') dispatchCanonicalConsent({ analytics: 'granted' });
    if (value === '0') dispatchCanonicalConsent({ analytics: 'denied' });
  }

  window.addEventListener('yk:consent', function (event) {
    var detail = event && event.detail && typeof event.detail === 'object'
      ? event.detail
      : {};

    dispatchCanonicalConsent({
      analytics: detail.analytics === true ? 'granted' : detail.analytics === false ? 'denied' : detail.analytics,
      marketing: detail.marketing,
      advertising: detail.advertising,
      personalization: detail.personalization,
      sale_sharing: detail.sale_sharing
    });
  });

  mapLegacyMarkup(document);

  if (window.MutationObserver) {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes || [];
        for (var j = 0; j < added.length; j++) {
          if (added[j] && added[j].nodeType === 1) mapLegacyMarkup(added[j]);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (window.SalsysIntelligence && window.SalsysIntelligence.__universalTrackingIntelligenceV1) {
    bridgeStoredConsent();
    return;
  }

  var script = document.createElement('script');
  script.src = base.replace(/\/$/, '') + '/salsys-intelligence.js';
  script.async = false;

  if (current && current.dataset) {
    if (current.dataset.site) script.dataset.site = current.dataset.site;
    if (current.dataset.consentMode) script.dataset.consentMode = current.dataset.consentMode;
    if (current.dataset.debug) script.dataset.debug = current.dataset.debug;
    if (current.dataset.formMode) script.dataset.formMode = current.dataset.formMode;
  }

  script.onload = bridgeStoredConsent;
  (document.head || document.documentElement).appendChild(script);
})();
