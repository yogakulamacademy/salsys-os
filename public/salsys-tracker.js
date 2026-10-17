/* SalsysOS Privacy-First Browser SDK v1 */
(function () {
  'use strict';

  if (window.Salsys && window.Salsys.__v1) return;

  var script = document.currentScript;
  var scriptUrl;
  try {
    scriptUrl = script && script.src ? new URL(script.src) : null;
  } catch (_) {
    scriptUrl = null;
  }

  var API_BASE =
    (script && script.dataset && script.dataset.apiBase) ||
    (scriptUrl ? scriptUrl.origin : 'https://salsysos.com');
  var AUTO_PAGE = !(script && script.dataset && script.dataset.autoPage === 'false');
  var SITE = (script && script.dataset && script.dataset.site) || window.location.hostname;

  var KEYS = {
    persistentVisitor: 'salsys_vid',
    sessionVisitor: 'salsys_vid_session',
    session: 'salsys_sid',
    privacy: 'salsys_privacy_v1'
  };

  function randomId(prefix) {
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
      id = String(Date.now()) + Math.random().toString(16).slice(2);
    }
    return prefix + '_' + id;
  }

  function safeGet(storage, key) {
    try { return storage.getItem(key); } catch (_) { return null; }
  }

  function safeSet(storage, key, value) {
    try { storage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function safeRemove(storage, key) {
    try { storage.removeItem(key); } catch (_) {}
  }

  function parseJson(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
  }

  function privacyState() {
    var parsed = parseJson(safeGet(window.localStorage, KEYS.privacy), {});
    return parsed && typeof parsed === 'object' ? parsed : {};
  }

  function gpcEnabled() {
    return navigator.globalPrivacyControl === true;
  }

  function analyticsGranted() {
    return privacyState().analytics === 'granted';
  }

  function getVisitorId() {
    var persistent = safeGet(window.localStorage, KEYS.persistentVisitor);
    if (persistent) return persistent;

    var sessionVisitor = safeGet(window.sessionStorage, KEYS.sessionVisitor);
    if (!sessionVisitor) {
      sessionVisitor = randomId('v');
      safeSet(window.sessionStorage, KEYS.sessionVisitor, sessionVisitor);
    }

    if (analyticsGranted()) {
      safeSet(window.localStorage, KEYS.persistentVisitor, sessionVisitor);
    }

    return sessionVisitor;
  }

  function getSessionId() {
    var session = safeGet(window.sessionStorage, KEYS.session);
    if (!session) {
      session = randomId('s');
      safeSet(window.sessionStorage, KEYS.session, session);
    }
    return session;
  }

  function attribution() {
    var params = new URLSearchParams(window.location.search || '');
    var names = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'gclid', 'gbraid', 'wbraid', 'fbclid', 'fbc', 'fbp'
    ];
    var result = {};
    names.forEach(function (name) {
      var value = params.get(name);
      if (value) result[name] = value.slice(0, 512);
    });
    return result;
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

  function pageContext() {
    return {
      page_path: window.location.pathname,
      page_origin: window.location.origin,
      referrer: safeReferrer(),
      title: document.title ? String(document.title).slice(0, 300) : null,
      viewport_width: window.innerWidth || null,
      viewport_height: window.innerHeight || null,
      timezone: Intl && Intl.DateTimeFormat
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || null
        : null,
      language: navigator.language || null,
      gpc: gpcEnabled(),
      attribution: attribution()
    };
  }

  function isEssentialBusinessEvent(name) {
    return /^(lead|booking|payment|enrollment)\./.test(name);
  }

  function localPermission(name) {
    if (isEssentialBusinessEvent(name)) return true;
    if (/^web\./.test(name)) return analyticsGranted();
    return false;
  }

  function sanitizeForTransport(value, depth) {
    depth = depth || 0;
    if (depth > 6) return '[max_depth]';
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value.slice(0, 2000);
    if (Array.isArray(value)) return value.slice(0, 50).map(function (item) {
      return sanitizeForTransport(item, depth + 1);
    });
    if (typeof value === 'object') {
      var out = {};
      Object.keys(value).slice(0, 100).forEach(function (key) {
        if (/password|passwd|authorization|cookie|secret|token|private[_-]?key/i.test(key)) return;
        out[String(key).slice(0, 100)] = sanitizeForTransport(value[key], depth + 1);
      });
      return out;
    }
    return null;
  }

  function eventEnvelope(name, properties, options) {
    options = options || {};
    return {
      event_id: options.eventId || randomId('evt'),
      event_name: String(name || '').trim().toLowerCase().slice(0, 120),
      schema_version: 1,
      occurred_at: options.occurredAt || new Date().toISOString(),
      anonymous_visitor_id: getVisitorId(),
      session_key: getSessionId(),
      site: SITE,
      properties: sanitizeForTransport(properties || {}, 0),
      context: pageContext(),
      metadata: {
        sdk: 'salsys-browser-v1',
        sdk_version: '1.1.0',
        consent_snapshot: privacyState(),
        local_permission: localPermission(String(name || '').toLowerCase())
      }
    };
  }

  function postJson(path, body, keepalive) {
    return fetch(API_BASE + path, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: Boolean(keepalive),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data && data.error ? data.error : 'Salsys request failed.');
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  function sendEvent(name, properties, options) {
    options = options || {};
    name = String(name || '').trim().toLowerCase();
    if (!name) return Promise.reject(new Error('event name is required'));

    if (!localPermission(name)) {
      return Promise.resolve({
        ok: true,
        accepted: false,
        privacy_blocked: true,
        reason: 'local_privacy_gate'
      });
    }

    var envelope = eventEnvelope(name, properties, options);
    var attempts = isEssentialBusinessEvent(name) ? 2 : 1;

    function attempt(index) {
      return postJson('/api/events/browser/v1', envelope, options.keepalive !== false)
        .catch(function (error) {
          if (index + 1 >= attempts) throw error;
          return new Promise(function (resolve) { setTimeout(resolve, 350); })
            .then(function () { return attempt(index + 1); });
        });
    }

    return attempt(0);
  }

  function saveConsent(decisions) {
    var normalized = {};
    Object.keys(decisions || {}).forEach(function (purpose) {
      var decision = String(decisions[purpose] || '').toLowerCase();
      if (['granted', 'denied', 'withdrawn', 'opted_out', 'limited'].indexOf(decision) >= 0) {
        normalized[purpose] = decision;
      }
    });

    if (gpcEnabled()) normalized.sale_sharing = 'opted_out';

    var body = {
      event_id: randomId('consent'),
      visitor_id: getVisitorId(),
      occurred_at: new Date().toISOString(),
      gpc: gpcEnabled(),
      decisions: normalized
    };

    return postJson('/api/privacy/consent/v1', body, true).then(function (result) {
      var effective = result && result.effective_decisions ? result.effective_decisions : normalized;
      var current = privacyState();
      Object.keys(effective).forEach(function (key) { current[key] = effective[key]; });
      current.updated_at = new Date().toISOString();
      current.gpc = gpcEnabled();
      safeSet(window.localStorage, KEYS.privacy, JSON.stringify(current));

      if (current.analytics === 'granted') {
        safeSet(window.localStorage, KEYS.persistentVisitor, getVisitorId());
        if (AUTO_PAGE && !window.__salsysInitialPageSent) {
          window.__salsysInitialPageSent = true;
          sendEvent('web.page_viewed', {}, { keepalive: true }).catch(function () {});
        }
      } else if (current.analytics === 'denied' || current.analytics === 'withdrawn') {
        safeRemove(window.localStorage, KEYS.persistentVisitor);
      }

      return result;
    });
  }

  function requestPrivacy(requestType, details) {
    details = details || {};
    return postJson('/api/privacy/rights/v1', {
      request_type: String(requestType || '').toLowerCase(),
      visitor_id: getVisitorId(),
      jurisdiction: details.jurisdiction || null,
      email: details.email || null,
      phone: details.phone || null,
      purpose_key: details.purposeKey || details.purpose_key || null
    }, true).then(function (result) {
      if (requestType === 'withdraw_consent' && (details.purposeKey || details.purpose_key)) {
        var purpose = details.purposeKey || details.purpose_key;
        var current = privacyState();
        current[purpose] = 'withdrawn';
        current.updated_at = new Date().toISOString();
        safeSet(window.localStorage, KEYS.privacy, JSON.stringify(current));
        if (purpose === 'analytics') safeRemove(window.localStorage, KEYS.persistentVisitor);
      }
      if (requestType === 'opt_out_sale_sharing') {
        var state = privacyState();
        state.sale_sharing = 'opted_out';
        state.updated_at = new Date().toISOString();
        safeSet(window.localStorage, KEYS.privacy, JSON.stringify(state));
      }
      return result;
    });
  }

  function trackLead(identity, lead, attributionOverride) {
    var properties = {
      identity: sanitizeForTransport(identity || {}, 0),
      lead: sanitizeForTransport(lead || {}, 0),
      attribution: sanitizeForTransport(attributionOverride || attribution(), 0)
    };
    // PII is sent immediately and is never persisted in the browser SDK queue/storage.
    return sendEvent('lead.submitted', properties, { keepalive: true });
  }

  function installDeclarativeTracking() {
    document.addEventListener('click', function (event) {
      if (!analyticsGranted()) return;
      var target = event.target && event.target.closest ? event.target.closest('[data-salsys-track]') : null;
      if (!target) return;
      var label = target.getAttribute('data-salsys-track') || 'cta';
      sendEvent('web.cta_clicked', {
        label: label.slice(0, 160),
        element: (target.tagName || '').toLowerCase(),
        destination_origin: (function () {
          var href = target.getAttribute('href');
          if (!href) return null;
          try { return new URL(href, window.location.href).origin; } catch (_) { return null; }
        })()
      }, { keepalive: true }).catch(function () {});
    }, { capture: true });

    var startedForms = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    document.addEventListener('focusin', function (event) {
      if (!analyticsGranted()) return;
      var form = event.target && event.target.form;
      if (!form || (startedForms && startedForms.has(form))) return;
      if (startedForms) startedForms.add(form);
      sendEvent('web.form_started', {
        form_id: (form.id || form.getAttribute('name') || 'anonymous').slice(0, 160)
      }, { keepalive: true }).catch(function () {});
    });
  }

  var api = {
    __v1: true,
    version: '1.1.0',
    track: sendEvent,
    page: function (properties) {
      return sendEvent('web.page_viewed', properties || {}, { keepalive: true });
    },
    trackLead: trackLead,
    consent: saveConsent,
    requestPrivacy: requestPrivacy,
    privacy: function () {
      return {
        decisions: privacyState(),
        gpc: gpcEnabled(),
        analyticsAllowedLocally: analyticsGranted()
      };
    },
    visitorId: getVisitorId,
    sessionId: getSessionId
  };

  window.Salsys = api;

  installDeclarativeTracking();

  // GPC is treated as an actionable sale/sharing opt-out even when the user never
  // interacts with a banner. The server remains authoritative as a second gate.
  if (gpcEnabled() && privacyState().sale_sharing !== 'opted_out') {
    saveConsent({ sale_sharing: 'opted_out' }).catch(function () {});
  }

  if (AUTO_PAGE && analyticsGranted()) {
    window.__salsysInitialPageSent = true;
    api.page({}).catch(function () {});
  }
})();
