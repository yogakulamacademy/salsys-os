/* Salsys Universal Tracking Intelligence SDK entrypoint v1 */
(function () {
  'use strict';

  if (window.SalsysIntelligence) return;

  function expose() {
    if (!window.Salsys) return;
    window.SalsysIntelligence = window.Salsys;
    window.SalsysIntelligence.product = 'Salsys Universal Tracking Intelligence SDK';
  }

  if (window.Salsys) {
    expose();
    return;
  }

  var current = document.currentScript;
  var base = window.location.origin;
  try {
    if (current && current.src) base = new URL(current.src, window.location.href).origin;
  } catch (_) {}

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

  core.onload = expose;
  core.onerror = function () {
    if (window.console) {
      console.error('[Salsys Intelligence] Failed to load browser tracking core.');
    }
  };

  (document.head || document.documentElement).appendChild(core);
})();
