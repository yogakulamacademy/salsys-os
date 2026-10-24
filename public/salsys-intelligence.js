/* Salsys Universal Tracking Intelligence SDK entrypoint v1.5.0 */
(function () {
  'use strict';

  if (window.SalsysIntelligence && window.SalsysIntelligence.__universalTrackingIntelligenceV1) return;

  var current = document.currentScript;
  var base = window.location.origin;
  try {
    if (current && current.src) base = new URL(current.src, window.location.href).origin;
  } catch (_) {}

  var FORM_MODE = (current && current.dataset && current.dataset.formMode) || 'lead-only';
  var LEAD_CAPTURE_MODE =
    (current && current.dataset && current.dataset.salsysLeadCapture) || 'off';
  var SITE_ID =
    (current && current.dataset && current.dataset.salsysSite) || '';
  var LEAD_ENDPOINT =
    (current && current.dataset && current.dataset.salsysLeadEndpoint) ||
    (base.replace(/\/$/, '') + '/api/leads/browser/v1' +
      (SITE_ID ? '?site_id=' + encodeURIComponent(SITE_ID) : ''));

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

  function explicitLeadForm(form) {
    return Boolean(form && form.matches && form.matches('form[data-salsys-lead-form]'));
  }

  function autoLeadForm(form) {
    if (!form || !form.querySelector || LEAD_CAPTURE_MODE !== 'auto') return false;
    if (form.querySelector('input[type="password"], input[autocomplete="current-password"], input[autocomplete="new-password"]')) {
      return false;
    }

    var method = String(form.method || 'get').toLowerCase();
    if (method === 'get') return false;

    var hasEmail = Boolean(
      form.querySelector('input[type="email"], input[name*="email" i]')
    );
    var hasPhone = Boolean(
      form.querySelector('input[type="tel"], input[name*="phone" i], input[name*="mobile" i], input[name*="whatsapp" i]')
    );

    return hasEmail || hasPhone;
  }

  function isLeadForm(form) {
    return explicitLeadForm(form) || autoLeadForm(form);
  }

  function candidateLeadForms() {
    if (LEAD_CAPTURE_MODE === 'auto') return document.querySelectorAll('form');
    return document.querySelectorAll('form[data-salsys-lead-form]');
  }

  function safeFieldValue(form, selectors, max) {
    for (var i = 0; i < selectors.length; i++) {
      var field = null;
      try { field = form.querySelector(selectors[i]); } catch (_) {}
      if (!field || field.disabled) continue;

      var type = String(field.type || '').toLowerCase();
      if (type === 'password' || type === 'file') continue;

      var value = typeof field.value === 'string' ? field.value.trim() : '';
      if (value) return value.slice(0, max || 500);
    }
    return null;
  }

  function leadFields(form) {
    return {
      firstName: safeFieldValue(form, [
        '[data-salsys-field="name"]',
        '[data-salsys-field="first_name"]',
        'input[name="name" i]',
        'input[name="full_name" i]',
        'input[name="fullname" i]',
        'input[name="first_name" i]',
        'input[name="firstname" i]'
      ], 160),
      lastName: safeFieldValue(form, [
        '[data-salsys-field="last_name"]',
        'input[name="last_name" i]',
        'input[name="lastname" i]'
      ], 160),
      email: safeFieldValue(form, [
        '[data-salsys-field="email"]',
        'input[type="email"]',
        'input[name="email" i]',
        'input[name*="email" i]'
      ], 320),
      phone: safeFieldValue(form, [
        '[data-salsys-field="phone"]',
        'input[type="tel"]',
        'input[name="phone" i]',
        'input[name="mobile" i]',
        'input[name="whatsapp" i]',
        'input[name*="phone" i]'
      ], 80),
      country: safeFieldValue(form, [
        '[data-salsys-field="country"]',
        'select[name="country" i]',
        'input[name="country" i]'
      ], 120),
      courseCode: safeFieldValue(form, [
        '[data-salsys-field="course"]',
        '[data-salsys-field="course_code"]',
        'input[name="course_id" i]',
        'select[name="course_id" i]',
        'input[name="course" i]',
        'select[name="course" i]'
      ], 120),
      message: safeFieldValue(form, [
        '[data-salsys-field="message"]',
        'textarea[name="message" i]',
        'textarea[name="enquiry" i]',
        'textarea[name="inquiry" i]',
        'textarea[name="query" i]'
      ], 8000)
    };
  }

  function randomLeadEventId() {
    var id = null;
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        id = window.crypto.randomUUID();
      }
    } catch (_) {}
    if (!id) id = String(Date.now()) + '_' + Math.random().toString(16).slice(2);
    return 'browser_lead_' + id;
  }

  function captureLead(form, api) {
    if (!form || !api || LEAD_CAPTURE_MODE === 'off' || !isLeadForm(form)) {
      return Promise.resolve({ ok: true, accepted: false, reason: 'lead_capture_disabled' });
    }

    var fields = leadFields(form);
    if (!fields.email && !fields.phone && !fields.firstName) {
      return Promise.resolve({ ok: true, accepted: false, reason: 'no_lead_identity_fields' });
    }

    var identifiers = typeof api.identifiers === 'function' ? api.identifiers() : {};
    var payload = {
      externalEventId: randomLeadEventId(),
      site: window.location.hostname,
      formName: formId(form),
      firstName: fields.firstName,
      lastName: fields.lastName,
      email: fields.email,
      phone: fields.phone,
      country: fields.country,
      courseCode: fields.courseCode,
      message: fields.message,
      timezone:
        window.Intl && Intl.DateTimeFormat
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || null
          : null,
      anonymousVisitorId: identifiers.visitor_id || null,
      sessionKey: identifiers.session_id || null,
      firstTouch: identifiers.first_touch || {},
      sessionTouch: identifiers.session_touch || {},
      metadata: {
        page_path: window.location.pathname,
        page_title: document.title ? String(document.title).slice(0, 300) : null,
        form_action: formAction(form),
        capture_mode: explicitLeadForm(form) ? 'explicit' : 'auto',
        sdk: 'salsys-intelligence',
        sdk_version: '1.5.0'
      }
    };

    return fetch(LEAD_ENDPOINT, {
      method: 'POST',
      mode: LEAD_ENDPOINT.indexOf(window.location.origin) === 0 ? 'same-origin' : 'cors',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          throw new Error(data && data.error ? data.error : 'Lead capture request failed.');
        }
        return data;
      });
    });
  }

  function installLeadFormTracking(api) {
    if (!api) return;

    var trackLeadEventsHere = FORM_MODE !== 'all';
    var startedForms = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    var initial = candidateLeadForms();
    for (var i = 0; i < initial.length; i++) {
      if (isLeadForm(initial[i])) api.decorateForm(initial[i]);
    }

    document.addEventListener('focusin', function (event) {
      var form = event.target && event.target.closest
        ? event.target.closest('form')
        : null;
      if (!isLeadForm(form) || (startedForms && startedForms.has(form))) return;
      if (startedForms) startedForms.add(form);
      api.decorateForm(form);

      if (trackLeadEventsHere) {
        api.track('web.form_started', {
          form_id: formId(form),
          form_action: formAction(form),
          form_kind: 'lead'
        }, { keepalive: true }).catch(function () {});
      }
    }, { capture: true });

    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!isLeadForm(form)) return;
      api.decorateForm(form);

      if (trackLeadEventsHere) {
        api.track('web.form_submitted', {
          form_id: formId(form),
          form_action: formAction(form),
          form_kind: 'lead'
        }, { keepalive: true, queue: false }).catch(function () {});
      }

      captureLead(form, api).catch(function (error) {
        warn('Lead capture failed.', error && error.message ? error.message : error);
      });
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

    api.captureLead = function (form) {
      return captureLead(form, api);
    };

    installLeadFormTracking(api);

    window.SalsysIntelligence = api;
    window.SalsysIntelligence.product = 'Salsys Universal Tracking Intelligence SDK';
    window.SalsysIntelligence.__universalTrackingIntelligenceV1 = true;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'salsys_tracking_ready',
      sdk_version: api.version || null,
      lead_capture_mode: LEAD_CAPTURE_MODE
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
