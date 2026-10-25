/* Salsys configured-form submit fallback v1.1.0 */
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

  function capture(form) {
    var api = sdk();
    if (!form || !api || typeof api.captureLead !== 'function') return;
    if (!valid(form) || recentlyCaptured(form)) return;

    markCaptured(form);
    api.captureLead(form).catch(function () {});
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || String(form.tagName || '').toLowerCase() !== 'form') return;
    markCaptured(form);
  }, true);

  document.addEventListener('click', function (event) {
    var control = event.target && event.target.closest
      ? event.target.closest('button, input[type="submit"], input[type="button"], [data-salsys-submit]')
      : null;
    if (!isSubmitControl(control)) return;

    var form = control.form || (control.closest ? control.closest('form') : null);
    if (!form) return;

    window.setTimeout(function () {
      capture(form);
    }, 0);
  }, true);
})();
