/* Salsys Event Intelligence Browser SDK v1.1.1 */
(function () {
  'use strict';

  if (window.Salsys && window.Salsys.__eventIntelligenceV1) return;

  function findScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if ((scripts[i].src || '').indexOf('salsys-tracker.js') !== -1) return scripts[i];
    }
    return null;
  }

  var script = findScript();
  if (!script) return;

  var scriptUrl = null;
  try { scriptUrl = script.src ? new URL(script.src, window.location.href) : null; } catch (_) {}

  var API_BASE =
    (script.dataset && script.dataset.apiBase) ||
    (scriptUrl ? scriptUrl.origin : 'https://salsysos.com');
  var SITE = (script.dataset && script.dataset.site) || window.location.hostname;
  var CONSENT_MODE = (script.dataset && script.dataset.consentMode) || 'required';
  var AUTO_PAGE = !(script.dataset && script.dataset.autoPage === 'false');
  var AUTO_SPA = !(script.dataset && script.dataset.autoSpa === 'false');
  var AUTO_FORMS = !(script.dataset && script.dataset.autoForms === 'false');
  var DEBUG = Boolean(script.dataset && script.dataset.debug === 'true');

  function absoluteEndpoint(value, fallbackPath) {
    var raw = value || (API_BASE.replace(/\/$/, '') + fallbackPath);
    try { return new URL(raw, window.location.origin).toString(); } catch (_) { return raw; }
  }

  var EVENT_ENDPOINT = absoluteEndpoint(
    script.dataset && script.dataset.endpoint,
    '/api/events/browser/v1'
  );
  var CONSENT_ENDPOINT = absoluteEndpoint(
    script.dataset && script.dataset.consentEndpoint,
    '/api/privacy/consent/v1'
  );

  var KEYS = {
    persistentVisitor: 'salsys_vid',
    sessionVisitor: 'salsys_vid_session',
    session: 'salsys_sid',
    privacy: 'salsys_privacy_v1',
    firstTouch: 'salsys_first_touch_v1',
    pendingFirstTouch: 'salsys_first_touch_session_v1',
    sessionTouch: 'salsys_session_touch_v1',
    sessionStarted: 'salsys_session_started_v1',
    queue: 'salsys_event_queue_v1'
  };

  function log() {
    if (!DEBUG || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Salsys]');
    console.log.apply(console, args);
  }

  function warn() {
    if (!DEBUG || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Salsys]');
    console.warn.apply(console, args);
  }

  function randomId(prefix) {
    var id;
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      id = window.crypto.randomUUID();
    } else if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      id = Array.prototype.map.call(bytes, function (value) {
        return value.toString(16).padStart(2, '0');
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

  function privacyState() {
    var parsed = parseJson(safeGet(window.localStorage, KEYS.privacy), {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  function gpcEnabled() {
    return navigator.globalPrivacyControl === true;
  }

  var analyticsOptOutRequested = false;

  function analyticsDenied(decision) {
    return decision === 'denied' ||
      decision === 'withdrawn' ||
      decision === 'opted_out' ||
      decision === 'limited';
  }

  function analyticsGranted() {
    if (analyticsOptOutRequested) return false;
    var decision = privacyState().analytics;
    // An explicit visitor decision takes precedence over a default site mode.
    if (analyticsDenied(decision)) return false;
    if (CONSENT_MODE === 'granted') return true;
    return decision === 'granted';
  }

  function advertisingGranted() {
    return privacyState().advertising === 'granted';
  }

  function sessionVisitorCandidate() {
    var value = safeGet(window.sessionStorage, KEYS.sessionVisitor);
    if (analyticsGranted()) {
      var shared = safeGet(window.localStorage, KEYS.persistentVisitor);
      if (shared && value && shared !== value) {
        // A restored or duplicated tab can retain an old per-tab ID after
        // another tab withdrew and regranted consent. The acknowledged
        // shared ID takes precedence; never overwrite it with stale data.
        value = shared;
        [KEYS.session, KEYS.sessionStarted, KEYS.pendingFirstTouch,
          KEYS.sessionTouch].forEach(function (key) {
          safeRemove(window.sessionStorage, key);
        });
      }
      if (!value) value = shared;
    }

    if (!value) value = randomId('v');
    safeSet(window.sessionStorage, KEYS.sessionVisitor, value);

    if (analyticsGranted()) safeSet(window.localStorage, KEYS.persistentVisitor, value);
    return value;
  }

  // A tab restored after an explicit refusal must not reuse session-scoped
  // identifiers from a previous analytics-consent epoch.
  if (analyticsDenied(privacyState().analytics)) {
    safeRemove(window.localStorage, KEYS.persistentVisitor);
    safeRemove(window.localStorage, KEYS.firstTouch);
    safeRemove(window.localStorage, KEYS.queue);
    [KEYS.sessionVisitor, KEYS.session, KEYS.sessionStarted,
      KEYS.pendingFirstTouch, KEYS.sessionTouch].forEach(function (key) {
      safeRemove(window.sessionStorage, key);
    });
  }

  var visitorId = sessionVisitorCandidate();

  function getVisitorId() {
    return visitorId;
  }

  function getSessionId() {
    var value = safeGet(window.sessionStorage, KEYS.session);
    if (!value) value = randomId('s');
    safeSet(window.sessionStorage, KEYS.session, value);
    return value;
  }

  var sessionId = getSessionId();
  var analyticsIdentityEpoch = 0;

  function safeText(value, max) {
    if (typeof value !== 'string') return null;
    var clean = value.trim();
    return clean ? clean.slice(0, max || 500) : null;
  }

  function sanitizeUnknown(value, depth) {
    depth = depth || 0;
    if (depth > 6) return '[max_depth]';
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value.slice(0, 2000);
    if (Array.isArray(value)) {
      return value.slice(0, 50).map(function (item) {
        return sanitizeUnknown(item, depth + 1);
      });
    }
    if (typeof value === 'object') {
      var out = {};
      Object.keys(value).slice(0, 100).forEach(function (rawKey) {
        var key = String(rawKey).slice(0, 100);
        if (/password|passwd|authorization|cookie|secret|token|private[_-]?key|card|cvv/i.test(key)) return;
        out[key] = sanitizeUnknown(value[rawKey], depth + 1);
      });
      return out;
    }
    return null;
  }

  var MARKETING_PARAM_MAP = {
    utm_source: 'source',
    utm_medium: 'medium',
    utm_campaign: 'campaign',
    utm_content: 'content',
    utm_term: 'term',
    utm_id: 'utmId',
    gclid: 'gclid',
    gbraid: 'gbraid',
    wbraid: 'wbraid',
    fbclid: 'fbclid',
    campaign_id: 'campaignId',
    adset_id: 'adsetId',
    ad_id: 'adId',
    adgroup_id: 'adgroupId',
    creative_id: 'creativeId'
  };

  function marketingParams(url) {
    var result = {};
    try {
      Object.keys(MARKETING_PARAM_MAP).forEach(function (param) {
        var value = url.searchParams.get(param);
        if (value) result[MARKETING_PARAM_MAP[param]] = value.slice(0, 500);
      });
    } catch (_) {}
    return result;
  }

  function meaningfulObject(value) {
    return value && typeof value === 'object' && Object.keys(value).some(function (key) {
      return value[key] !== null && value[key] !== undefined && value[key] !== '';
    });
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

  function safePageUrl() {
    try {
      var current = new URL(window.location.href);
      var clean = new URL(current.origin + current.pathname);
      Object.keys(MARKETING_PARAM_MAP).forEach(function (param) {
        var value = current.searchParams.get(param);
        if (value) clean.searchParams.set(param, value.slice(0, 500));
      });
      return clean.toString();
    } catch (_) {
      return window.location.origin + window.location.pathname;
    }
  }

  function currentTouch() {
    var current;
    try { current = new URL(window.location.href); } catch (_) { current = null; }
    var touch = current ? marketingParams(current) : {};

    if (!touch.source && document.referrer) {
      try {
        var ref = new URL(document.referrer);
        if (ref.hostname && ref.hostname !== window.location.hostname) {
          touch.source = ref.hostname.slice(0, 160);
          touch.medium = 'referral';
        }
      } catch (_) {}
    }

    if (!touch.source) {
      touch.source = 'direct';
      touch.medium = '(none)';
    }

    return touch;
  }

  function getSessionTouch() {
    var stored = parseJson(safeGet(window.sessionStorage, KEYS.sessionTouch), null);
    if (meaningfulObject(stored)) return stored;
    var touch = currentTouch();
    safeSet(window.sessionStorage, KEYS.sessionTouch, JSON.stringify(touch));
    return touch;
  }

  var sessionTouch = getSessionTouch();

  function getFirstTouch() {
    var stored = null;
    if (analyticsGranted()) {
      stored = parseJson(safeGet(window.localStorage, KEYS.firstTouch), null);
      if (meaningfulObject(stored)) {
        safeSet(window.localStorage, KEYS.firstTouch, JSON.stringify(stored));
        return stored;
      }
    }

    stored = parseJson(safeGet(window.sessionStorage, KEYS.pendingFirstTouch), null);
    if (meaningfulObject(stored)) return stored;

    stored = sessionTouch;
    safeSet(window.sessionStorage, KEYS.pendingFirstTouch, JSON.stringify(stored));
    if (analyticsGranted()) safeSet(window.localStorage, KEYS.firstTouch, JSON.stringify(stored));
    return stored;
  }

  var firstTouch = getFirstTouch();

  function observedMetaSignals() {
    if (!advertisingGranted()) return { fbc: null, fbp: null };
    return { fbc: getCookie('_fbc'), fbp: getCookie('_fbp') };
  }

  function pageContext() {
    return {
      page_path: window.location.pathname,
      page_origin: window.location.origin,
      title: document.title ? String(document.title).slice(0, 300) : null,
      viewport_width: window.innerWidth || null,
      viewport_height: window.innerHeight || null,
      timezone:
        window.Intl && Intl.DateTimeFormat
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || null
          : null,
      language: navigator.language || null,
      gpc: gpcEnabled()
    };
  }

  function buildProperties(custom) {
    var properties = sanitizeUnknown(custom || {}, 0) || {};
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) properties = {};

    var signals = observedMetaSignals();
    properties.pageUrl = safePageUrl();
    properties.pagePath = window.location.pathname;
    properties.pageTitle = document.title ? String(document.title).slice(0, 500) : null;
    properties.referrer = safeReferrer();
    properties.firstTouch = firstTouch;
    properties.sessionTouch = sessionTouch;
    if (signals.fbc) properties.fbc = signals.fbc;
    if (signals.fbp) properties.fbp = signals.fbp;
    properties.metadata = Object.assign(
      {},
      properties.metadata && typeof properties.metadata === 'object' ? properties.metadata : {},
      {
        sdk: 'salsys-browser-v1',
        sdk_version: '1.1.1'
      }
    );

    return properties;
  }

  function localPermission(eventName) {
    if (eventName === 'web.form_submitted' || eventName === 'web.lead_submitted') return true;
    if (eventName.indexOf('web.') === 0) return analyticsGranted();
    return false;
  }

  function envelope(eventName, properties, options) {
    options = options || {};
    return {
      event_id: options.eventId || randomId('evt'),
      event_name: eventName,
      schema_version: 1,
      occurred_at: options.occurredAt || new Date().toISOString(),
      anonymous_visitor_id: visitorId,
      session_key: sessionId,
      site: SITE,
      properties: buildProperties(properties),
      context: pageContext(),
      metadata: {
        sdk: 'salsys-browser-v1',
        sdk_version: '1.1.1',
        consent_mode: CONSENT_MODE,
        consent_snapshot: privacyState(),
        local_permission: localPermission(eventName)
      }
    };
  }

  function postJson(url, body, keepalive) {
    return fetch(url, {
      method: 'POST',
      mode: url.indexOf(window.location.origin) === 0 ? 'same-origin' : 'cors',
      credentials: 'omit',
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

  function readQueue() {
    var parsed = parseJson(safeGet(window.localStorage, KEYS.queue), []);
    return Array.isArray(parsed) ? parsed.slice(-50) : [];
  }

  function saveQueue(items) {
    if (!analyticsGranted()) return;
    safeSet(window.localStorage, KEYS.queue, JSON.stringify(items.slice(-50)));
  }

  function queueEnvelope(value) {
    if (!analyticsGranted()) return;
    var queue = readQueue();
    queue.push(value);
    saveQueue(queue);
  }

  var flushingQueue = false;
  function flushQueue() {
    if (flushingQueue || !analyticsGranted()) return Promise.resolve();
    var queue = readQueue();
    if (!queue.length) return Promise.resolve();
    var epoch = analyticsIdentityEpoch;
    flushingQueue = true;

    var remaining = [];
    var chain = Promise.resolve();
    queue.forEach(function (item) {
      chain = chain.then(function () {
        // Do not replay a previously queued analytics event after opt-out.
        if (epoch !== analyticsIdentityEpoch || !analyticsGranted() ||
            !item || item.anonymous_visitor_id !== visitorId) return;
        return postJson(EVENT_ENDPOINT, item, true).catch(function () {
          if (epoch === analyticsIdentityEpoch && analyticsGranted()) remaining.push(item);
        });
      });
    });

    return chain.then(function () {
      if (epoch === analyticsIdentityEpoch && analyticsGranted()) saveQueue(remaining);
      flushingQueue = false;
    }).catch(function () {
      flushingQueue = false;
    });
  }

  function track(eventName, properties, options) {
    // Revalidate the shared consent epoch on every event, even if this tab
    // missed a cross-tab storage notification while suspended.
    reconcileExternalConsent();
    options = options || {};
    eventName = String(eventName || '').trim().toLowerCase();
    if (!/^web\.[a-z][a-z0-9_]*$/.test(eventName)) {
      return Promise.reject(new Error('Browser SDK events must use the web.* namespace.'));
    }

    if (!localPermission(eventName)) {
      return Promise.resolve({
        ok: true,
        accepted: false,
        privacy_blocked: true,
        reason: 'local_privacy_gate'
      });
    }

    var body = envelope(eventName, properties, options);
    return postJson(EVENT_ENDPOINT, body, options.keepalive !== false).catch(function (error) {
      if (options.queue !== false && analyticsGranted() &&
          body.anonymous_visitor_id === visitorId) queueEnvelope(body);
      throw error;
    });
  }

  function rotateAnalyticsIdentity(localOnly) {
    // A withdrawal severs the old browser identifier and attribution chain.
    analyticsIdentityEpoch += 1;
    if (localOnly !== true) {
      safeRemove(window.localStorage, KEYS.persistentVisitor);
      safeRemove(window.localStorage, KEYS.firstTouch);
      safeRemove(window.localStorage, KEYS.queue);
    }
    [KEYS.sessionVisitor, KEYS.session, KEYS.sessionStarted,
      KEYS.pendingFirstTouch, KEYS.sessionTouch].forEach(function (key) {
      safeRemove(window.sessionStorage, key);
    });

    visitorId = randomId('v');
    sessionId = randomId('s');
    sessionTouch = currentTouch();
    firstTouch = sessionTouch;
    window.__salsysInitialPageSent = false;
    // Existing forms must not keep stale hidden visitor/session identifiers.
    decorateForms();
  }

  function persistAnalyticsIdentity() {
    // Restore session continuity only after an acknowledged analytics grant.
    safeSet(window.sessionStorage, KEYS.sessionVisitor, visitorId);
    safeSet(window.sessionStorage, KEYS.session, sessionId);
    safeSet(window.sessionStorage, KEYS.sessionTouch, JSON.stringify(sessionTouch));
    safeSet(window.sessionStorage, KEYS.pendingFirstTouch, JSON.stringify(firstTouch));
    safeSet(window.localStorage, KEYS.persistentVisitor, visitorId);
    if (meaningfulObject(firstTouch)) {
      safeSet(window.localStorage, KEYS.firstTouch, JSON.stringify(firstTouch));
    }
  }

  // A second tab must not resume from a saved consent grant until it has
  // observed a fresh post-grant shared visitor ID. This storage handler runs
  // only for changes made in OTHER tabs on the same website origin.
  var externalGrantAwaitingIdentity = false;

  function onExternalStorage(event) {
    if (!event || event.storageArea !== window.localStorage) return;

    if (event.key === KEYS.privacy || event.key === null) {
      var incoming = parseJson(event.newValue, {});
      var previous = parseJson(event.oldValue, {});
      var decision = incoming && incoming.analytics;
      var priorDecision = previous && previous.analytics;

      if (decision !== priorDecision || event.newValue === null) {
        // Invalidate any older in-flight consent reply from this tab.
        // It may not undo another tab's later privacy decision.
        analyticsConsentRevision += 1;
      }

      if (event.newValue === null || analyticsDenied(decision)) {
        if (!analyticsOptOutRequested || externalGrantAwaitingIdentity) {
          analyticsOptOutRequested = true;
          rotateAnalyticsIdentity(true);
        }
        analyticsOptOutRequested = true;
        externalGrantAwaitingIdentity = false;
        return;
      }

      if (decision === 'granted' && priorDecision !== 'granted') {
        // A privacy-state event precedes the visitor-ID storage update on
        // a successful grant. Never send events using an obsolete ID here.
        analyticsOptOutRequested = true;
        externalGrantAwaitingIdentity = true;
      }
      return;
    }

    if (event.key !== KEYS.persistentVisitor ||
        !externalGrantAwaitingIdentity ||
        privacyState().analytics !== 'granted') return;

    var newVisitor = event.newValue;
    if (!newVisitor || newVisitor !== safeGet(window.localStorage, KEYS.persistentVisitor) ||
        !/^v_[A-Za-z0-9_-]{8,100}$/.test(newVisitor)) return;

    analyticsIdentityEpoch += 1;
    visitorId = newVisitor;
    sessionId = randomId('s');
    sessionTouch = currentTouch();
    firstTouch = sessionTouch;
    safeRemove(window.sessionStorage, KEYS.sessionStarted);
    safeRemove(window.sessionStorage, KEYS.pendingFirstTouch);
    window.__salsysInitialPageSent = false;
    analyticsOptOutRequested = false;
    externalGrantAwaitingIdentity = false;
    safeSet(window.sessionStorage, KEYS.sessionVisitor, visitorId);
    safeSet(window.sessionStorage, KEYS.session, sessionId);
    safeSet(window.sessionStorage, KEYS.sessionTouch, JSON.stringify(sessionTouch));
    firstTouch = getFirstTouch();
    decorateForms();
    sendSessionStarted();
    if (AUTO_PAGE && !window.__salsysInitialPageSent) {
      window.__salsysInitialPageSent = true;
      track('web.page_viewed', {}, { keepalive: true }).catch(function () {});
    }
  }

  function reconcileExternalConsent() {
    var decision = privacyState().analytics;
    if (analyticsDenied(decision)) {
      if (!analyticsOptOutRequested) {
        analyticsOptOutRequested = true;
        rotateAnalyticsIdentity(true);
      }
      externalGrantAwaitingIdentity = false;
      return;
    }
    if (decision !== 'granted') return;
    var candidate = safeGet(window.localStorage, KEYS.persistentVisitor);
    if (candidate && candidate !== visitorId) {
      // A suspended tab may miss both storage events; its next interaction
      // must join only the new, acknowledged visitor epoch.
      analyticsOptOutRequested = true;
      externalGrantAwaitingIdentity = true;
      onExternalStorage({
        key: KEYS.persistentVisitor,
        newValue: candidate,
        storageArea: window.localStorage
      });
    }
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', onExternalStorage);
    window.addEventListener('pageshow', reconcileExternalConsent);
    window.addEventListener('focus', reconcileExternalConsent);
  }

  // A 2xx transport status is NOT consent persistence proof. Both public
  // consent endpoints return this structured receipt contract after writing.
  // Fail closed if a proxy or unexpected response omits that evidence.
  function verifiedConsentDecisions(result, request) {
    var invalid = function () {
      throw new Error('Privacy preference server receipt was not verified.');
    };
    if (!result || result.ok !== true ||
        result.visitor_id !== request.visitor_id ||
        !result.effective_decisions ||
        typeof result.effective_decisions !== 'object' ||
        Array.isArray(result.effective_decisions) ||
        !Array.isArray(result.receipts)) invalid();

    var effective = result.effective_decisions;
    var allowedPurposes = ['analytics', 'marketing', 'advertising',
      'sale_sharing', 'personalization'];
    var allowedDecisions = ['granted', 'denied', 'withdrawn', 'opted_out', 'limited'];
    // The browser can rely on a consent receipt only when it accounts for
    // every persisted decision and there are no extra/unrequested receipts.
    // Public consent endpoints emit exactly one receipt per effective purpose.
    var effectivePurposes = Object.keys(effective);
    if (result.receipts.length !== effectivePurposes.length) invalid();
    result.receipts.forEach(function (receipt) {
      if (!receipt || !Object.prototype.hasOwnProperty.call(effective, receipt.purpose) ||
          receipt.decision !== effective[receipt.purpose] ||
          typeof receipt.receipt_id !== 'string' ||
          receipt.receipt_id.trim().length === 0 ||
          receipt.receipt_id === 'null') invalid();
    });
    effectivePurposes.forEach(function (purpose) {
      if (allowedPurposes.indexOf(purpose) === -1 ||
          allowedDecisions.indexOf(effective[purpose]) === -1) invalid();
      // The only server-added purpose allowed by the public consent API is
      // GPC sale-sharing opt-out. Never grant an unrequested optional purpose.
      if (!Object.prototype.hasOwnProperty.call(request.decisions, purpose) &&
          !(purpose === 'sale_sharing' && effective[purpose] === 'opted_out')) invalid();
      var matches = result.receipts.filter(function (receipt) {
        return receipt && receipt.purpose === purpose &&
          receipt.decision === effective[purpose] &&
          typeof receipt.receipt_id === 'string' &&
          receipt.receipt_id.trim().length > 0 &&
          receipt.receipt_id !== 'null';
      });
      if (matches.length !== 1) invalid();
    });
    Object.keys(request.decisions).forEach(function (purpose) {
      if (effective[purpose] !== request.decisions[purpose]) invalid();
    });
    return effective;
  }

  // Queue network consent receipts in invocation order; never claim a later
  // grant is confirmed before an earlier withdrawal request completes.
  var consentReceiptQueue = Promise.resolve();
  var analyticsConsentRevision = 0;

  function consent(decisions) {
    // Also catches a tab that missed a remote withdrawal while suspended.
    // This must run before the receipt captures its visitor ID.
    reconcileExternalConsent();
    var normalized = {};
    Object.keys(decisions || {}).forEach(function (purpose) {
      var decision = String(decisions[purpose] || '').trim().toLowerCase();
      if (['granted', 'denied', 'withdrawn', 'opted_out', 'limited'].indexOf(decision) >= 0) {
        normalized[purpose] = decision;
      }
    });

    if (gpcEnabled()) normalized.sale_sharing = 'opted_out';
    if (!Object.keys(normalized).length) {
      return Promise.reject(new Error('At least one supported privacy decision is required.'));
    }

    var changesAnalytics = Object.prototype.hasOwnProperty.call(normalized, 'analytics');
    var revision = changesAnalytics ? ++analyticsConsentRevision : analyticsConsentRevision;
    var optingOut = changesAnalytics && analyticsDenied(normalized.analytics);
    var body = {
      event_id: randomId('consent'),
      // The receipt refers to the original browser identity, before rotation.
      visitor_id: visitorId,
      occurred_at: new Date().toISOString(),
      gpc: gpcEnabled(),
      decisions: normalized
    };

    if (optingOut) {
      // The local choice is authoritative for stopping optional tracking:
      // even if the network is offline, opt-out must never be rolled back.
      analyticsOptOutRequested = true;
      var immediate = privacyState();
      immediate.analytics = normalized.analytics;
      immediate.updated_at = new Date().toISOString();
      immediate.gpc = gpcEnabled();
      safeSet(window.localStorage, KEYS.privacy, JSON.stringify(immediate));
      rotateAnalyticsIdentity();
    }

    var receipt = consentReceiptQueue.then(function () {
      return postJson(CONSENT_ENDPOINT, body, true);
    });
    consentReceiptQueue = receipt.catch(function () {});

    return receipt.then(function (result) {
      if (changesAnalytics && revision !== analyticsConsentRevision) {
        throw new Error('Consent request superseded by a newer browser privacy decision.');
      }
      var effective = verifiedConsentDecisions(result, body);
      if (optingOut && !analyticsDenied(effective.analytics)) {
        throw new Error('Analytics opt-out was not confirmed. Local tracking remains disabled.');
      }

      var state = privacyState();
      Object.keys(effective).forEach(function (key) {
        if (key === 'analytics' &&
            (!changesAnalytics || revision !== analyticsConsentRevision)) return;
        state[key] = effective[key];
      });
      state.updated_at = new Date().toISOString();
      state.gpc = gpcEnabled();
      safeSet(window.localStorage, KEYS.privacy, JSON.stringify(state));

      if (changesAnalytics && revision === analyticsConsentRevision) {
        analyticsOptOutRequested = analyticsDenied(state.analytics);
      }

      if (analyticsGranted()) {
        persistAnalyticsIdentity();
        firstTouch = getFirstTouch();
        decorateForms();
        flushQueue();
        sendSessionStarted();
        if (AUTO_PAGE && !window.__salsysInitialPageSent) {
          window.__salsysInitialPageSent = true;
          track('web.page_viewed', {}, { keepalive: true }).catch(function () {});
        }
      }

      return result;
    });
  }

  function setHidden(form, name, value) {
    if (!form || !name) return;
    var input = form.querySelector('input[name="' + name.replace(/"/g, '\\"') + '"]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      form.appendChild(input);
    }
    input.value = value == null ? '' : String(value);
  }

  function decorateForm(form) {
    if (!form || !form.appendChild) return;
    setHidden(form, 'salsys_visitor_id', visitorId);
    setHidden(form, 'salsys_session_id', sessionId);
    setHidden(form, 'salsys_first_touch', JSON.stringify(firstTouch || {}));
    setHidden(form, 'salsys_session_touch', JSON.stringify(sessionTouch || {}));
  }

  function decorateForms() {
    if (!AUTO_FORMS) return;
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) decorateForm(forms[i]);
  }

  function elementProps(element) {
    var result = {};
    if (!element || !element.attributes) return result;
    for (var i = 0; i < element.attributes.length; i++) {
      var attribute = element.attributes[i];
      if (attribute.name.indexOf('data-salsys-prop-') === 0) {
        var key = attribute.name.slice('data-salsys-prop-'.length).replace(/-/g, '_').slice(0, 80);
        if (key) result[key] = String(attribute.value || '').slice(0, 500);
      }
    }
    return result;
  }

  function classifyCta(element) {
    var explicit = element.getAttribute('data-salsys-track');
    if (explicit) return explicit.slice(0, 160);
    var href = element.getAttribute('href') || '';
    var lower = href.toLowerCase();
    if (lower.indexOf('wa.me') !== -1 || lower.indexOf('whatsapp') !== -1) return 'whatsapp_click';
    if (lower.indexOf('tel:') === 0) return 'phone_click';
    if (lower.indexOf('mailto:') === 0) return 'email_click';
    return null;
  }

  function installDeclarativeTracking() {
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest
        ? event.target.closest('[data-salsys-track],[data-salsys-event],a[href^="tel:"],a[href^="mailto:"],a[href*="wa.me"],a[href*="whatsapp"]')
        : null;
      if (!target) return;

      var eventName = target.getAttribute('data-salsys-event') || 'web.cta_clicked';
      eventName = String(eventName).trim().toLowerCase();
      if (eventName.indexOf('web.') !== 0) eventName = 'web.cta_clicked';

      var properties = elementProps(target);
      properties.action = classifyCta(target) || properties.action || 'cta_click';
      properties.element = (target.tagName || '').toLowerCase();
      properties.label = safeText(target.getAttribute('aria-label') || target.textContent || '', 160);

      var href = target.getAttribute('href');
      if (href) {
        try {
          var destination = new URL(href, window.location.href);
          properties.destination_origin = destination.origin;
          properties.destination_path = destination.pathname;
        } catch (_) {}
      }

      track(eventName, properties, { keepalive: true }).catch(function () {});
    }, { capture: true });

    var startedForms = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    document.addEventListener('focusin', function (event) {
      if (!AUTO_FORMS) return;
      var form = event.target && event.target.form;
      if (!form || (startedForms && startedForms.has(form))) return;
      if (startedForms) startedForms.add(form);
      decorateForm(form);
      track('web.form_started', {
        form_id: safeText(form.id || form.getAttribute('name') || 'anonymous', 160),
        form_action: (function () {
          try { return new URL(form.action || window.location.href, window.location.href).pathname; } catch (_) { return null; }
        })()
      }, { keepalive: true }).catch(function () {});
    });

    document.addEventListener('submit', function (event) {
      if (!AUTO_FORMS) return;
      var form = event.target;
      if (!form || String(form.tagName || '').toLowerCase() !== 'form') return;
      decorateForm(form);
      track('web.form_submitted', {
        form_id: safeText(form.id || form.getAttribute('name') || 'anonymous', 160),
        form_action: (function () {
          try { return new URL(form.action || window.location.href, window.location.href).pathname; } catch (_) { return null; }
        })()
      }, { keepalive: true, queue: false }).catch(function () {});
    }, { capture: true });
  }

  function queuedSessionStartFor(sessionKey, browserVisitor) {
    // A failed original envelope retains the event ID for idempotent retry.
    // Both identity parts must match the current consent/browser epoch.
    var queued = readQueue();
    for (var i = 0; i < queued.length; i++) {
      var item = queued[i];
      if (item && item.event_name === 'web.session_started' &&
          item.session_key === sessionKey &&
          item.anonymous_visitor_id === browserVisitor &&
          typeof item.event_id === 'string' && item.event_id.length > 0) {
        return true;
      }
    }
    return false;
  }

  function sendSessionStarted() {
    if (!analyticsGranted()) return;
    var emittedSession = sessionId;
    var emittedVisitor = visitorId;
    if (safeGet(window.sessionStorage, KEYS.sessionStarted) === emittedSession) return;
    if (queuedSessionStartFor(emittedSession, emittedVisitor)) {
      // The consent-epoch-aware flushQueue() handles the original envelope.
      safeSet(window.sessionStorage, KEYS.sessionStarted, emittedSession);
      return;
    }
    safeSet(window.sessionStorage, KEYS.sessionStarted, emittedSession);
    track('web.session_started', {}, { keepalive: true }).catch(function () {
      // Withdrawal clears the old queue and rotates session and visitor IDs.
      // A late POST failure must never touch a newer session's marker.
      if (queuedSessionStartFor(emittedSession, emittedVisitor)) return;
      if (safeGet(window.sessionStorage, KEYS.sessionStarted) === emittedSession) {
        safeRemove(window.sessionStorage, KEYS.sessionStarted);
      }
    });
  }

  function installSpaTracking() {
    if (!AUTO_SPA || !window.history) return;
    var lastUrl = window.location.href;
    function onNavigation() {
      if (window.location.href === lastUrl) return;
      lastUrl = window.location.href;
      sessionTouch = getSessionTouch();
      decorateForms();
      if (AUTO_PAGE && analyticsGranted()) {
        track('web.page_viewed', { navigation_type: 'spa' }, { keepalive: true }).catch(function () {});
      }
    }

    ['pushState', 'replaceState'].forEach(function (method) {
      var original = history[method];
      if (typeof original !== 'function') return;
      history[method] = function () {
        var result = original.apply(this, arguments);
        setTimeout(onNavigation, 0);
        return result;
      };
    });
    window.addEventListener('popstate', onNavigation);
  }

  var api = {
    __eventIntelligenceV1: true,
    version: '1.1.1',
    track: track,
    page: function (properties) {
      return track('web.page_viewed', properties || {}, { keepalive: true });
    },
    consent: consent,
    visitorId: function () { return visitorId; },
    sessionId: function () { return sessionId; },
    identifiers: function () {
      return {
        visitor_id: visitorId,
        session_id: sessionId,
        first_touch: firstTouch,
        session_touch: sessionTouch
      };
    },
    privacy: function () {
      return {
        decisions: privacyState(),
        gpc: gpcEnabled(),
        analytics_allowed_locally: analyticsGranted(),
        advertising_allowed_locally: advertisingGranted(),
        consent_mode: CONSENT_MODE
      };
    },
    decorateForm: decorateForm,
    decorateForms: decorateForms,
    flush: flushQueue,
    config: function () {
      return {
        site: SITE,
        event_endpoint: EVENT_ENDPOINT,
        consent_endpoint: CONSENT_ENDPOINT,
        consent_mode: CONSENT_MODE
      };
    }
  };

  window.Salsys = api;

  decorateForms();
  installDeclarativeTracking();
  installSpaTracking();

  if (gpcEnabled() && privacyState().sale_sharing !== 'opted_out') {
    consent({ sale_sharing: 'opted_out' }).catch(function () {});
  }

  if (CONSENT_MODE === 'granted' && !Object.prototype.hasOwnProperty.call(privacyState(), 'analytics')) {
    consent({ analytics: 'granted' }).catch(function () {});
  } else if (analyticsGranted()) {
    persistAnalyticsIdentity();
    flushQueue();
    sendSessionStarted();
    if (AUTO_PAGE) {
      window.__salsysInitialPageSent = true;
      track('web.page_viewed', {}, { keepalive: true }).catch(function () {});
    }
  }

  log('initialized', api.config());
})();
