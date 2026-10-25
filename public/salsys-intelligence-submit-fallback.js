/* Salsys configured-form submit fallback v1.2.0 */
(function () {
  'use strict';

  if (window.__SalsysConfiguredFormSubmitFallbackV1) return;
  window.__SalsysConfiguredFormSubmitFallbackV1 = true;

  var recent = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var DEDUPE_MS = 1800;

  function sdk() {
    return window.SalsysIntelligence || window.Salsys || null;
  }

  function submitHint(node) {
    if (!node) return '';
    return [
      node.textContent,
      node.value,
      node.name,
      node.id,
      typeof node.className === 'string' ? node.className : '',
      node.getAttribute ? node.getAttribute('aria-label') : ''
    ].join(' ');
  }

  function isSubmitControl(node) {
    if (!node || !node.matches || node.disabled) return false;

    if (node.matches('input[type="submit"], button[type="submit"], button:not([type]), [data-salsys-submit]')) {
      return true;
    }

    if (!node.matches('button[type="button"], input[type="button"]')) return false;

    return /submit|send|enroll|enrol|register|apply|book|continue|proceed|download|request|inquir|enquir/i.test(
      submitHint(node)
    );
  }

  function valid(form) {
    try {
      return typeof form.checkValidity !== 'function' || form.checkValidity();
    } catch (_) {
      return true;
    }
  }

  function recentlyCaptured(form) {
    if (!recent) return false;
    var previous = recent.get(form) || 0;
    return Date.now() - previous < DEDUPE_MS;
  }

  function markCaptured(form) {
    if (recent) recent.set(form, Date.now());
  }

  function fieldVisible(field) {
    if (!field || field.disabled) return false;
    try {
      if (field.offsetParent !== null) return true;
      if (field.getClientRects && field.getClientRects().length > 0) return true;
    } catch (_) {}
    return false;
  }

  function selectedCourseValue(field) {
    if (!field || field.disabled) return null;

    var tag = String(field.tagName || '').toLowerCase();
    if (tag === 'select') {
      var option = field.options && field.selectedIndex >= 0
        ? field.options[field.selectedIndex]
        : null;
      if (!option || option.disabled) return null;

      var optionCode = option.getAttribute && option.getAttribute('data-course-code');
      if (optionCode && String(optionCode).trim()) return String(optionCode).trim();

      var label = String(option.textContent || '').replace(/\s+/g, ' ').trim();
      if (label && !/^select\b|^choose\b|^please\b/i.test(label)) return label;

      var value = typeof field.value === 'string' ? field.value.trim() : '';
      return value || null;
    }

    if ((field.type === 'radio' || field.type === 'checkbox') && !field.checked) {
      return null;
    }

    var code = field.getAttribute && field.getAttribute('data-course-code');
    if (code && String(code).trim()) return String(code).trim();

    var value = typeof field.value === 'string' ? field.value.trim() : '';
    return value || null;
  }

  function activeCourseIntent(form) {
    if (!form || !form.querySelectorAll) return null;

    var selectors = [
      '[data-salsys-course-source]',
      'select[id*="course" i]',
      'select[name*="course" i]',
      'input[type="radio"][name*="course" i]:checked'
    ];

    for (var s = 0; s < selectors.length; s++) {
      var fields = [];
      try { fields = form.querySelectorAll(selectors[s]); } catch (_) {}

      for (var i = 0; i < fields.length; i++) {
        if (!fieldVisible(fields[i])) continue;
        var value = selectedCourseValue(fields[i]);
        if (value) return value;
      }
    }

    return null;
  }

  function synchronizeCourseIntent(form) {
    if (!form || !form.querySelector) return;

    var destination = null;
    try {
      destination = form.querySelector('input[name="course" i], input[name="course_code" i]');
    } catch (_) {}

    if (!destination || destination.disabled) return;

    var existing = typeof destination.value === 'string'
      ? destination.value.trim()
      : '';
    if (existing) return;

    var intent = activeCourseIntent(form);
    if (!intent) return;

    destination.value = intent;
    try {
      destination.dispatchEvent(new Event('input', { bubbles: true }));
      destination.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
  }

  function capture(form) {
    var api = sdk();
    if (!form || !api || typeof api.captureLead !== 'function') return;
    if (!valid(form) || recentlyCaptured(form)) return;

    synchronizeCourseIntent(form);
    markCaptured(form);
    api.captureLead(form).catch(function () {});
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || String(form.tagName || '').toLowerCase() !== 'form') return;
    synchronizeCourseIntent(form);
    markCaptured(form);
  }, true);

  document.addEventListener('click', function (event) {
    var control = event.target && event.target.closest
      ? event.target.closest('button, input[type="submit"], input[type="button"], [data-salsys-submit]')
      : null;
    if (!isSubmitControl(control)) return;

    var form = control.form || (control.closest ? control.closest('form') : null);
    if (!form) return;

    synchronizeCourseIntent(form);

    window.setTimeout(function () {
      capture(form);
    }, 0);
  }, true);
})();
