/* Salsys Universal Tracking Intelligence SDK entrypoint v1.2.0 */
(function () {
  'use strict';

  if (window.SalsysIntelligence && window.SalsysIntelligence.__universalTrackingIntelligenceV1) return;

  var current = document.currentScript;
  var base = window.location.origin;
  try {
    if (current && current.src) base = new URL(current.src, window.location.href).origin;
  } catch (_) {}

  var LEGACY_MIGRATION = !(current && current.dataset && current.dataset.legacyMigration === 'false');
  var LEGACY_DATALAYER = !(current && current.dataset && current.dataset.legacyDatalayer === 'false');
  var DEBUG = Boolean(current && current.dataset && current.dataset.debug === 'true');

  function log() {
    if (!DEBUG || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Salsys Intelligence]');
    console.log.apply(console, args);
  }

  function warn() {
    if (!window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Salsys Intelligence]');
    console.warn.apply(console, args);
  }

  function safeGet(storage, key) {
    try { return storage.getItem(key); } catch (_) { return null; }
  }

  function safeSet(storage, key, value) {
    try { storage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function parseJson(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
  }

  function getCookie(name) {
    try {
      var match = document.cookie.match(
        new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)')
      );
      return match ? decodeURIComponent(match[1]) : null;
    } catch (_) {
      return null;
    }
  }

  function randomId(prefix) {
    var value;
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      value = window.crypto.randomUUID();
    } else {
      value = String(Date.now()) + '_' + Math.random().toString(16).slice(2);
    }
    return prefix + '_' + value;
  }

  function absoluteEndpoint(value, fallbackPath) {
    var raw = value || (base.replace(/\/$/, '') + fallbackPath);
    try { return new URL(raw, window.location.origin).toString(); } catch (_) { return raw; }
  }

  function consentEndpoint() {
    return absoluteEndpoint(
      current && current.dataset ? current.dataset.consentEndpoint : null,
      '/api/privacy/consent/v1'
    );
  }

  function gpcEnabled() {
    return navigator.globalPrivacyControl === true;
  }

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      mode: url.indexOf(window.location.origin) === 0 ? 'same-origin' : 'cors',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data && data.error ? data.error : 'Tracking request failed.');
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  function prepareAttributionCompatibility() {
    if (!LEGACY_MIGRATION) return;
    if (safeGet(window.sessionStorage, 'salsys_session_touch_v1')) return;

    var currentUrl;
    try { currentUrl = new URL(window.location.href); } catch (_) { return; }
    var params = currentUrl.searchParams;

    function param() {
      for (var i = 0; i < arguments.length; i++) {
        var value = params.get(arguments[i]);
        if (value) return value.slice(0, 500);
      }
      return null;
    }

    var touch = {
      source: param('utm_source'),
      medium: param('utm_medium'),
      campaign: param('utm_campaign'),
      content: param('utm_content'),
      term: param('utm_term'),
      utmId: param('utm_id'),
      gclid: param('gclid'),
      gbraid: param('gbraid'),
      wbraid: param('wbraid'),
      fbclid: param('fbclid'),
      campaignId: param('campaign_id', 'campaignid'),
      adsetId: param('adset_id'),
      adId: param('ad_id'),
      adgroupId: param('adgroup_id', 'adgroupid'),
      creativeId: param('creative_id', 'creative')
    };

    if (!touch.source) {
      if (touch.gclid || touch.gbraid || touch.wbraid) {
        touch.source = 'google';
        touch.medium = touch.medium || 'cpc';
      } else if (touch.fbclid) {
        touch.source = 'meta';
        touch.medium = touch.medium || 'paid_social';
      } else if (document.referrer) {
        try {
          var ref = new URL(document.referrer);
          var host = ref.hostname.replace(/^www\./, '').toLowerCase();
          var ownHost = window.location.hostname.replace(/^www\./, '').toLowerCase();
          if (host === ownHost) {
            touch.source = 'direct';
            touch.medium = 'internal';
          } else if (/^google\./.test(host) || host.indexOf('.google.') !== -1) {
            touch.source = 'google';
            touch.medium = 'organic';
          } else if (/instagram\.com$|facebook\.com$|fb\.com$/.test(host)) {
            touch.source = 'meta';
            touch.medium = 'organic_social';
          } else if (/youtube\.com$|youtu\.be$/.test(host)) {
            touch.source = 'youtube';
            touch.medium = 'organic_video';
          } else {
            touch.source = host || 'referral';
            touch.medium = 'referral';
          }
        } catch (_) {
          touch.source = 'referral';
          touch.medium = 'referral';
        }
      } else {
        touch.source = 'direct';
        touch.medium = 'none';
      }
    }

    if (!touch.medium) touch.medium = touch.source === 'direct' ? 'none' : 'referral';

    safeSet(window.sessionStorage, 'salsys_session_touch_v1', JSON.stringify(touch));
    if (!safeGet(window.sessionStorage, 'salsys_first_touch_session_v1')) {
      safeSet(window.sessionStorage, 'salsys_first_touch_session_v1', JSON.stringify(touch));
    }
  }

  function migrateLegacyConsent() {
    if (!LEGACY_MIGRATION) return Promise.resolve();

    var existing = parseJson(safeGet(window.localStorage, 'salsys_privacy_v1'), {});
    if (existing && existing.analytics) return Promise.resolve();

    var legacy = getCookie('yk_analytics_consent');
    if (legacy !== '1' && legacy !== '0') return Promise.resolve();

    var decision = legacy === '1' ? 'granted' : 'denied';
    var legacyVisitor = getCookie('yk_vid');
    var legacySession = safeGet(window.sessionStorage, 'yk_sid');
    var legacyFirstTouch = safeGet(window.localStorage, 'yk_first_touch_v1');
    var migrationVisitor = legacyVisitor || safeGet(window.sessionStorage, 'salsys_vid_session') || randomId('v_legacy');

    if (legacy === '1') {
      if (legacyVisitor) {
        safeSet(window.localStorage, 'salsys_vid', legacyVisitor);
        safeSet(window.sessionStorage, 'salsys_vid_session', legacyVisitor);
      }
      if (legacySession) safeSet(window.sessionStorage, 'salsys_sid', legacySession);
      if (legacyFirstTouch) safeSet(window.localStorage, 'salsys_first_touch_v1', legacyFirstTouch);
    }

    var payload = {
      event_id: randomId('consent_migration'),
      visitor_id: migrationVisitor,
      occurred_at: new Date().toISOString(),
      gpc: gpcEnabled(),
      decisions: { analytics: decision }
    };

    return postJson(consentEndpoint(), payload).then(function (result) {
      var state = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
      state.analytics = decision;
      state.updated_at = new Date().toISOString();
      state.gpc = gpcEnabled();
      state.migration_source = 'legacy_yk_analytics_cookie';
      safeSet(window.localStorage, 'salsys_privacy_v1', JSON.stringify(state));
      log('Migrated legacy analytics consent', decision, result);
    }).catch(function (error) {
      if (decision === 'denied') {
        var deniedState = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
        deniedState.analytics = 'denied';
        deniedState.updated_at = new Date().toISOString();
        deniedState.migration_source = 'legacy_yk_analytics_cookie_local_only';
        safeSet(window.localStorage, 'salsys_privacy_v1', JSON.stringify(deniedState));
      }
      warn('Legacy consent migration could not be recorded; analytics remains fail-closed.', error && error.message ? error.message : error);
    });
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

    function copy(sourceKey, targetKey) {
      if (!Object.prototype.hasOwnProperty.call(detail, sourceKey)) return;
      var decision = normalizeDecision(detail[sourceKey]);
      if (decision) normalized[targetKey] = decision;
    }

    copy('analytics', 'analytics');
    copy('marketing', 'marketing');
    copy('advertising', 'advertising');
    copy('sale_sharing', 'sale_sharing');
    copy('personalization', 'personalization');
    copy('adUserData', 'advertising');
    copy('adPersonalization', 'personalization');

    return normalized;
  }

  function legacyEventAction(value) {
    var eventType = String(value || '').trim().toLowerCase();
    if (!eventType) return null;
    var aliases = {
      whatsapp_click: 'whatsapp_click',
      phone_click: 'phone_click',
      call_click: 'phone_click',
      email_click: 'email_click',
      instagram_click: 'instagram_click',
      enrollment_cta_click: 'enrollment_cta_click',
      enrollment_click: 'enrollment_cta_click',
      enroll_click: 'enrollment_cta_click',
      enroll_now: 'enrollment_cta_click'
    };
    return aliases[eventType] || (/^[a-z][a-z0-9_]{0,79}$/.test(eventType) ? eventType : null);
  }

  function canonicalFromLegacyEvent(value) {
    var eventType = String(value || '').trim().toLowerCase();
    if (eventType === 'page_view') return { name: 'web.page_viewed', properties: {} };
    if (eventType === 'form_start') return { name: 'web.form_started', properties: {} };
    if (eventType === 'lead_form_submit') return { name: 'web.form_submitted', properties: {} };
    var action = legacyEventAction(eventType);
    if (action) return { name: 'web.cta_clicked', properties: { action: action } };
    return null;
  }

  function pushDataLayer(payload) {
    if (!LEGACY_DATALAYER) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }

  function installCompatibility(api) {
    if (!api || api.__universalCompatibilityInstalled) return;
    api.__universalCompatibilityInstalled = true;

    function applyConsent(detail) {
      var normalized = normalizeConsentDetail(detail);
      if (!Object.keys(normalized).length) return Promise.resolve({ skipped: true, reason: 'no_supported_decisions' });
      return api.consent(normalized);
    }

    window.addEventListener('salsys:consent', function (event) {
      applyConsent(event && event.detail).catch(function () {});
    });

    window.addEventListener('yk:consent', function (event) {
      applyConsent(event && event.detail).catch(function () {});
    });

    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('a,[data-yk-event]') : null;
      if (!target) return;
      if (target.hasAttribute('data-salsys-event') || target.hasAttribute('data-salsys-track')) return;

      var href = String(target.getAttribute('href') || '');
      var lower = href.toLowerCase();
      if (lower.indexOf('wa.me') !== -1 || lower.indexOf('whatsapp') !== -1 || lower.indexOf('tel:') === 0 || lower.indexOf('mailto:') === 0) {
        return;
      }

      var action = legacyEventAction(target.getAttribute('data-yk-event'));
      if (!action && /instagram\.com/.test(lower)) action = 'instagram_click';
      if (!action && /enrol|enroll|reservation|reserve|book-now|booking|checkout/.test(lower)) action = 'enrollment_cta_click';
      if (!action) return;

      var properties = {
        action: action,
        channel: target.getAttribute('data-yk-channel') || (action === 'instagram_click' ? 'instagram' : action === 'enrollment_cta_click' ? 'website' : null),
        label: String(target.getAttribute('data-yk-label') || target.getAttribute('aria-label') || target.textContent || '').trim().slice(0, 160),
        element: String(target.tagName || '').toLowerCase(),
        compatibility_source: target.hasAttribute('data-yk-event') ? 'legacy_data_attribute' : 'legacy_auto_classifier'
      };

      if (href) {
        try {
          var destination = new URL(href, window.location.href);
          properties.destination_origin = destination.origin;
          properties.destination_path = destination.pathname;
        } catch (_) {}
      }

      api.track('web.cta_clicked', properties, { keepalive: true }).catch(function () {});
    }, { capture: true });

    window.YKTracking = {
      status: function () {
        return {
          loaded: true,
          compatibility: true,
          sdk: api.version || null,
          config: api.config ? api.config() : null,
          privacy: api.privacy ? api.privacy() : null
        };
      },
      context: function () {
        return api.identifiers ? api.identifiers() : null;
      },
      updateConsent: applyConsent,
      consent: applyConsent,
      send: function (eventType, metadata) {
        var mapped = canonicalFromLegacyEvent(eventType);
        if (!mapped) return Promise.reject(new Error('Unsupported legacy event type. Use SalsysIntelligence.track() with a registered canonical event.'));
        return api.track(mapped.name, Object.assign({}, mapped.properties, metadata || {}), { keepalive: true });
      }
    };

    if (api.identifiers) {
      var ids = api.identifiers();
      pushDataLayer({
        event: 'yk_tracking_ready',
        yk_visitor_id: ids && ids.visitor_id ? ids.visitor_id : null,
        yk_session_id: ids && ids.session_id ? ids.session_id : null,
        yk_source: ids && ids.session_touch ? ids.session_touch.source || null : null,
        yk_medium: ids && ids.session_touch ? ids.session_touch.medium || null : null,
        yk_campaign: ids && ids.session_touch ? ids.session_touch.campaign || null : null,
        compatibility_bridge: true
      });
    }

    pushDataLayer({ event: 'salsys_tracking_ready', sdk_version: api.version || null });
  }

  function expose() {
    if (!window.Salsys) return;
    window.SalsysIntelligence = window.Salsys;
    window.SalsysIntelligence.product = 'Salsys Universal Tracking Intelligence SDK';
    window.SalsysIntelligence.__universalTrackingIntelligenceV1 = true;
    installCompatibility(window.SalsysIntelligence);
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

    core.onload = expose;
    core.onerror = function () {
      warn('Failed to load browser tracking core.');
    };

    (document.head || document.documentElement).appendChild(core);
  }

  prepareAttributionCompatibility();
  migrateLegacyConsent().then(loadCore).catch(loadCore);
})();
