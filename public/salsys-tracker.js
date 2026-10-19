/* Salsys Event Intelligence Browser SDK v1.2.0 */
(function () {
  'use strict';

  if (window.Salsys && window.Salsys.__v1) return;

  var script = document.currentScript;
  var scriptUrl = null;
  try { scriptUrl = script && script.src ? new URL(script.src) : null; } catch (_) {}

  var SITE = (script && script.dataset && script.dataset.site) || window.location.hostname;
  var API_BASE = (script && script.dataset && script.dataset.apiBase) || '';
  var EVENT_ENDPOINT = (script && script.dataset && script.dataset.eventEndpoint) ||
    (API_BASE ? API_BASE.replace(/\/$/, '') + '/api/events/browser/v1' : '/api/tracking/event.php');
  var CONSENT_ENDPOINT = (script && script.dataset && script.dataset.consentEndpoint) ||
    (API_BASE ? API_BASE.replace(/\/$/, '') + '/api/privacy/consent/v1' : '/api/tracking/consent.php');
  var AUTO_PAGE = !(script && script.dataset && script.dataset.autoPage === 'false');
  var DEBUG = Boolean(script && script.dataset && script.dataset.debug === 'true');
  var QUEUE_KEY = 'salsys_event_queue_v1';
  var PRIVACY_KEY = 'salsys_privacy_v1';
  var VISITOR_KEY = 'salsys_vid';
  var SESSION_VISITOR_KEY = 'salsys_vid_session';
  var SESSION_KEY = 'salsys_sid';
  var FIRST_TOUCH_KEY = 'salsys_first_touch_v1';

  function debug() {
    if (!DEBUG || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Salsys]');
    console.log.apply(console, args);
  }

  function randomId(prefix) {
    var id;
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      id = window.crypto.randomUUID();
    } else if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      id = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
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

  function migrateLegacyIds() {
    var legacyVisitor = null;
    var legacySession = null;
    try {
      var match = document.cookie.match(/(?:^|; )yk_vid=([^;]*)/);
      legacyVisitor = match ? decodeURIComponent(match[1]) : null;
    } catch (_) {}
    try { legacySession = sessionStorage.getItem('yk_sid'); } catch (_) {}

    if (!safeGet(localStorage, VISITOR_KEY) && legacyVisitor) {
      safeSet(localStorage, VISITOR_KEY, legacyVisitor);
    }
    if (!safeGet(sessionStorage, SESSION_KEY) && legacySession) {
      safeSet(sessionStorage, SESSION_KEY, legacySession);
    }
  }

  migrateLegacyIds();

  function privacyState() {
    var parsed = parseJson(safeGet(localStorage, PRIVACY_KEY), {});
    return parsed && typeof parsed === 'object' ? parsed : {};
  }

  function gpcEnabled() {
    return navigator.globalPrivacyControl === true;
  }

  function analyticsGranted() {
    return privacyState().analytics === 'granted';
  }

  function getVisitorId() {
    var persistent = safeGet(localStorage, VISITOR_KEY);
    if (persistent) return persistent;

    var sessionVisitor = safeGet(sessionStorage, SESSION_VISITOR_KEY);
    if (!sessionVisitor) {
      sessionVisitor = randomId('vis');
      safeSet(sessionStorage, SESSION_VISITOR_KEY, sessionVisitor);
    }

    if (analyticsGranted()) safeSet(localStorage, VISITOR_KEY, sessionVisitor);
    return sessionVisitor;
  }

  function getSessionId() {
    var session = safeGet(sessionStorage, SESSION_KEY);
    if (!session) {
      session = randomId('ses');
      safeSet(sessionStorage, SESSION_KEY, session);
    }
    return session;
  }

  function currentAttribution() {
    var params = new URLSearchParams(window.location.search || '');
    var result = {
      source: params.get('utm_source'),
      medium: params.get('utm_medium'),
      campaign: params.get('utm_campaign'),
      content: params.get('utm_content'),
      term: params.get('utm_term'),
      utm_id: params.get('utm_id'),
      gclid: params.get('gclid'),
      gbraid: params.get('gbraid'),
      wbraid: params.get('wbraid'),
      fbclid: params.get('fbclid'),
      campaign_id: params.get('campaign_id') || params.get('campaignid'),
      adset_id: params.get('adset_id'),
      ad_id: params.get('ad_id'),
      adgroup_id: params.get('adgroup_id') || params.get('adgroupid'),
      creative_id: params.get('creative') || params.get('creative_id')
    };

    if (!result.source) {
      if (result.gclid || result.gbraid || result.wbraid) {
        result.source = 'google'; result.medium = result.medium || 'cpc';
      } else if (result.fbclid) {
        result.source = 'meta'; result.medium = result.medium || 'paid_social';
      } else if (document.referrer) {
        try {
          var refHost = new URL(document.referrer).hostname.replace(/^www\./, '');
          var ownHost = window.location.hostname.replace(/^www\./, '');
          if (refHost !== ownHost) {
            if (/google\./i.test(refHost)) { result.source = 'google'; result.medium = 'organic'; }
            else if (/instagram\.com|facebook\.com|fb\.com/i.test(refHost)) { result.source = 'meta'; result.medium = 'organic_social'; }
            else { result.source = refHost; result.medium = 'referral'; }
          }
        } catch (_) {}
      }
    }

    if (!result.source) { result.source = 'direct'; result.medium = result.medium || 'none'; }
    return result;
  }

  function meaningfulTouch(touch) {
    return touch && (touch.source !== 'direct' || touch.campaign || touch.gclid || touch.gbraid || touch.wbraid || touch.fbclid);
  }

  function firstTouch() {
    var current = currentAttribution();
    if (!analyticsGranted()) return current;
    var stored = parseJson(safeGet(localStorage, FIRST_TOUCH_KEY), null);
    if (stored) return stored;
    if (meaningfulTouch(current)) safeSet(localStorage, FIRST_TOUCH_KEY, JSON.stringify(current));
    return current;
  }

  function safeReferrer() {
    if (!document.referrer) return null;
    try {
      var url = new URL(document.referrer);
      return url.origin + url.pathname;
    } catch (_) { return null; }
  }

  function pageContext() {
    return {
      page_url: window.location.href.slice(0, 2000),
      page_path: (window.location.pathname + window.location.search).slice(0, 1200),
      page_title: document.title ? String(document.title).slice(0, 300) : null,
      referrer: safeReferrer(),
      first_touch: firstTouch(),
      session_touch: currentAttribution(),
      viewport_width: window.innerWidth || null,
      viewport_height: window.innerHeight || null,
      timezone: Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone || null : null,
      language: navigator.language || null,
      gpc: gpcEnabled()
    };
  }

  function sanitize(value, depth) {
    depth = depth || 0;
    if (depth > 6) return '[max_depth]';
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value.slice(0, 3000);
    if (Array.isArray(value)) return value.slice(0, 50).map(function (item) { return sanitize(item, depth + 1); });
    if (typeof value === 'object') {
      var out = {};
      Object.keys(value).slice(0, 120).forEach(function (key) {
        if (/password|passwd|authorization|cookie|secret|access[_-]?token|refresh[_-]?token|private[_-]?key/i.test(key)) return;
        out[String(key).slice(0, 120)] = sanitize(value[key], depth + 1);
      });
      return out;
    }
    return null;
  }

  function isEssentialBusinessEvent(name) {
    return /^(lead|booking|payment|enrollment|message|conversation)\./.test(name);
  }

  function localPermission(name) {
    if (isEssentialBusinessEvent(name)) return true;
    if (/^web\./.test(name)) return analyticsGranted();
    return false;
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
      properties: sanitize(properties || {}, 0),
      context: pageContext(),
      metadata: {
        sdk: 'salsys-browser-v1',
        sdk_version: '1.2.0',
        transport: API_BASE ? 'direct_api' : 'first_party_relay',
        consent_snapshot: privacyState()
      }
    };
  }

  function postJson(url, body, keepalive) {
    return fetch(url, {
      method: 'POST',
      mode: 'cors',
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

  function queueLoad() {
    var parsed = parseJson(safeGet(localStorage, QUEUE_KEY), []);
    return Array.isArray(parsed) ? parsed.slice(-100) : [];
  }

  function queueSave(items) {
    safeSet(localStorage, QUEUE_KEY, JSON.stringify(items.slice(-100)));
  }

  function queueEnvelope(envelope) {
    if (isEssentialBusinessEvent(envelope.event_name)) return;
    var items = queueLoad();
    items.push(envelope);
    queueSave(items);
  }

  function sendEnvelope(envelope, options) {
    options = options || {};
    return postJson(EVENT_ENDPOINT, envelope, options.keepalive !== false).catch(function (error) {
      queueEnvelope(envelope);
      throw error;
    });
  }

  function flushQueue() {
    var items = queueLoad();
    if (!items.length || !analyticsGranted()) return Promise.resolve({ ok: true, flushed: 0 });
    var remaining = [];
    var flushed = 0;
    var chain = Promise.resolve();
    items.forEach(function (item) {
      chain = chain.then(function () {
        return postJson(EVENT_ENDPOINT, item, true)
          .then(function () { flushed += 1; })
          .catch(function () { remaining.push(item); });
      });
    });
    return chain.then(function () {
      queueSave(remaining);
      return { ok: true, flushed: flushed, remaining: remaining.length };
    });
  }

  function track(name, properties, options) {
    options = options || {};
    name = String(name || '').trim().toLowerCase();
    if (!name) return Promise.reject(new Error('event name is required'));
    if (!localPermission(name)) {
      return Promise.resolve({ ok: true, accepted: false, privacy_blocked: true, reason: 'local_privacy_gate' });
    }
    return sendEnvelope(eventEnvelope(name, properties, options), options);
  }

  function saveConsent(decisions) {
    var normalized = {};
    Object.keys(decisions || {}).forEach(function (purpose) {
      var value = decisions[purpose];
      if (typeof value === 'boolean') value = value ? 'granted' : 'denied';
      var decision = String(value || '').toLowerCase();
      if (['granted', 'denied', 'withdrawn', 'opted_out', 'limited'].indexOf(decision) >= 0) normalized[purpose] = decision;
    });
    if (gpcEnabled()) normalized.sale_sharing = 'opted_out';

    var body = {
      event_id: randomId('consent'),
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      site: SITE,
      occurred_at: new Date().toISOString(),
      gpc: gpcEnabled(),
      decisions: normalized
    };

    return postJson(CONSENT_ENDPOINT, body, true).then(function (result) {
      var effective = result && result.effective_decisions ? result.effective_decisions : normalized;
      var current = privacyState();
      Object.keys(effective).forEach(function (key) { current[key] = effective[key]; });
      current.updated_at = new Date().toISOString();
      current.gpc = gpcEnabled();
      safeSet(localStorage, PRIVACY_KEY, JSON.stringify(current));

      if (current.analytics === 'granted') {
        safeSet(localStorage, VISITOR_KEY, getVisitorId());
        var ft = currentAttribution();
        if (meaningfulTouch(ft) && !safeGet(localStorage, FIRST_TOUCH_KEY)) safeSet(localStorage, FIRST_TOUCH_KEY, JSON.stringify(ft));
        flushQueue().catch(function () {});
        if (AUTO_PAGE && !window.__salsysInitialPageSent) {
          window.__salsysInitialPageSent = true;
          track('web.page_viewed', {}, { keepalive: true }).catch(function () {});
        }
      } else if (current.analytics === 'denied' || current.analytics === 'withdrawn') {
        safeRemove(localStorage, VISITOR_KEY);
        safeRemove(localStorage, FIRST_TOUCH_KEY);
        queueSave([]);
      }
      return result;
    });
  }

  function decorateForm(form) {
    if (!form || form.__salsysDecorated) return;
    form.__salsysDecorated = true;
    var fields = {
      salsys_visitor_id: getVisitorId(),
      salsys_session_id: getSessionId(),
      yk_visitor_id: getVisitorId(),
      yk_session_id: getSessionId()
    };
    Object.keys(fields).forEach(function (name) {
      var input = form.querySelector('input[name="' + name + '"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden'; input.name = name; form.appendChild(input);
      }
      input.value = fields[name];
    });
  }

  function installDeclarativeTracking() {
    document.querySelectorAll('form[data-salsys-lead-form], form[data-yk-lead-form]').forEach(decorateForm);

    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-salsys-track]') : null;
      if (!target || !analyticsGranted()) return;
      var label = target.getAttribute('data-salsys-track') || 'cta';
      track('web.cta_clicked', {
        label: label.slice(0, 160),
        element: (target.tagName || '').toLowerCase(),
        destination: target.getAttribute('href') ? String(target.getAttribute('href')).slice(0, 1000) : null
      }, { keepalive: true }).catch(function () {});
    }, { capture: true });

    var startedForms = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    document.addEventListener('focusin', function (event) {
      var form = event.target && event.target.form;
      if (!form) return;
      decorateForm(form);
      if (!analyticsGranted() || (startedForms && startedForms.has(form))) return;
      if (startedForms) startedForms.add(form);
      track('web.form_started', { form_id: (form.id || form.getAttribute('name') || 'anonymous').slice(0, 160) }, { keepalive: true }).catch(function () {});
    });

    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!form || !form.tagName || form.tagName.toLowerCase() !== 'form') return;
      decorateForm(form);
      if (analyticsGranted()) {
        track('web.form_submitted', { form_id: (form.id || form.getAttribute('name') || 'anonymous').slice(0, 160) }, { keepalive: true }).catch(function () {});
      }
    }, { capture: true });
  }

  window.addEventListener('salsys:consent', function (event) {
    saveConsent(event && event.detail ? event.detail : {}).catch(function () {});
  });
  window.addEventListener('yk:consent', function (event) {
    var detail = event && event.detail ? event.detail : {};
    saveConsent({
      analytics: detail.analytics,
      advertising: detail.adUserData === false || detail.adPersonalization === false ? 'denied' : (detail.adUserData === true || detail.adPersonalization === true ? 'granted' : undefined),
      marketing: detail.marketing
    }).catch(function () {});
  });

  var api = {
    __v1: true,
    version: '1.2.0',
    track: track,
    page: function (properties) { return track('web.page_viewed', properties || {}, { keepalive: true }); },
    lead: function (identity, lead, attributionOverride) {
      return track('lead.submitted', {
        identity: sanitize(identity || {}, 0),
        lead: sanitize(lead || {}, 0),
        attribution: sanitize(attributionOverride || currentAttribution(), 0)
      }, { keepalive: true });
    },
    consent: saveConsent,
    flush: flushQueue,
    visitorId: getVisitorId,
    sessionId: getSessionId,
    attribution: currentAttribution,
    privacy: function () { return { decisions: privacyState(), gpc: gpcEnabled(), analyticsAllowedLocally: analyticsGranted() }; },
    decorateForm: decorateForm
  };

  window.Salsys = api;
  installDeclarativeTracking();

  if (gpcEnabled() && privacyState().sale_sharing !== 'opted_out') {
    saveConsent({ sale_sharing: 'opted_out' }).catch(function () {});
  }
  if (AUTO_PAGE && analyticsGranted()) {
    window.__salsysInitialPageSent = true;
    api.page({}).catch(function () {});
  }
  flushQueue().catch(function () {});
  debug('initialized', { site: SITE, eventEndpoint: EVENT_ENDPOINT, consentEndpoint: CONSENT_ENDPOINT });
})();
