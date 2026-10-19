/* Salsys Event Intelligence - first-party browser SDK v1.0.0 */
(function () {
  'use strict';

  if (window.SalsysEvent && window.SalsysEvent.__v1) return;

  function findScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || '';
      if (src.indexOf('salsys-event-tracker.js') !== -1) return scripts[i];
    }
    return null;
  }

  var script = findScript();
  var EVENT_ENDPOINT = script && script.dataset.eventEndpoint
    ? script.dataset.eventEndpoint
    : '/api/tracking/event.php';
  var CONSENT_ENDPOINT = script && script.dataset.consentEndpoint
    ? script.dataset.consentEndpoint
    : '/api/tracking/consent.php';
  var SITE = script && script.dataset.site ? script.dataset.site : location.hostname;
  var CONSENT_MODE = script && script.dataset.consentMode
    ? script.dataset.consentMode
    : 'required';
  var AUTO_PAGE = !(script && script.dataset.autoPage === 'false');
  var AUTO_CLICKS = !(script && script.dataset.autoClicks === 'false');
  var AUTO_FORMS = !(script && script.dataset.autoForms === 'false');
  var DEBUG = Boolean(script && script.dataset.debug === 'true');
  var COOKIE_DAYS = Number(script && script.dataset.cookieDays || '90');

  var storageOK = true;
  try {
    localStorage.setItem('__salsys_test', '1');
    localStorage.removeItem('__salsys_test');
  } catch (_) {
    storageOK = false;
  }

  function log() {
    if (!DEBUG || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[SalsysEvent]');
    console.log.apply(console, args);
  }

  function uid(prefix) {
    var id;
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      id = window.crypto.randomUUID();
    } else if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      id = Array.prototype.map.call(bytes, function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    } else {
      id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    return prefix + '_' + id;
  }

  function getCookie(name) {
    var escaped = name.replace(/([.$?*|{}()\[\]\\\/+^])/g, '\\$1');
    var match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    var maxAge = Math.max(1, Number(days || COOKIE_DAYS)) * 86400;
    document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + maxAge + '; samesite=lax';
  }

  function deleteCookie(name) {
    document.cookie = name + '=; path=/; max-age=0; samesite=lax';
  }

  function safeLocalGet(key) {
    if (!storageOK) return null;
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function safeLocalSet(key, value) {
    if (!storageOK) return false;
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function safeLocalRemove(key) {
    if (!storageOK) return;
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function safeSessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (_) { return null; }
  }

  function safeSessionSet(key, value) {
    try { sessionStorage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function safeSessionRemove(key) {
    try { sessionStorage.removeItem(key); } catch (_) {}
  }

  function parseJson(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
  }

  function gpcEnabled() {
    return navigator.globalPrivacyControl === true;
  }

  function initialAnalyticsConsent() {
    if (CONSENT_MODE === 'none' || CONSENT_MODE === 'granted') return true;
    var current = getCookie('salsys_analytics_consent');
    if (current === null) current = getCookie('yk_analytics_consent');
    if (current === '1') return true;
    if (current === '0') return false;
    return null;
  }

  var consentState = {
    analytics: initialAnalyticsConsent(),
    adUserData: null,
    adPersonalization: null,
    marketing: null,
    mode: CONSENT_MODE,
    source: 'salsys_event_sdk'
  };

  var ephemeralVisitorId = uid('vis');
  var ephemeralSessionId = uid('ses');

  function analyticsGranted() {
    return consentState.analytics === true;
  }

  function getVisitorId() {
    if (!analyticsGranted()) return ephemeralVisitorId;
    var existing = getCookie('salsys_vid') || getCookie('yk_vid');
    if (!existing) existing = ephemeralVisitorId;
    setCookie('salsys_vid', existing);
    // Keep the legacy identifier during migration so existing Yogakulam forms
    // and historical identity linkage do not break during tracker cutover.
    setCookie('yk_vid', existing);
    return existing;
  }

  function getSessionId() {
    if (!analyticsGranted()) return ephemeralSessionId;
    var existing = safeSessionGet('salsys_sid') || safeSessionGet('yk_sid');
    if (!existing) existing = ephemeralSessionId;
    safeSessionSet('salsys_sid', existing);
    safeSessionSet('yk_sid', existing);
    return existing;
  }

  function referrerSource() {
    if (!document.referrer) return { source: 'direct', medium: 'none' };
    try {
      var host = new URL(document.referrer).hostname.replace(/^www\./, '').toLowerCase();
      var own = location.hostname.replace(/^www\./, '').toLowerCase();
      if (host === own) return { source: 'direct', medium: 'internal' };
      if (/google\./i.test(host)) return { source: 'google', medium: 'organic' };
      if (/bing\.com/i.test(host)) return { source: 'bing', medium: 'organic' };
      if (/instagram\.com|facebook\.com|fb\.com/i.test(host)) return { source: 'meta', medium: 'organic_social' };
      if (/youtube\.com|youtu\.be/i.test(host)) return { source: 'youtube', medium: 'organic_video' };
      return { source: host, medium: 'referral' };
    } catch (_) {
      return { source: 'referral', medium: 'referral' };
    }
  }

  function touchFromUrl() {
    var p = new URLSearchParams(location.search || '');
    var fallback = referrerSource();
    var hasGoogle = p.get('gclid') || p.get('gbraid') || p.get('wbraid');
    var hasMeta = p.get('fbclid');
    return {
      source: p.get('utm_source') || (hasGoogle ? 'google' : hasMeta ? 'meta' : fallback.source),
      medium: p.get('utm_medium') || (hasGoogle ? 'cpc' : hasMeta ? 'paid_social' : fallback.medium),
      campaign: p.get('utm_campaign'),
      content: p.get('utm_content'),
      term: p.get('utm_term'),
      utmId: p.get('utm_id'),
      gclid: p.get('gclid'),
      gbraid: p.get('gbraid'),
      wbraid: p.get('wbraid'),
      fbclid: p.get('fbclid'),
      campaignId: p.get('campaign_id') || p.get('campaignid'),
      adsetId: p.get('adset_id') || p.get('adsetid'),
      adId: p.get('ad_id') || p.get('adid'),
      adgroupId: p.get('adgroup_id') || p.get('adgroupid'),
      creativeId: p.get('creative_id') || p.get('creative')
    };
  }

  function meaningfulTouch(touch) {
    return Boolean(touch && (
      (touch.source && touch.source !== 'direct') ||
      touch.gclid || touch.gbraid || touch.wbraid || touch.fbclid || touch.campaign
    ));
  }

  var sessionTouch = touchFromUrl();
  var firstTouch = sessionTouch;

  if (analyticsGranted()) {
    var migrated = parseJson(safeLocalGet('salsys_first_touch_v1'), null) ||
      parseJson(safeLocalGet('yk_first_touch_v1'), null);
    if (migrated) {
      firstTouch = migrated;
      safeLocalSet('salsys_first_touch_v1', JSON.stringify(migrated));
    } else if (meaningfulTouch(sessionTouch)) {
      safeLocalSet('salsys_first_touch_v1', JSON.stringify(sessionTouch));
      firstTouch = sessionTouch;
    }
  }

  function sanitize(value, depth) {
    depth = depth || 0;
    if (depth > 7) return '[max_depth]';
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value.slice(0, 3000);
    if (Array.isArray(value)) {
      return value.slice(0, 80).map(function (item) { return sanitize(item, depth + 1); });
    }
    if (typeof value === 'object') {
      var out = {};
      Object.keys(value).slice(0, 160).forEach(function (rawKey) {
        var key = String(rawKey).slice(0, 120);
        if (/password|passwd|authorization|cookie|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key/i.test(key)) return;
        out[key] = sanitize(value[rawKey], depth + 1);
      });
      return out;
    }
    return null;
  }

  function safeReferrer() {
    if (!document.referrer) return null;
    try {
      var url = new URL(document.referrer);
      return url.origin + url.pathname;
    } catch (_) {
      return null;
    }
  }

  function pageProperties(extra) {
    var observedFbc = consentState.adUserData === true ? getCookie('_fbc') : null;
    var observedFbp = consentState.adUserData === true ? getCookie('_fbp') : null;
    var result = {
      pageUrl: location.href,
      pagePath: location.pathname + location.search,
      pageTitle: document.title || null,
      referrer: document.referrer || null,
      firstTouch: firstTouch,
      sessionTouch: sessionTouch,
      fbc: observedFbc,
      fbp: observedFbp,
      metadata: {}
    };
    Object.keys(extra || {}).forEach(function (key) {
      result[key] = sanitize(extra[key], 0);
    });
    return result;
  }

  function context() {
    return {
      page_path: location.pathname,
      page_origin: location.origin,
      referrer: safeReferrer(),
      title: document.title ? String(document.title).slice(0, 300) : null,
      viewport_width: window.innerWidth || null,
      viewport_height: window.innerHeight || null,
      timezone: window.Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone || null : null,
      language: navigator.language || null,
      gpc: gpcEnabled(),
      consent: {
        analytics: consentState.analytics,
        adUserData: consentState.adUserData,
        adPersonalization: consentState.adPersonalization,
        marketing: consentState.marketing,
        mode: consentState.mode,
        source: consentState.source
      }
    };
  }

  function envelope(name, properties, options) {
    options = options || {};
    return {
      event_id: options.eventId || uid('evt'),
      event_name: String(name || '').trim().toLowerCase().slice(0, 120),
      schema_version: 1,
      occurred_at: options.occurredAt || new Date().toISOString(),
      anonymous_visitor_id: getVisitorId(),
      session_key: getSessionId(),
      site: SITE,
      properties: pageProperties(properties || {}),
      context: context(),
      metadata: {
        sdk: 'salsys-event-browser',
        sdk_version: '1.0.0',
        first_party: true
      }
    };
  }

  function postJson(url, body, keepalive) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: Boolean(keepalive),
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

  function track(name, properties, options) {
    name = String(name || '').trim().toLowerCase();
    options = options || {};
    if (!/^web\.[a-z][a-z0-9_]*$/.test(name)) {
      return Promise.reject(new Error('Browser SDK accepts web.* events only. Business truth events must be emitted server-side.'));
    }
    if (!analyticsGranted()) {
      return Promise.resolve({ ok: true, accepted: false, privacy_blocked: true, reason: 'analytics_consent_required' });
    }

    var body = envelope(name, properties, options);
    var attempts = Number(options.attempts || 2);

    function send(attempt) {
      return postJson(EVENT_ENDPOINT, body, options.keepalive !== false).catch(function (error) {
        if (attempt + 1 >= attempts) throw error;
        return new Promise(function (resolve) { setTimeout(resolve, 250 * (attempt + 1)); })
          .then(function () { return send(attempt + 1); });
      });
    }

    return send(0).then(function (result) {
      log(name, result);
      return result;
    });
  }

  function consentPayload() {
    var body = {
      eventId: uid('cons'),
      occurredAt: new Date().toISOString(),
      site: SITE,
      consent: {
        analytics: consentState.analytics,
        adUserData: consentState.adUserData,
        adPersonalization: consentState.adPersonalization,
        marketing: consentState.marketing,
        mode: consentState.mode,
        source: consentState.source
      }
    };
    if (analyticsGranted()) {
      body.anonymousVisitorId = getVisitorId();
      body.sessionKey = getSessionId();
    }
    return body;
  }

  function setConsent(detail) {
    detail = detail || {};
    ['analytics', 'adUserData', 'adPersonalization', 'marketing'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(detail, key)) {
        consentState[key] = detail[key] === true ? true : detail[key] === false ? false : null;
      }
    });
    if (typeof detail.mode === 'string' && detail.mode.trim()) consentState.mode = detail.mode.trim().slice(0, 60);
    if (typeof detail.source === 'string' && detail.source.trim()) consentState.source = detail.source.trim().slice(0, 100);

    if (gpcEnabled()) {
      consentState.adPersonalization = false;
    }

    if (consentState.analytics === true) {
      setCookie('salsys_analytics_consent', '1');
      setCookie('yk_analytics_consent', '1');
      getVisitorId();
      getSessionId();
      if (!safeLocalGet('salsys_first_touch_v1') && meaningfulTouch(firstTouch)) {
        safeLocalSet('salsys_first_touch_v1', JSON.stringify(firstTouch));
      }
    } else if (consentState.analytics === false) {
      setCookie('salsys_analytics_consent', '0');
      setCookie('yk_analytics_consent', '0');
      deleteCookie('salsys_vid');
      deleteCookie('yk_vid');
      safeSessionRemove('salsys_sid');
      safeSessionRemove('yk_sid');
      safeLocalRemove('salsys_first_touch_v1');
      safeLocalRemove('yk_first_touch_v1');
    }

    return postJson(CONSENT_ENDPOINT, consentPayload(), true).then(function (result) {
      if (consentState.analytics === true && AUTO_PAGE && !window.__salsysInitialPageSent) {
        window.__salsysInitialPageSent = true;
        track('web.page_viewed', { consent_granted_now: true }, { keepalive: true }).catch(function () {});
      }
      return result;
    });
  }

  function decorateForm(form) {
    if (!form || !analyticsGranted()) return;
    function ensure(name, value) {
      var input = form.querySelector('input[name="' + name + '"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        form.appendChild(input);
      }
      input.value = value || '';
    }
    ensure('salsys_visitor_id', getVisitorId());
    ensure('salsys_session_id', getSessionId());
    // Transitional aliases keep existing backend lead-identification code working.
    ensure('yk_visitor_id', getVisitorId());
    ensure('yk_session_id', getSessionId());
  }

  function classifyLink(target) {
    var href = target && target.getAttribute ? target.getAttribute('href') : null;
    if (!href) return { name: 'web.cta_clicked', destination: null };
    var lower = href.toLowerCase();
    if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com)|^whatsapp:/i.test(lower)) {
      return { name: 'web.whatsapp_clicked', destination: 'whatsapp' };
    }
    if (/^tel:/i.test(lower)) return { name: 'web.call_clicked', destination: 'phone' };
    if (/^mailto:/i.test(lower)) return { name: 'web.email_clicked', destination: 'email' };
    return { name: 'web.cta_clicked', destination: null };
  }

  function installDeclarativeTracking() {
    if (AUTO_CLICKS) {
      document.addEventListener('click', function (event) {
        if (!analyticsGranted()) return;
        var target = event.target && event.target.closest
          ? event.target.closest('a,button,[data-salsys-track],[data-salsys-event]')
          : null;
        if (!target || target.hasAttribute('data-salsys-ignore')) return;
        var classified = classifyLink(target);
        var explicit = target.getAttribute('data-salsys-event');
        var eventName = explicit && /^web\.[a-z][a-z0-9_]*$/.test(explicit)
          ? explicit
          : classified.name;
        var label = target.getAttribute('data-salsys-track') ||
          target.getAttribute('aria-label') || target.textContent || target.id || target.className || 'cta';
        var href = target.getAttribute('href');
        track(eventName, {
          label: String(label).trim().slice(0, 180),
          element: String(target.tagName || '').toLowerCase(),
          destination_type: classified.destination,
          destination_origin: (function () {
            if (!href) return null;
            try { return new URL(href, location.href).origin; } catch (_) { return null; }
          })()
        }, { keepalive: true }).catch(function () {});
      }, true);
    }

    if (AUTO_FORMS) {
      var started = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
      document.addEventListener('focusin', function (event) {
        var form = event.target && event.target.form;
        if (!form || form.hasAttribute('data-salsys-ignore')) return;
        decorateForm(form);
        if (!analyticsGranted() || (started && started.has(form))) return;
        if (started) started.add(form);
        track('web.form_started', {
          form_id: String(form.id || form.getAttribute('name') || 'anonymous').slice(0, 160),
          form_action_path: (function () {
            try { return new URL(form.action || location.href, location.href).pathname; } catch (_) { return null; }
          })()
        }, { keepalive: true }).catch(function () {});
      });

      document.addEventListener('submit', function (event) {
        var form = event.target;
        if (!form || form.hasAttribute('data-salsys-ignore')) return;
        decorateForm(form);
        if (!analyticsGranted()) return;
        track('web.form_submitted', {
          form_id: String(form.id || form.getAttribute('name') || 'anonymous').slice(0, 160),
          // Never capture field values here. CRM identity is established server-side.
          field_count: form.elements ? form.elements.length : null
        }, { keepalive: true }).catch(function () {});
      }, true);

      document.querySelectorAll('form').forEach(decorateForm);
    }
  }

  var api = {
    __v1: true,
    version: '1.0.0',
    track: track,
    page: function (properties) {
      return track('web.page_viewed', properties || {}, { keepalive: true });
    },
    consent: setConsent,
    visitorId: getVisitorId,
    sessionId: getSessionId,
    firstTouch: function () { return sanitize(firstTouch, 0); },
    sessionTouch: function () { return sanitize(sessionTouch, 0); },
    decorateForm: decorateForm,
    state: function () {
      return {
        site: SITE,
        eventEndpoint: EVENT_ENDPOINT,
        consentEndpoint: CONSENT_ENDPOINT,
        analyticsGranted: analyticsGranted(),
        gpc: gpcEnabled(),
        visitorId: analyticsGranted() ? getVisitorId() : null,
        sessionId: analyticsGranted() ? getSessionId() : null
      };
    }
  };

  window.SalsysEvent = api;
  // Alias for integrations that prefer a shorter neutral namespace.
  if (!window.Salsys) window.Salsys = api;

  installDeclarativeTracking();

  window.addEventListener('salsys:consent', function (event) {
    api.consent(event && event.detail ? event.detail : {}).catch(function () {});
  });
  // Backward-compatible Yogakulam consent event during migration.
  window.addEventListener('yk:consent', function (event) {
    api.consent(event && event.detail ? event.detail : {}).catch(function () {});
  });

  if (AUTO_PAGE && analyticsGranted()) {
    window.__salsysInitialPageSent = true;
    api.page({}).catch(function () {});
  }
})();
