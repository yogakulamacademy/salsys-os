/* Salsys Universal Tracking Intelligence SDK loader v1.6.1 */
(function () {
  'use strict';

  var current = document.currentScript;
  var base = window.location.origin;

  try {
    if (current && current.src) base = new URL(current.src, window.location.href).origin;
  } catch (_) {}

  function copyDataAttributes(from, to) {
    if (!from || !from.attributes) return;
    for (var i = 0; i < from.attributes.length; i++) {
      var attribute = from.attributes[i];
      if (attribute.name.indexOf('data-') === 0) {
        to.setAttribute(attribute.name, attribute.value);
      }
    }
  }

  var core = document.createElement('script');
  core.src = base.replace(/\/$/, '') + '/salsys-intelligence-core-v1.6.0.js';
  core.async = false;
  copyDataAttributes(current, core);

  core.onload = function () {
    var fallback = document.createElement('script');
    fallback.src = base.replace(/\/$/, '') + '/salsys-intelligence-submit-fallback.js';
    fallback.async = true;
    fallback.setAttribute('data-salsys-sdk-extension', 'configured-form-submit-fallback');
    (document.head || document.documentElement).appendChild(fallback);
  };

  core.onerror = function () {
    if (window.console && console.warn) {
      console.warn('[Salsys Intelligence] Failed to load SDK core.');
    }
  };

  (document.head || document.documentElement).appendChild(core);
})();
