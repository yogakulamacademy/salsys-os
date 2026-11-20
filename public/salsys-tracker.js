/* Salsys Event Intelligence Browser SDK v1.1.0 */
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

  // Tracked-link handoff (DM-LINK): links sent to a lead open the website with
  // ?slk=<code>. Keep the code for this tab session so the server can link this
  // visitor to that lead, then remove it from the address bar. Runs before the
  // SPA hooks are installed, so removing it is not counted as a page view.
  var LINK_CODE_KEY = 'salsys_link_code_v1';
  var trackedLinkCode = null;
  try {
    var linkUrl = new URL(window.location.href);
    var linkParam = linkUrl.searchParams.get('slk');
    if (linkParam && /^[A-Za-z0-9]{8,16}$/.test(linkParam)) {
      trackedLinkCode = linkParam;
      try { window.sessionStorage.setItem(LINK_CODE_KEY, linkParam); } catch (_) {}
      linkUrl.searchParams.delete('slk');
      if (window.history && window.history.replaceState) {
        window.history.replaceState(window.history.state, '', linkUrl.pathname + linkUrl.search + linkUrl.hash);
      }
    } else {
      var storedCode = null;
      try { storedCode = window.sessionStorage.getItem(LINK_CODE_KEY); } catch (_) {}
      if (storedCode && /^[A-Za-z0-9]{8,16}$/.test(storedCode)) trackedLinkCode = storedCode;
    }
  } catch (_) {}

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

  function analyticsGranted() {
    if (CONSENT_MODE === 'granted') return true;
    return privacyState().analytics === 'granted';
  }

  function advertisingGranted() {
    return privacyState().advertising === 'granted';
  }

  function sessionVisitorCandidate() {
    var value = safeGet(window.sessionStorage, KEYS.sessionVisitor);
    if (value) return value;

    if (analyticsGranted()) {
      value = safeGet(window.localStorage, KEYS.persistentVisitor);
    }

    if (!value) value = randomId('v');
    safeSet(window.sessionStorage, KEYS.sessionVisitor, value);

    if (analyticsGranted()) safeSet(window.localStorage, KEYS.persistentVisitor, value);
    return value;
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
    if (trackedLinkCode) properties.trackedLinkCode = trackedLinkCode;
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
        sdk_version: '1.1.0'
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
        sdk_version: '1.1.0',
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
    flushingQueue = true;

    var remaining = [];
    var chain = Promise.resolve();
    queue.forEach(function (item) {
      chain = chain.then(function () {
        return postJson(EVENT_ENDPOINT, item, true).catch(function () {
          remaining.push(item);
        });
      });
    });

    return chain.then(function () {
      saveQueue(remaining);
      flushingQueue = false;
    }).catch(function () {
      flushingQueue = false;
    });
  }

  function track(eventName, properties, options) {
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
      if (options.queue !== false && analyticsGranted()) queueEnvelope(body);
      throw error;
    });
  }

  function persistAnalyticsIdentity() {
    safeSet(window.localStorage, KEYS.persistentVisitor, visitorId);
    if (meaningfulObject(firstTouch)) {
      safeSet(window.localStorage, KEYS.firstTouch, JSON.stringify(firstTouch));
    }
  }

  function consent(decisions) {
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

    var body = {
      event_id: randomId('consent'),
      visitor_id: visitorId,
      occurred_at: new Date().toISOString(),
      gpc: gpcEnabled(),
      decisions: normalized
    };

    return postJson(CONSENT_ENDPOINT, body, true).then(function (result) {
      var effective =
        result && result.effective_decisions && typeof result.effective_decisions === 'object'
          ? result.effective_decisions
          : normalized;
      var state = privacyState();
      Object.keys(effective).forEach(function (key) { state[key] = effective[key]; });
      state.updated_at = new Date().toISOString();
      state.gpc = gpcEnabled();
      safeSet(window.localStorage, KEYS.privacy, JSON.stringify(state));

      if (state.analytics === 'granted') {
        persistAnalyticsIdentity();
        firstTouch = getFirstTouch();
        flushQueue();
        sendSessionStarted();
        if (AUTO_PAGE && !window.__salsysInitialPageSent) {
          window.__salsysInitialPageSent = true;
          track('web.page_viewed', {}, { keepalive: true }).catch(function () {});
        }
      } else if (
        state.analytics === 'denied' ||
        state.analytics === 'withdrawn' ||
        state.analytics === 'opted_out'
      ) {
        safeRemove(window.localStorage, KEYS.persistentVisitor);
        safeRemove(window.localStorage, KEYS.firstTouch);
        safeRemove(window.localStorage, KEYS.queue);
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

  function sendSessionStarted() {
    if (!analyticsGranted()) return;
    if (safeGet(window.sessionStorage, KEYS.sessionStarted) === sessionId) return;
    safeSet(window.sessionStorage, KEYS.sessionStarted, sessionId);
    track('web.session_started', {}, { keepalive: true }).catch(function () {
      safeRemove(window.sessionStorage, KEYS.sessionStarted);
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

  // ---------------------------------------------------------------------------
  // Interest signals (20 Nov 2026). Automatic, consent-gated, no visitor text:
  // only categories, percentages and seconds are sent. Bounded per page so a
  // busy page can never flood the CRM. Opt out with data-interest="false".
  //   web.scroll_depth_reached  25 / 50 / 75 / 90 %
  //   web.pricing_viewed        a price was on screen for 1 s
  //   web.cta_clicked           enrol / pay / whatsapp / call / fees / dates / contact / email
  //   web.brochure_clicked      brochure or PDF
  //   web.faq_expanded          an FAQ / accordion item opened
  //   web.media_interacted      video play / 25-50-75 % / complete, gallery and photo opens
  //   web.engaged_time          seconds actually spent on the page (sent when leaving it)
  // ---------------------------------------------------------------------------
  var AUTO_INTEREST = !(script.dataset && script.dataset.interest === 'false');
  var PRICE_TEXT = /(₹|rs\.?\s|inr|usd|us\$|\$|€|eur|£|gbp)\s?\d{1,3}([,.\s]?\d{2,3})+|\d{1,3}([,.]\d{3})+\s?(inr|usd|eur|gbp|rupees)/i;
  var PRICE_SELECTOR = '[data-salsys-pricing-id],[class*="price" i],[id*="price" i],[class*="fee" i],[id*="fee" i],[class*="pricing" i],[class*="tuition" i]';
  var GALLERY_SELECTOR = '[class*="gallery" i],[class*="lightbox" i],[class*="swiper" i],[class*="slick" i],[class*="carousel" i],[class*="fancybox" i],[class*="photo" i],[class*="glightbox" i],[data-salsys-gallery]';
  var FAQ_SELECTOR = '[class*="faq" i],[id*="faq" i],[class*="accordion" i],[data-salsys-faq]';
  var CTA_RULES = [
    ['brochure', /brochure|prospectus|syllabus|download|\.pdf(\?|$)/i],
    ['pay', /\bpay\b|payment|checkout|razorpay|stripe|paypal/i],
    ['enrol', /enrol|enroll|register|apply|book\s?(now|your|a)|reserve|join\s?(now|the)|admission|sign\s?up/i],
    ['whatsapp', /whatsapp|wa\.me|api\.whatsapp/i],
    ['call', /^tel:|\bcall\b/i],
    ['email', /^mailto:/i],
    ['fees', /\bfee|price|pricing|cost|tuition/i],
    ['dates', /\bdates?\b|batch|schedule|calendar|upcoming/i],
    ['contact', /contact|enquir|inquir|talk to|ask a question|get in touch/i]
  ];

  function installInterestTracking() {
    if (!AUTO_INTEREST || window.__salsysInterestV1) return;
    window.__salsysInterestV1 = true;

    var pageKey = window.location.pathname;
    var sent = Object.create(null);
    var sentCount = 0;
    var MAX_PER_PAGE = 60;
    var engagedMs = 0;
    var lastActive = Date.now();
    var lastTick = Date.now();
    var priceObserver = null;
    var priceTimers = [];

    function pageSlug() {
      return (window.location.pathname || '/').toLowerCase().replace(/[^a-z0-9/_-]/g, '').replace(/\/+$/, '').slice(0, 120) || '/';
    }

    function emit(name, props, key) {
      if (!analyticsGranted() || document.visibilityState === 'hidden') return;
      if (key) { if (sent[key]) return; sent[key] = true; }
      if (sentCount >= MAX_PER_PAGE) return;
      sentCount++;
      track(name, props || {}, { keepalive: true }).catch(function () {});
    }

    // Reading time: counts only while the tab is visible and the visitor did
    // something in the last 30 seconds (scroll, key, pointer, touch).
    function tick() {
      var now = Date.now();
      if (document.visibilityState === 'visible' && now - lastActive < 30000) engagedMs += Math.min(now - lastTick, 5000);
      lastTick = now;
    }
    function markActive() { tick(); lastActive = Date.now(); }
    ['scroll', 'keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel'].forEach(function (type) {
      window.addEventListener(type, markActive, { passive: true, capture: true });
    });
    window.setInterval(tick, 5000);

    function flushEngaged() {
      tick();
      var seconds = Math.round(engagedMs / 1000);
      if (seconds >= 5 && analyticsGranted()) {
        track('web.engaged_time', { engaged_seconds: Math.min(seconds, 3600), page_slug: pageSlug(), max_scroll_percent: maxDepth }, { keepalive: true, queue: false }).catch(function () {});
      }
      engagedMs = 0;
    }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushEngaged(); });
    window.addEventListener('pagehide', flushEngaged);

    // Scroll depth.
    var maxDepth = 0;
    function depth() {
      var root = document.documentElement;
      var viewport = window.innerHeight || (root && root.clientHeight) || 0;
      var total = Math.max(root ? root.scrollHeight : 0, document.body ? document.body.scrollHeight : 0);
      if (!viewport || total <= viewport) return 100;
      return Math.max(0, Math.min(100, Math.floor(((window.scrollY || 0) + viewport) / total * 100)));
    }
    var scrollQueued = false;
    window.addEventListener('scroll', function () {
      if (scrollQueued) return;
      scrollQueued = true;
      window.setTimeout(function () {
        scrollQueued = false;
        var d = depth();
        if (d > maxDepth) maxDepth = d;
        [25, 50, 75, 90].forEach(function (t) {
          if (d >= t) emit('web.scroll_depth_reached', { threshold_percent: t, page_slug: pageSlug() }, 'scroll:' + t);
        });
      }, 250);
    }, { passive: true });

    // Price on screen for 1 second.
    function priceId(el) {
      var explicit = el.getAttribute && el.getAttribute('data-salsys-pricing-id');
      if (explicit && /^[a-z0-9][a-z0-9_:.-]{0,79}$/i.test(explicit)) return explicit.toLowerCase();
      return 'auto:' + pageSlug();
    }
    function watchPrices() {
      if (!priceObserver || !document.querySelectorAll) return;
      var candidates = [];
      try { candidates = Array.prototype.slice.call(document.querySelectorAll(PRICE_SELECTOR), 0, 80); } catch (_) {}
      // Plain text prices (e.g. "₹30,000", "$750") in short elements.
      try {
        var nodes = document.querySelectorAll('h1,h2,h3,h4,p,span,strong,b,li,td,div');
        for (var i = 0; i < nodes.length && candidates.length < 120; i++) {
          var n = nodes[i];
          if (n.children && n.children.length > 3) continue;
          var t = (n.textContent || '');
          if (t.length > 0 && t.length < 140 && PRICE_TEXT.test(t)) candidates.push(n);
        }
      } catch (_) {}
      candidates.forEach(function (el) {
        if (!el.__salsysPrice) { el.__salsysPrice = true; priceObserver.observe(el); }
      });
    }
    if (typeof window.IntersectionObserver === 'function') {
      priceObserver = new window.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var el = entry.target;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            el.__salsysPriceTimer = window.setTimeout(function () {
              emit('web.pricing_viewed', { pricing_id: priceId(el), page_slug: pageSlug() }, 'pricing:' + priceId(el));
            }, 1000);
            priceTimers.push(el.__salsysPriceTimer);
          } else if (el.__salsysPriceTimer) {
            window.clearTimeout(el.__salsysPriceTimer);
            el.__salsysPriceTimer = null;
          }
        });
      }, { threshold: [0, 0.6] });
    }

    // Clicks: CTA categories, brochure, FAQ, gallery / photo.
    function closest(el, selector) {
      while (el && el.nodeType === 1) {
        try { if (el.matches && el.matches(selector)) return el; } catch (_) { return null; }
        el = el.parentElement;
      }
      return null;
    }
    function hrefKind(href) {
      if (!href) return 'none';
      if (/^tel:/i.test(href)) return 'tel';
      if (/^mailto:/i.test(href)) return 'mailto';
      if (/wa\.me|whatsapp/i.test(href)) return 'whatsapp';
      try { return new URL(href, window.location.href).host === window.location.host ? 'internal' : 'external'; } catch (_) { return 'other'; }
    }
    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !analyticsGranted()) return;

      var control = closest(target, 'a,button,[role="button"],input[type="submit"],input[type="button"],summary');
      // WhatsApp, phone and email links are already tracked by installDeclarativeTracking.
      var declarative = control && closest(control, 'a[href^="tel:"],a[href^="mailto:"],a[href*="wa.me"],a[href*="whatsapp"]');
      if (control && !declarative && !control.hasAttribute('data-salsys-event') && !control.hasAttribute('data-salsys-track')) {
        var href = control.getAttribute('href') || '';
        // Text is only matched here, never sent.
        var label = ((control.innerText || control.value || '') + ' ' + (control.getAttribute('aria-label') || '') + ' ' + href).slice(0, 300);
        var kind = null;
        for (var i = 0; i < CTA_RULES.length; i++) { if (CTA_RULES[i][1].test(label)) { kind = CTA_RULES[i][0]; break; } }
        if (kind === 'brochure') {
          emit('web.brochure_clicked', { cta_kind: 'brochure', href_kind: hrefKind(href), page_slug: pageSlug() }, 'brochure:' + Math.floor(Date.now() / 2000));
        } else if (kind) {
          emit('web.cta_clicked', { cta_id: 'auto_' + kind, cta_kind: kind, href_kind: hrefKind(href), page_slug: pageSlug() }, 'cta:' + kind + ':' + Math.floor(Date.now() / 2000));
        }
      }

      var faq = closest(target, 'summary,[aria-expanded],button,' + FAQ_SELECTOR);
      if (faq && closest(faq, FAQ_SELECTOR + ',details')) {
        var items = [];
        try { items = Array.prototype.slice.call(document.querySelectorAll('details,' + FAQ_SELECTOR + ' [aria-expanded]')); } catch (_) {}
        var index = items.indexOf(closest(target, 'details') || faq);
        emit('web.faq_expanded', { faq_index: index >= 0 ? index : null, page_slug: pageSlug() }, 'faq:' + index);
      }

      var gallery = closest(target, GALLERY_SELECTOR);
      var isImage = (target.tagName === 'IMG' && (target.clientWidth || 0) >= 120) || closest(target, 'picture,figure');
      if (gallery || isImage) {
        var next = closest(target, '[class*="next" i],[class*="prev" i],[class*="arrow" i],[aria-label*="next" i],[aria-label*="previous" i]');
        var action = next ? 'browse' : 'open';
        var media = gallery ? 'gallery' : 'photo';
        emit('web.media_interacted', { media: media, action: action, page_slug: pageSlug() }, media + ':' + action + ':' + (action === 'browse' ? Math.floor(Date.now() / 3000) : 'once'));
      }
    }, true);

    // Native videos: play, 25 / 50 / 75 %, complete.
    function watchVideos() {
      var videos = [];
      try { videos = document.querySelectorAll('video'); } catch (_) {}
      for (var v = 0; v < videos.length && v < 20; v++) {
        (function (video, idx) {
          if (video.__salsysVideo) return;
          video.__salsysVideo = true;
          video.addEventListener('play', function () { emit('web.media_interacted', { media: 'video', action: 'play', video_index: idx, page_slug: pageSlug() }, 'video:' + idx + ':play'); });
          video.addEventListener('ended', function () { emit('web.media_interacted', { media: 'video', action: 'complete', percent: 100, video_index: idx, page_slug: pageSlug() }, 'video:' + idx + ':100'); });
          video.addEventListener('timeupdate', function () {
            if (!video.duration || !isFinite(video.duration)) return;
            var pct = Math.floor(video.currentTime / video.duration * 100);
            [25, 50, 75].forEach(function (p) {
              if (pct >= p) emit('web.media_interacted', { media: 'video', action: 'progress', percent: p, video_index: idx, page_slug: pageSlug() }, 'video:' + idx + ':' + p);
            });
          });
        })(videos[v], v);
      }
    }
    // Embedded YouTube / Vimeo: clicks inside an iframe don't reach the page,
    // but the page loses focus to that iframe when the visitor presses play.
    window.addEventListener('blur', function () {
      window.setTimeout(function () {
        var active = document.activeElement;
        if (active && active.tagName === 'IFRAME' && /youtube|youtu\.be|vimeo|wistia|loom/i.test(active.src || '')) {
          var frames = Array.prototype.slice.call(document.querySelectorAll('iframe'));
          var idx = frames.indexOf(active);
          emit('web.media_interacted', { media: 'video', action: 'play', embed: /vimeo/i.test(active.src) ? 'vimeo' : 'youtube', video_index: idx, page_slug: pageSlug() }, 'embed:' + idx + ':play');
        }
      }, 0);
    });

    function scanPage() { watchPrices(); watchVideos(); }
    function onPageChange() {
      if (window.location.pathname === pageKey) return;
      flushEngaged();
      pageKey = window.location.pathname;
      sent = Object.create(null);
      sentCount = 0;
      maxDepth = 0;
      priceTimers.forEach(function (t) { window.clearTimeout(t); });
      priceTimers = [];
      window.setTimeout(scanPage, 600);
    }
    window.addEventListener('popstate', onPageChange);
    ['pushState', 'replaceState'].forEach(function (method) {
      var original = window.history && window.history[method];
      if (typeof original !== 'function') return;
      window.history[method] = function () {
        var result = original.apply(this, arguments);
        window.setTimeout(onPageChange, 0);
        return result;
      };
    });

    if (document.readyState === 'complete') window.setTimeout(scanPage, 600);
    else window.addEventListener('load', function () { window.setTimeout(scanPage, 600); });
    // Content that loads later (sliders, price tables): look again a few times.
    [3000, 8000].forEach(function (ms) { window.setTimeout(scanPage, ms); });
  }

  var api = {
    __eventIntelligenceV1: true,
    version: '1.1.0',
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
  installInterestTracking();

  if (gpcEnabled() && privacyState().sale_sharing !== 'opted_out') {
    consent({ sale_sharing: 'opted_out' }).catch(function () {});
  }

  if (CONSENT_MODE === 'granted' && privacyState().analytics !== 'granted') {
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
