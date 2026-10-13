(function () {
  'use strict';

  var SDK_VERSION = '1.1.0-beta.1';
  var SCHEMA_VERSION = '1';
  var MAX_QUEUE = 100;
  var BATCH_SIZE = 10;
  var FLUSH_MS = 1500;
  var MAX_RETRIES = 3;

  function findScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || '';
      if (src.indexOf('/salsys.js') !== -1 || src.indexOf('/yogakulam-tracker.js') !== -1) {
        return scripts[i];
      }
    }
    return null;
  }

  var script = findScript();
  if (!script) return;

  var endpoint = script.dataset.endpoint || '/api/tracking/collect';
  var consentEndpoint = script.dataset.consentEndpoint || endpoint.replace(/\/collect(?:\?.*)?$/, '/consent');
  if (consentEndpoint === endpoint) consentEndpoint = '/api/tracking/consent';

  var publicKey = script.dataset.key || '';
  var site = script.dataset.site || location.hostname;
  var consentMode = script.dataset.consentMode || 'required';
  var cookieDays = Number(script.dataset.cookieDays || '90');
  var debug = script.dataset.debug === 'true';
  var legacyCompat = script.dataset.legacyCompat === 'true';

  var keys = {
    consent: 'salsys_analytics_consent',
    visitor: 'salsys_vid',
    session: 'salsys_sid',
    firstTouch: 'salsys_first_touch_v1',
    queue: 'salsys_event_queue_v1'
  };

  var legacyKeys = {
    consent: 'yk_analytics_consent',
    visitor: 'yk_vid',
    session: 'yk_sid',
    firstTouch: 'yk_first_touch_v1'
  };

  function log() {
    if (!debug || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Salsys]');
    console.log.apply(console, args);
  }

  function warn() {
    if (!window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Salsys]');
    console.warn.apply(console, args);
  }

  function pushDataLayer(payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }

  function pushLifecycle(name, payload, legacyName) {
    var p = payload || {};
    p.event = name;
    pushDataLayer(p);
    if (legacyCompat && legacyName) {
      var copy = {};
      Object.keys(payload || {}).forEach(function (key) { copy[key] = payload[key]; });
      copy.event = legacyName;
      pushDataLayer(copy);
    }
  }

  var storageOK = true;
  try {
    localStorage.setItem('__salsys_test', '1');
    localStorage.removeItem('__salsys_test');
  } catch (e) {
    storageOK = false;
  }

  function uid(prefix) {
    var id = window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    return prefix + '_' + id;
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value) {
    document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + (cookieDays * 86400) + '; samesite=lax';
  }

  function deleteCookie(name) {
    document.cookie = name + '=; path=/; max-age=0; samesite=lax';
  }

  function migrateLegacyState() {
    if (!legacyCompat) return;
    if (!getCookie(keys.consent) && getCookie(legacyKeys.consent)) setCookie(keys.consent, getCookie(legacyKeys.consent));
    if (!getCookie(keys.visitor) && getCookie(legacyKeys.visitor)) setCookie(keys.visitor, getCookie(legacyKeys.visitor));
    try {
      if (!sessionStorage.getItem(keys.session) && sessionStorage.getItem(legacyKeys.session)) {
        sessionStorage.setItem(keys.session, sessionStorage.getItem(legacyKeys.session));
      }
    } catch (e) {}
    if (storageOK) {
      try {
        if (!localStorage.getItem(keys.firstTouch) && localStorage.getItem(legacyKeys.firstTouch)) {
          localStorage.setItem(keys.firstTouch, localStorage.getItem(legacyKeys.firstTouch));
        }
      } catch (e) {}
    }
  }

  migrateLegacyState();

  function explicitBoolean(value) {
    return value === true ? true : value === false ? false : null;
  }

  var analyticsConsentCookie = getCookie(keys.consent);
  var consentGranted = consentMode === 'none' || consentMode === 'granted' || analyticsConsentCookie === '1';
  var consentState = {
    analytics: consentGranted ? true : analyticsConsentCookie === '0' ? false : null,
    adUserData: null,
    adPersonalization: null,
    marketing: null,
    mode: consentMode,
    source: 'salsys_browser_sdk'
  };

  function consentSnapshot() {
    return {
      analytics: consentState.analytics,
      adUserData: consentState.adUserData,
      adPersonalization: consentState.adPersonalization,
      marketing: consentState.marketing,
      mode: consentState.mode,
      source: consentState.source
    };
  }

  function hasExplicitConsentState() {
    return consentState.analytics !== null || consentState.adUserData !== null || consentState.adPersonalization !== null || consentState.marketing !== null;
  }

  function mergeConsentDetail(detail) {
    if (!detail || typeof detail !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(detail, 'analytics')) consentState.analytics = explicitBoolean(detail.analytics);
    if (Object.prototype.hasOwnProperty.call(detail, 'adUserData')) consentState.adUserData = explicitBoolean(detail.adUserData);
    if (Object.prototype.hasOwnProperty.call(detail, 'adPersonalization')) consentState.adPersonalization = explicitBoolean(detail.adPersonalization);
    if (Object.prototype.hasOwnProperty.call(detail, 'marketing')) consentState.marketing = explicitBoolean(detail.marketing);
    if (typeof detail.mode === 'string' && detail.mode.trim()) consentState.mode = detail.mode.trim().slice(0, 60);
    if (typeof detail.source === 'string' && detail.source.trim()) consentState.source = detail.source.trim().slice(0, 100);
  }

  function params() { return new URLSearchParams(location.search); }

  function referrerSource() {
    if (!document.referrer) return { source: 'direct', medium: 'none' };
    try {
      var host = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (host === location.hostname.replace(/^www\./, '')) return { source: 'direct', medium: 'internal' };
      if (/google\./i.test(host)) return { source: 'google', medium: 'organic' };
      if (/instagram\.com|facebook\.com|fb\.com/i.test(host)) return { source: 'meta', medium: 'organic_social' };
      if (/youtube\.com|youtu\.be/i.test(host)) return { source: 'youtube', medium: 'organic_video' };
      return { source: host, medium: 'referral' };
    } catch (e) {
      return { source: 'referral', medium: 'referral' };
    }
  }

  function touchFromUrl() {
    var p = params();
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
      adsetId: p.get('adset_id'),
      adId: p.get('ad_id'),
      adgroupId: p.get('adgroup_id') || p.get('adgroupid'),
      creativeId: p.get('creative')
    };
  }

  function meaningful(touch) {
    return touch && ((touch.source && touch.source !== 'direct') || touch.gclid || touch.gbraid || touch.wbraid || touch.fbclid || touch.campaign);
  }

  var sessionTouch = touchFromUrl();
  var firstTouch = sessionTouch;

  if (consentGranted && storageOK) {
    try {
      var storedFirst = JSON.parse(localStorage.getItem(keys.firstTouch) || 'null');
      if (storedFirst) firstTouch = storedFirst;
      else if (meaningful(sessionTouch)) localStorage.setItem(keys.firstTouch, JSON.stringify(sessionTouch));
    } catch (e) {}
  }

  var visitorId = consentGranted ? getCookie(keys.visitor) || uid('vis') : uid('vis');
  if (consentGranted) setCookie(keys.visitor, visitorId);

  var sessionKey = null;
  if (consentGranted) {
    try { sessionKey = sessionStorage.getItem(keys.session); } catch (e) {}
  }
  if (!sessionKey) sessionKey = uid('ses');
  if (consentGranted) {
    try { sessionStorage.setItem(keys.session, sessionKey); } catch (e) {}
  }

  function persistFirstTouch() {
    if (!storageOK || !consentGranted || !meaningful(firstTouch)) return;
    try { localStorage.setItem(keys.firstTouch, JSON.stringify(firstTouch)); } catch (e) {}
  }

  function observedMetaSignals() {
    if (consentState.adUserData !== true) return { fbc: null, fbp: null };
    return { fbc: getCookie('_fbc'), fbp: getCookie('_fbp') };
  }

  var queue = [];
  var flushing = false;
  var flushTimer = null;

  function loadQueue() {
    if (!storageOK || !consentGranted) return;
    try {
      var stored = JSON.parse(localStorage.getItem(keys.queue) || '[]');
      if (Array.isArray(stored)) queue = stored.slice(-MAX_QUEUE);
    } catch (e) { queue = []; }
  }

  function persistQueue() {
    if (!storageOK) return;
    try {
      if (!consentGranted || queue.length === 0) localStorage.removeItem(keys.queue);
      else localStorage.setItem(keys.queue, JSON.stringify(queue.slice(-MAX_QUEUE)));
    } catch (e) {}
  }

  function clearQueue() {
    queue = [];
    persistQueue();
  }

  loadQueue();

  function headers() {
    var h = {
      'Content-Type': 'application/json',
      'X-Salsys-SDK-Version': SDK_VERSION,
      'X-Salsys-Schema-Version': SCHEMA_VERSION
    };
    if (publicKey) h['X-Salsys-Key'] = publicKey;
    return h;
  }

  function shouldRetry(status) {
    return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
  }

  function delay(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  async function postJson(url, body, retryCount) {
    var attempt = retryCount || 0;
    try {
      var response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        keepalive: true,
        headers: headers(),
        body: JSON.stringify(body)
      });

      var result = null;
      try { result = await response.json(); } catch (e) {}

      if (!response.ok && shouldRetry(response.status) && attempt < MAX_RETRIES) {
        await delay(Math.pow(2, attempt) * 500 + Math.floor(Math.random() * 250));
        return postJson(url, body, attempt + 1);
      }

      return {
        ok: response.ok,
        status: response.status,
        result: result,
        retryable: shouldRetry(response.status)
      };
    } catch (error) {
      if (attempt < MAX_RETRIES && navigator.onLine !== false) {
        await delay(Math.pow(2, attempt) * 500 + Math.floor(Math.random() * 250));
        return postJson(url, body, attempt + 1);
      }
      return { ok: false, status: 0, result: null, retryable: true, error: error };
    }
  }

  function scheduleFlush() {
    if (flushTimer || flushing || !consentGranted) return;
    flushTimer = window.setTimeout(function () {
      flushTimer = null;
      flushQueue();
    }, FLUSH_MS);
  }

  async function flushQueue() {
    if (flushing || !consentGranted || queue.length === 0 || navigator.onLine === false) {
      return { ok: false, deferred: true, queued: queue.length };
    }

    flushing = true;
    var batch = queue.slice(0, BATCH_SIZE);
    var response = await postJson(endpoint, batch.length === 1 ? batch[0] : { events: batch }, 0);

    if (response.ok) {
      queue.splice(0, batch.length);
      persistQueue();
      pushLifecycle('salsys_tracking_sent', { count: batch.length, status: response.status }, 'yk_tracking_sent');
    } else if (response.status === 207 && response.result && Array.isArray(response.result.results)) {
      var acceptedIds = {};
      response.result.results.forEach(function (item) {
        if (item && item.ok && item.eventId) acceptedIds[item.eventId] = true;
      });
      queue = queue.filter(function (item) { return !acceptedIds[item.eventId]; });
      persistQueue();
    } else if (!response.retryable) {
      queue.splice(0, batch.length);
      persistQueue();
      warn('Dropping non-retryable tracking batch', response.status, response.result);
    }

    flushing = false;
    if (queue.length) scheduleFlush();

    return {
      ok: response.ok,
      status: response.status,
      queued: queue.length
    };
  }

  function makeEvent(eventType, metadata) {
    var body = {
      eventId: uid('evt'),
      eventType: String(eventType || 'custom_event').slice(0, 80),
      occurredAt: new Date().toISOString(),
      anonymousVisitorId: visitorId,
      sessionKey: sessionKey,
      site: site,
      pageUrl: location.href,
      pagePath: location.pathname + location.search,
      pageTitle: document.title,
      referrer: document.referrer || null,
      firstTouch: firstTouch,
      sessionTouch: sessionTouch,
      metadata: metadata && typeof metadata === 'object' ? metadata : {}
    };

    if (hasExplicitConsentState()) body.consent = consentSnapshot();
    var metaSignals = observedMetaSignals();
    if (metaSignals.fbc) body.fbc = metaSignals.fbc;
    if (metaSignals.fbp) body.fbp = metaSignals.fbp;
    return body;
  }

  function enqueue(body) {
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push(body);
    persistQueue();
    if (queue.length >= BATCH_SIZE) flushQueue();
    else scheduleFlush();
  }

  function send(eventType, metadata) {
    if (!consentGranted) {
      pushLifecycle('salsys_tracking_skipped', { salsys_event_type: eventType, reason: 'consent_required' }, 'yk_tracking_skipped');
      return Promise.resolve({ skipped: true, reason: 'consent_required' });
    }

    var body = makeEvent(eventType, metadata);
    enqueue(body);
    log('Queued', eventType, body.eventId, 'queue=', queue.length);
    return Promise.resolve({ ok: true, queued: true, eventId: body.eventId, queueSize: queue.length });
  }

  async function postConsentState(includeIdentifiers) {
    if (!hasExplicitConsentState()) return { skipped: true, reason: 'no_explicit_consent_state' };
    var body = {
      eventId: uid('cons'),
      occurredAt: new Date().toISOString(),
      site: site,
      consent: consentSnapshot()
    };
    if (includeIdentifiers) {
      body.anonymousVisitorId = visitorId;
      body.sessionKey = sessionKey;
    }
    var response = await postJson(consentEndpoint, body, 0);
    if (!response.ok) warn('Consent state failed', response.status);
    return response.result || { ok: response.ok, status: response.status };
  }

  function leadFormSelector() {
    return legacyCompat ? 'form[data-salsys-lead-form], form[data-yk-lead-form]' : 'form[data-salsys-lead-form]';
  }

  function decorateForm(form) {
    if (!consentGranted || !form || !form.appendChild) return;
    var fields = {
      salsys_visitor_id: visitorId,
      salsys_session_id: sessionKey,
      salsys_first_touch: JSON.stringify(firstTouch || {}),
      salsys_session_touch: JSON.stringify(sessionTouch || {})
    };
    if (legacyCompat) {
      fields.yk_visitor_id = visitorId;
      fields.yk_session_id = sessionKey;
      fields.yk_first_touch = JSON.stringify(firstTouch || {});
      fields.yk_session_touch = JSON.stringify(sessionTouch || {});
    }
    Object.keys(fields).forEach(function (name) {
      var input = form.querySelector('input[name="' + name + '"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        form.appendChild(input);
      }
      input.value = fields[name];
    });
  }

  function decorateAllForms() {
    document.querySelectorAll(leadFormSelector()).forEach(decorateForm);
  }

  function pushReady() {
    if (!consentGranted) return;
    pushLifecycle('salsys_tracking_ready', {
      salsys_visitor_id: visitorId,
      salsys_session_id: sessionKey,
      salsys_source: sessionTouch.source,
      salsys_medium: sessionTouch.medium,
      salsys_campaign: sessionTouch.campaign
    }, 'yk_tracking_ready');
  }

  function updateConsent(detail) {
    var wasGranted = consentGranted;
    mergeConsentDetail(detail);
    if (!hasExplicitConsentState()) return Promise.resolve({ skipped: true, reason: 'no_explicit_consent_state' });

    var analyticsState = consentState.analytics;
    if (analyticsState === true) {
      consentGranted = true;
      setCookie(keys.consent, '1');
      setCookie(keys.visitor, visitorId);
      try { sessionStorage.setItem(keys.session, sessionKey); } catch (e) {}
      persistFirstTouch();
      loadQueue();
    }

    var consentRequest = postConsentState(wasGranted || analyticsState === true);

    if (analyticsState === false) {
      consentGranted = false;
      setCookie(keys.consent, '0');
      deleteCookie(keys.visitor);
      clearQueue();
      if (storageOK) {
        try { localStorage.removeItem(keys.firstTouch); } catch (e) {}
      }
      try { sessionStorage.removeItem(keys.session); } catch (e) {}
    }

    if (analyticsState === true && !wasGranted) {
      decorateAllForms();
      pushReady();
      send('page_view', { consent_granted_now: true });
    }

    return consentRequest;
  }

  function automaticLinkEvent(target) {
    if (!target || !target.getAttribute) return null;
    var href = target.getAttribute('href') || '';
    if (!href) return null;
    var lower = href.toLowerCase();
    if (/wa\.me|api\.whatsapp\.com|whatsapp\.com/.test(lower)) return { event: 'whatsapp_click', channel: 'whatsapp' };
    if (/instagram\.com/.test(lower)) return { event: 'instagram_click', channel: 'instagram' };
    if (lower.indexOf('mailto:') === 0) return { event: 'email_click', channel: 'email' };
    if (lower.indexOf('tel:') === 0) return { event: 'phone_click', channel: 'phone' };
    if (/enrol|enroll|reservation|reserve|book-now|booking/.test(lower)) return { event: 'enrollment_cta_click', channel: 'website' };
    return null;
  }

  function dataValue(target, genericName, legacyName) {
    var genericValue = target.getAttribute(genericName);
    if (genericValue !== null) return genericValue;
    return legacyCompat ? target.getAttribute(legacyName) : null;
  }

  function reset(options) {
    var clearConsent = Boolean(options && options.clearConsent === true);
    deleteCookie(keys.visitor);
    clearQueue();
    if (storageOK) {
      try { localStorage.removeItem(keys.firstTouch); } catch (e) {}
    }
    try { sessionStorage.removeItem(keys.session); } catch (e) {}
    if (legacyCompat) {
      deleteCookie(legacyKeys.visitor);
      if (storageOK) {
        try { localStorage.removeItem(legacyKeys.firstTouch); } catch (e) {}
      }
      try { sessionStorage.removeItem(legacyKeys.session); } catch (e) {}
    }
    if (clearConsent) {
      deleteCookie(keys.consent);
      if (legacyCompat) deleteCookie(legacyKeys.consent);
      consentGranted = false;
      consentState.analytics = null;
    }
    visitorId = uid('vis');
    sessionKey = uid('ses');
    firstTouch = sessionTouch;
    if (consentGranted) {
      setCookie(keys.visitor, visitorId);
      try { sessionStorage.setItem(keys.session, sessionKey); } catch (e) {}
      persistFirstTouch();
      decorateAllForms();
    }
    return api.context();
  }

  var api = {
    version: SDK_VERSION,
    schemaVersion: Number(SCHEMA_VERSION),
    track: send,
    page: function (metadata) { return send('page_view', metadata || {}); },
    flush: flushQueue,
    consent: function (detail) { return updateConsent(detail || {}); },
    setConsent: function (detail) { return updateConsent(detail || {}); },
    grantConsent: function () { return updateConsent({ analytics: true, source: 'salsys_browser_sdk_api' }); },
    revokeConsent: function () { return updateConsent({ analytics: false, source: 'salsys_browser_sdk_api' }); },
    reset: reset,
    status: function () {
      return {
        loaded: true,
        version: SDK_VERSION,
        schemaVersion: Number(SCHEMA_VERSION),
        endpoint: endpoint,
        consentEndpoint: consentEndpoint,
        site: site,
        publicKeyConfigured: Boolean(publicKey),
        consentMode: consentMode,
        consentGranted: consentGranted,
        consent: consentSnapshot(),
        online: navigator.onLine !== false,
        queueSize: queue.length,
        flushing: flushing,
        debug: debug,
        legacyCompat: legacyCompat,
        anonymousVisitorId: visitorId,
        sessionKey: sessionKey,
        firstTouch: firstTouch,
        sessionTouch: sessionTouch,
        browserIdentifySupported: false,
        identifyMode: 'server_only'
      };
    },
    context: function () {
      return consentGranted ? {
        anonymousVisitorId: visitorId,
        sessionKey: sessionKey,
        firstTouch: firstTouch,
        sessionTouch: sessionTouch
      } : null;
    },
    decorateForm: decorateForm
  };

  window.Salsys = api;
  if (legacyCompat && !window.YKTracking) window.YKTracking = api;

  document.addEventListener('click', function (event) {
    var explicitSelector = legacyCompat ? '[data-salsys-event], [data-yk-event]' : '[data-salsys-event]';
    var explicit = event.target && event.target.closest ? event.target.closest(explicitSelector) : null;
    var target = explicit || (event.target && event.target.closest ? event.target.closest('a[href]') : null);
    if (!target) return;
    var automatic = explicit ? null : automaticLinkEvent(target);
    if (!explicit && !automatic) return;
    send(explicit ? dataValue(target, 'data-salsys-event', 'data-yk-event') || 'cta_click' : automatic.event, {
      label: dataValue(target, 'data-salsys-label', 'data-yk-label') || (target.textContent || '').trim().slice(0, 120),
      destination: target.getAttribute('href') || null,
      contact_channel: dataValue(target, 'data-salsys-channel', 'data-yk-channel') || (automatic && automatic.channel) || null,
      automatic: !explicit
    });
  }, true);

  decorateAllForms();

  document.addEventListener('focusin', function (event) {
    var form = event.target && event.target.closest ? event.target.closest(leadFormSelector()) : null;
    if (!form || form.getAttribute('data-salsys-started') === '1') return;
    form.setAttribute('data-salsys-started', '1');
    decorateForm(form);
    send('form_start', { form_id: form.id || null, form_name: form.getAttribute('name') || null });
  }, true);

  document.addEventListener('submit', function (event) {
    var form = event.target && event.target.matches && event.target.matches(leadFormSelector()) ? event.target : null;
    if (!form) return;
    decorateForm(form);
    send('lead_form_submit', { form_id: form.id || null, form_name: form.getAttribute('name') || null });
    flushQueue();
  }, true);

  window.addEventListener('online', function () {
    pushLifecycle('salsys_tracking_online', { queued: queue.length });
    flushQueue();
  });

  window.addEventListener('offline', function () {
    pushLifecycle('salsys_tracking_offline', { queued: queue.length });
    persistQueue();
  });

  window.addEventListener('pagehide', function () {
    if (!consentGranted || queue.length === 0) return;
    persistQueue();
    if (!navigator.sendBeacon) return;
    try {
      var batch = queue.slice(0, BATCH_SIZE);
      var body = batch.length === 1 ? batch[0] : { events: batch };
      navigator.sendBeacon(endpoint, new Blob([JSON.stringify(body)], { type: 'application/json' }));
    } catch (e) {}
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushQueue();
  });

  window.addEventListener('salsys:consent', function (event) {
    window.Salsys.setConsent(event && event.detail ? event.detail : {});
  });

  if (legacyCompat) {
    window.addEventListener('yk:consent', function (event) {
      window.Salsys.setConsent(event && event.detail ? event.detail : {});
    });
  }

  log('Loaded', window.Salsys.status());

  if (consentGranted) {
    pushReady();
    send('page_view', { initial: true });
    flushQueue();
  } else {
    pushLifecycle('salsys_tracking_waiting_for_consent', {}, 'yk_tracking_waiting_for_consent');
  }
})();
