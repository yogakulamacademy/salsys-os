/* Salsys Universal Tracking Intelligence SDK entrypoint v1.4.0 */
(function () {
  'use strict';

  if (window.SalsysIntelligence && window.SalsysIntelligence.__universalTrackingIntelligenceV1) return;

  var current = document.currentScript;
  var base = window.location.origin;
  try {
    if (current && current.src) base = new URL(current.src, window.location.href).origin;
  } catch (_) {}

  var FORM_MODE = (current && current.dataset && current.dataset.formMode) || 'lead-only';

  function warn() {
    if (!window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Salsys Intelligence]');
    console.warn.apply(console, args);
  }

  function normalizeDecision(value) {
    if (value === true) return 'granted';
    if (value === false) return 'denied';
    var text = String(value == null ? '' : value).trim().toLowerCase();
    return ['granted', 'denied', 'withdrawn', 'opted_out', 'limited'].indexOf(text) >= 0
      ? text
      : null;
  }

  function normalizeConsentDetail(detail) {
    detail = detail && typeof detail === 'object' ? detail : {};
    var normalized = {};

    ['analytics', 'marketing', 'advertising', 'sale_sharing', 'personalization'].forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(detail, key)) return;
      var decision = normalizeDecision(detail[key]);
      if (decision) normalized[key] = decision;
    });

    return normalized;
  }

  function formId(form) {
    return String(form.id || form.getAttribute('name') || 'anonymous').trim().slice(0, 160);
  }

  function formAction(form) {
    try {
      return new URL(form.action || window.location.href, window.location.href).pathname;
    } catch (_) {
      return null;
    }
  }

  function isLeadForm(form) {
    return Boolean(form && form.matches && form.matches('form[data-salsys-lead-form]'));
  }

  function installLeadFormTracking(api) {
    if (!api || FORM_MODE === 'all') return;

    var startedForms = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    var initial = document.querySelectorAll('form[data-salsys-lead-form]');
    for (var i = 0; i < initial.length; i++) api.decorateForm(initial[i]);

    document.addEventListener('focusin', function (event) {
      var form = event.target && event.target.closest
        ? event.target.closest('form[data-salsys-lead-form]')
        : null;
      if (!isLeadForm(form) || (startedForms && startedForms.has(form))) return;
      if (startedForms) startedForms.add(form);
      api.decorateForm(form);
      api.track('web.form_started', {
        form_id: formId(form),
        form_action: formAction(form),
        form_kind: 'lead'
      }, { keepalive: true }).catch(function () {});
    }, { capture: true });

    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!isLeadForm(form)) return;
      api.decorateForm(form);
      api.track('web.form_submitted', {
        form_id: formId(form),
        form_action: formAction(form),
        form_kind: 'lead'
      }, { keepalive: true, queue: false }).catch(function () {});
    }, { capture: true });
  }

  function installProductLayer(api) {
    if (!api || api.__salsysProductLayerInstalled) return;
    api.__salsysProductLayerInstalled = true;

    window.addEventListener('salsys:consent', function (event) {
      var normalized = normalizeConsentDetail(event && event.detail);
      if (!Object.keys(normalized).length) return;
      api.consent(normalized).catch(function () {});
    });

    installLeadFormTracking(api);

    window.SalsysIntelligence = api;
    window.SalsysIntelligence.product = 'Salsys Universal Tracking Intelligence SDK';
    window.SalsysIntelligence.__universalTrackingIntelligenceV1 = true;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'salsys_tracking_ready',
      sdk_version: api.version || null
    });
  }

  function expose() {
    if (!window.Salsys) return;
    installProductLayer(window.Salsys);
  }

  function loadCore() {
    if (window.Salsys) {
      expose();
      return;
    }

    var core = document.createElement('script');
    core.src = base.replace(/\/$/, '') + '/salsys-tracker.js';
    core.async = false;

    if (current && current.attributes) {
      for (var i = 0; i < current.attributes.length; i++) {
        var attribute = current.attributes[i];
        if (attribute.name.indexOf('data-') === 0) {
          core.setAttribute(attribute.name, attribute.value);
        }
      }
    }

    core.setAttribute('data-legacy-aliases', 'false');
    if (FORM_MODE !== 'all') core.setAttribute('data-auto-forms', 'false');

    core.onload = expose;
    core.onerror = function () {
      warn('Failed to load browser tracking core.');
    };

    (document.head || document.documentElement).appendChild(core);
  }

  loadCore();
})();
