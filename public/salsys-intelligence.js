/* Salsys Universal Tracking Intelligence SDK entrypoint v1.6.0 */
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
  var FORM_DISCOVERY_ENDPOINT =
    (current && current.dataset && current.dataset.salsysFormsEndpoint) ||
    (base.replace(/\/$/, '') + '/api/tracking/forms/browser/v1' +
      (SITE_ID ? '?site_id=' + encodeURIComponent(SITE_ID) : ''));
  var FORM_CONFIGS = [];
  var lastDiscoverySignature = '';
  var discoveryTimer = null;

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

  function formMethod(form) {
    var method = String(form && form.method ? form.method : 'get').trim().toLowerCase();
    return ['get', 'post', 'put', 'patch', 'delete'].indexOf(method) >= 0 ? method : 'post';
  }

  function explicitLeadForm(form) {
    return Boolean(form && form.matches && form.matches('form[data-salsys-lead-form]'));
  }

  function configForForm(form) {
    if (!form) return null;
    var name = formId(form);
    var action = formAction(form);
    var method = formMethod(form);
    var path = window.location.pathname || '/';

    for (var i = 0; i < FORM_CONFIGS.length; i++) {
      var config = FORM_CONFIGS[i] || {};
      if (
        String(config.form_name || 'anonymous') === name &&
        String(config.page_path || '/') === path &&
        String(config.form_action || '') === String(action || '') &&
        String(config.method || 'post').toLowerCase() === method
      ) {
        return config;
      }
    }
    return null;
  }

  function configuredLeadForm(form) {
    var config = configForForm(form);
    return Boolean(
      config &&
      config.status !== 'ignored' &&
      config.lead_capture_enabled === true
    );
  }

  function autoLeadForm(form) {
    if (!form || !form.querySelector || LEAD_CAPTURE_MODE !== 'auto') return false;
    if (form.querySelector('input[type="password"], input[autocomplete="current-password"], input[autocomplete="new-password"]')) {
      return false;
    }

    if (formMethod(form) === 'get') return false;

    var hasEmail = Boolean(
      form.querySelector('input[type="email"], input[name*="email" i]')
    );
    var hasPhone = Boolean(
      form.querySelector('input[type="tel"], input[name*="phone" i], input[name*="mobile" i], input[name*="whatsapp" i]')
    );

    return hasEmail || hasPhone;
  }

  function isLeadForm(form) {
    return explicitLeadForm(form) || configuredLeadForm(form) || autoLeadForm(form);
  }

  function candidateLeadForms() {
    return document.querySelectorAll('form');
  }

  function safeFieldValue(form, selectors, max) {
    for (var i = 0; i < selectors.length; i++) {
      if (!selectors[i]) continue;
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

  function mappedSelector(form, key) {
    var config = configForForm(form);
    var mapping = config && config.field_mapping && typeof config.field_mapping === 'object'
      ? config.field_mapping
      : {};
    return typeof mapping[key] === 'string' ? mapping[key] : null;
  }

  function leadFields(form) {
    return {
      firstName: safeFieldValue(form, [
        mappedSelector(form, 'firstName'),
        '[data-salsys-field="name"]',
        '[data-salsys-field="first_name"]',
        'input[name="name" i]',
        'input[name="full_name" i]',
        'input[name="fullname" i]',
        'input[name="first_name" i]',
        'input[name="firstname" i]'
      ], 160),
      lastName: safeFieldValue(form, [
        mappedSelector(form, 'lastName'),
        '[data-salsys-field="last_name"]',
        'input[name="last_name" i]',
        'input[name="lastname" i]'
      ], 160),
      email: safeFieldValue(form, [
        mappedSelector(form, 'email'),
        '[data-salsys-field="email"]',
        'input[type="email"]',
        'input[name="email" i]',
        'input[name*="email" i]'
      ], 320),
      phone: safeFieldValue(form, [
        mappedSelector(form, 'phone'),
        '[data-salsys-field="phone"]',
        'input[type="tel"]',
        'input[name="phone" i]',
        'input[name="mobile" i]',
        'input[name="whatsapp" i]',
        'input[name*="phone" i]'
      ], 80),
      country: safeFieldValue(form, [
        mappedSelector(form, 'country'),
        '[data-salsys-field="country"]',
        'select[name="country" i]',
        'input[name="country" i]'
      ], 120),
      courseCode: safeFieldValue(form, [
        mappedSelector(form, 'courseCode'),
        '[data-salsys-field="course"]',
        '[data-salsys-field="course_code"]',
        'input[name="course_id" i]',
        'select[name="course_id" i]',
        'input[name="course" i]',
        'select[name="course" i]'
      ], 120),
      message: safeFieldValue(form, [
        mappedSelector(form, 'message'),
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

  function attributeSelector(name, value) {
    if (!value) return null;
    return '[' + name + '="' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
  }

  function safeDiscoveryField(field) {
    if (!field || field.disabled) return null;
    var tag = String(field.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea'].indexOf(tag) < 0) return null;

    var rawType = tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : String(field.type || 'text').toLowerCase();
    var sensitiveText = [field.name, field.id, field.autocomplete, rawType].join(' ');
    if (/password|secret|token|cvv|cvc|card.?number|ssn/i.test(sensitiveText)) return null;
    if (rawType === 'file' || rawType === 'submit' || rawType === 'button' || rawType === 'reset') return null;

    var selector = null;
    var dataField = field.getAttribute && field.getAttribute('data-salsys-field');
    if (dataField) selector = attributeSelector('data-salsys-field', dataField);
    if (!selector && field.name) selector = attributeSelector('name', field.name);
    if (!selector && field.id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(field.id)) selector = '#' + field.id;
    if (!selector) return null;

    var label = null;
    try {
      if (field.id) {
        var linked = document.querySelector('label[for="' + String(field.id).replace(/"/g, '\\"') + '"]');
        if (linked && linked.textContent) label = linked.textContent.trim();
      }
      if (!label && field.closest) {
        var parentLabel = field.closest('label');
        if (parentLabel && parentLabel.textContent) label = parentLabel.textContent.trim();
      }
      if (!label && field.getAttribute) {
        label = field.getAttribute('aria-label') || field.getAttribute('placeholder') || null;
      }
    } catch (_) {}

    var allowedTypes = ['text', 'email', 'tel', 'number', 'date', 'month', 'checkbox', 'radio', 'hidden', 'url', 'select', 'textarea'];
    var type = allowedTypes.indexOf(rawType) >= 0 ? rawType : 'other';

    return {
      selector: selector.slice(0, 300),
      name: field.name ? String(field.name).slice(0, 160) : null,
      type: type,
      label: label ? String(label).replace(/\s+/g, ' ').trim().slice(0, 200) : null,
      required: Boolean(field.required)
    };
  }

  function discoveryDescriptor(form) {
    var fields = [];
    var elements = form && form.querySelectorAll ? form.querySelectorAll('input, select, textarea') : [];
    for (var i = 0; i < elements.length && fields.length < 60; i++) {
      var field = safeDiscoveryField(elements[i]);
      if (field) fields.push(field);
    }

    var containsPassword = Boolean(
      form && form.querySelector && form.querySelector('input[type="password"], input[autocomplete="current-password"], input[autocomplete="new-password"]')
    );
    var hasEmailOrPhone = Boolean(
      form && form.querySelector && form.querySelector('input[type="email"], input[type="tel"], input[name*="email" i], input[name*="phone" i], input[name*="mobile" i], input[name*="whatsapp" i]')
    );

    return {
      formName: formId(form),
      pagePath: window.location.pathname || '/',
      formAction: formAction(form),
      method: formMethod(form),
      likelyLeadForm: !containsPassword && formMethod(form) !== 'get' && hasEmailOrPhone,
      containsPassword: containsPassword,
      fields: fields
    };
  }

  function applyDiscoveredConfigs(configs, api) {
    FORM_CONFIGS = Array.isArray(configs) ? configs : [];
    if (!api) return;
    var forms = candidateLeadForms();
    for (var i = 0; i < forms.length; i++) {
      if (isLeadForm(forms[i])) api.decorateForm(forms[i]);
    }
  }

  function reportDetectedForms(api) {
    if (!SITE_ID || !document.querySelectorAll) return Promise.resolve({ ok: true, detected: 0 });
    var forms = document.querySelectorAll('form');
    var descriptors = [];
    for (var i = 0; i < forms.length && descriptors.length < 30; i++) {
      descriptors.push(discoveryDescriptor(forms[i]));
    }

    var signature = JSON.stringify(descriptors);
    if (signature === lastDiscoverySignature) return Promise.resolve({ ok: true, unchanged: true });
    lastDiscoverySignature = signature;

    return fetch(FORM_DISCOVERY_ENDPOINT, {
      method: 'POST',
      mode: FORM_DISCOVERY_ENDPOINT.indexOf(window.location.origin) === 0 ? 'same-origin' : 'cors',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forms: descriptors })
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data && data.error ? data.error : 'Form discovery failed.');
        applyDiscoveredConfigs(data && data.forms, api);
        return data;
      });
    }).catch(function (error) {
      warn('Form discovery failed.', error && error.message ? error.message : error);
      return { ok: false };
    });
  }

  function scheduleDiscovery(api) {
    if (discoveryTimer) window.clearTimeout(discoveryTimer);
    discoveryTimer = window.setTimeout(function () {
      discoveryTimer = null;
      reportDetectedForms(api);
    }, 700);
  }

  function installFormDiscovery(api) {
    var run = function () { reportDetectedForms(api); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }

    if (window.MutationObserver && document.documentElement) {
      try {
        var observer = new MutationObserver(function (mutations) {
          for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
              scheduleDiscovery(api);
              return;
            }
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      } catch (_) {}
    }
  }

  function captureLead(form, api) {
    if (!form || !api || !isLeadForm(form)) {
      return Promise.resolve({ ok: true, accepted: false, reason: 'lead_capture_disabled' });
    }

    var fields = leadFields(form);
    if (!fields.email && !fields.phone && !fields.firstName) {
      return Promise.resolve({ ok: true, accepted: false, reason: 'no_lead_identity_fields' });
    }

    var identifiers = typeof api.identifiers === 'function' ? api.identifiers() : {};
    var config = configForForm(form);
    var captureMode = explicitLeadForm(form)
      ? 'explicit'
      : configuredLeadForm(form)
        ? 'configured'
        : 'auto';
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
        capture_mode: captureMode,
        detected_form_key: config && config.form_key ? config.form_key : null,
        sdk: 'salsys-intelligence',
        sdk_version: '1.6.0'
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
    api.detectForms = function () {
      return reportDetectedForms(api);
    };

    installLeadFormTracking(api);
    installFormDiscovery(api);

    window.SalsysIntelligence = api;
    window.SalsysIntelligence.product = 'Salsys Universal Tracking Intelligence SDK';
    window.SalsysIntelligence.__universalTrackingIntelligenceV1 = true;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'salsys_tracking_ready',
      sdk_version: '1.6.0',
      lead_capture_mode: LEAD_CAPTURE_MODE,
      form_discovery: Boolean(SITE_ID)
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
