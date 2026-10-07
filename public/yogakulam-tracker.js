(function () {
  'use strict';

  function findScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if ((scripts[i].src || '').indexOf('yogakulam-tracker.js') !== -1) return scripts[i];
    }
    return null;
  }

  var script = findScript();
  if (!script) {
    try { console.warn('[YKTracking] Tracker script element could not be identified.'); } catch (e) {}
    return;
  }

  var endpoint = script.dataset.endpoint || '/api/tracking/collect';
  var consentEndpoint = script.dataset.consentEndpoint || endpoint.replace(/\/collect(?:\?.*)?$/, '/consent');
  if (consentEndpoint === endpoint) consentEndpoint = '/api/tracking/consent';
  var site = script.dataset.site || location.hostname;
  var consentMode = script.dataset.consentMode || 'required';
  var cookieDays = Number(script.dataset.cookieDays || '90');
  var debug = script.dataset.debug === 'true';

  function log() {
    if (!debug || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[YKTracking]');
    console.log.apply(console, args);
  }
  function warn() {
    if (!window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[YKTracking]');
    console.warn.apply(console, args);
  }
  function pushDataLayer(payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }

  var storageOK = true;
  try { localStorage.setItem('__yk_test','1'); localStorage.removeItem('__yk_test'); } catch(e) { storageOK = false; }

  function uid(prefix) {
    var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
    return prefix + '_' + id;
  }
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
  function setCookie(name, value) {
    var maxAge = cookieDays * 86400;
    document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + maxAge + '; samesite=lax';
  }
  function deleteCookie(name) { document.cookie = name + '=; path=/; max-age=0; samesite=lax'; }

  function explicitBoolean(value) {
    return value === true ? true : value === false ? false : null;
  }

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
    return consentState.analytics !== null ||
      consentState.adUserData !== null ||
      consentState.adPersonalization !== null ||
      consentState.marketing !== null;
  }

  function mergeConsentDetail(detail) {
    if (!detail || typeof detail !== 'object') return;

    if (Object.prototype.hasOwnProperty.call(detail, 'analytics')) {
      consentState.analytics = explicitBoolean(detail.analytics);
    }

    if (Object.prototype.hasOwnProperty.call(detail, 'adUserData')) {
      consentState.adUserData = explicitBoolean(detail.adUserData);
    }

    if (Object.prototype.hasOwnProperty.call(detail, 'adPersonalization')) {
      consentState.adPersonalization = explicitBoolean(detail.adPersonalization);
    }

    if (Object.prototype.hasOwnProperty.call(detail, 'marketing')) {
      consentState.marketing = explicitBoolean(detail.marketing);
    }

    if (
      typeof detail.mode === 'string' &&
      detail.mode.trim()
    ) {
      consentState.mode = detail.mode.trim().slice(0, 60);
    }

    if (
      typeof detail.source === 'string' &&
      detail.source.trim()
    ) {
      consentState.source = detail.source.trim().slice(0, 100);
    }
  }

  function observedMetaSignals() {
    if (consentState.adUserData !== true) {
      return {
        fbc: null,
        fbp: null
      };
    }

    return {
      fbc: getCookie('_fbc'),
      fbp: getCookie('_fbp')
    };
  }

  async function postConsentState(includeIdentifiers) {
    if (!hasExplicitConsentState()) {
      return {
        skipped: true,
        reason: 'no_explicit_consent_state'
      };
    }

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

    try {
      log('Sending consent state', body.consent);

      var response = await fetch(consentEndpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      var result = null;

      try {
        result = await response.json();
      } catch(e) {}

      if (!response.ok) {
        var message =
          result && result.error
            ? result.error
            : ('HTTP ' + response.status);

        warn(
          'Consent state failed:',
          response.status,
          message
        );

        pushDataLayer({
          event: 'yk_consent_error',
          status: response.status,
          error: message
        });

        return {
          ok: false,
          status: response.status,
          error: message
        };
      }

      log(
        'Consent state recorded:',
        response.status
      );

      pushDataLayer({
        event: 'yk_consent_sent',
        status: response.status
      });

      return result || {
        ok: true,
        status: response.status
      };

    } catch (error) {
      var message2 =
        error && error.message
          ? error.message
          : String(error);

      warn(
        'Consent network/CORS failure:',
        message2
      );

      pushDataLayer({
        event: 'yk_consent_error',
        status: 0,
        error: message2
      });

      return {
        ok: false,
        status: 0,
        error: message2
      };
    }
  }

  function updateConsent(detail) {
    var wasGranted =
      consentGranted;

    mergeConsentDetail(detail);

    if (!hasExplicitConsentState()) {
      return Promise.resolve({
        skipped: true,
        reason: 'no_explicit_consent_state'
      });
    }

    var analyticsState =
      consentState.analytics;

    /*
     * Analytics grant.
     *
     * Persist internal analytics identifiers only after analytics
     * consent is explicitly TRUE.
     */
    if (analyticsState === true) {
      consentGranted = true;

      setCookie(
        'yk_analytics_consent',
        '1'
      );

      setCookie(
        'yk_vid',
        visitorId
      );

      try {
        sessionStorage.setItem(
          'yk_sid',
          sessionKey
        );
      } catch(e) {}

      if (
        storageOK &&
        meaningful(firstTouch)
      ) {
        try {
          localStorage.setItem(
            'yk_first_touch_v1',
            JSON.stringify(firstTouch)
          );
        } catch(e) {}
      }
    }

    /*
     * Persist the consent decision independently of normal
     * analytics collection.
     *
     * For revocation, previously consented identifiers may be
     * included so the ledger can retain continuity. If analytics
     * was never granted, ephemeral identifiers are not sent.
     */
    var consentRequest =
      postConsentState(
        wasGranted ||
        analyticsState === true
      );

    /*
     * Analytics revocation.
     *
     * Start the consent request before deleting the previous
     * analytics identifiers.
     */
    if (analyticsState === false) {
      consentGranted = false;

      setCookie(
        'yk_analytics_consent',
        '0'
      );

      deleteCookie(
        'yk_vid'
      );

      if (storageOK) {
        try {
          localStorage.removeItem(
            'yk_first_touch_v1'
          );
        } catch(e) {}
      }

      try {
        sessionStorage.removeItem(
          'yk_sid'
        );
      } catch(e) {}
    }

    /*
     * Existing behavior remains:
     * first analytics grant starts normal tracking.
     */
    if (
      analyticsState === true &&
      !wasGranted
    ) {
      document
        .querySelectorAll(
          'form[data-yk-lead-form]'
        )
        .forEach(decorateForm);

      pushReady();

      send(
        'page_view',
        {
          consent_granted_now: true
        }
      );
    }

    return consentRequest;
  }
  function params() { return new URLSearchParams(location.search); }
  function referrerSource() {
    if (!document.referrer) return { source: 'direct', medium: 'none' };
    try {
      var host = new URL(document.referrer).hostname.replace(/^www\./,'');
      if (host === location.hostname.replace(/^www\./,'')) return { source: 'direct', medium: 'internal' };
      if (/google\./i.test(host)) return { source: 'google', medium: 'organic' };
      if (/instagram\.com|facebook\.com|fb\.com/i.test(host)) return { source: 'meta', medium: 'organic_social' };
      if (/youtube\.com|youtu\.be/i.test(host)) return { source: 'youtube', medium: 'organic_video' };
      return { source: host, medium: 'referral' };
    } catch(e) { return { source: 'referral', medium: 'referral' }; }
  }
  function touchFromUrl() {
    var p = params();
    var fallback = referrerSource();
    var hasGoogle = p.get('gclid') || p.get('gbraid') || p.get('wbraid');
    var hasMeta = p.get('fbclid');
    return {
      source: p.get('utm_source') || (hasGoogle ? 'google' : hasMeta ? 'meta' : fallback.source),
      medium: p.get('utm_medium') || (hasGoogle ? 'cpc' : hasMeta ? 'paid_social' : fallback.medium),
      campaign: p.get('utm_campaign'), content: p.get('utm_content'), term: p.get('utm_term'), utmId: p.get('utm_id'),
      gclid: p.get('gclid'), gbraid: p.get('gbraid'), wbraid: p.get('wbraid'), fbclid: p.get('fbclid'),
      campaignId: p.get('campaign_id') || p.get('campaignid'), adsetId: p.get('adset_id'),
      adId: p.get('ad_id'), adgroupId: p.get('adgroup_id') || p.get('adgroupid'), creativeId: p.get('creative')
    };
  }
  function meaningful(t) { return t && ((t.source && t.source !== 'direct') || t.gclid || t.gbraid || t.wbraid || t.fbclid || t.campaign); }

  var analyticsConsentCookie = getCookie('yk_analytics_consent');

  var consentGranted =
    consentMode === 'none' ||
    consentMode === 'granted' ||
    analyticsConsentCookie === '1';

  var consentState = {
    analytics:
      consentGranted
        ? true
        : analyticsConsentCookie === '0'
          ? false
          : null,
    adUserData: null,
    adPersonalization: null,
    marketing: null,
    mode: consentMode,
    source: 'yk_tracker'
  };

  var sessionTouch = touchFromUrl();
  var firstTouch = sessionTouch;

  if (consentGranted && storageOK) {
    try {
      var storedFirst =
        JSON.parse(
          localStorage.getItem(
            'yk_first_touch_v1'
          ) || 'null'
        );

      if (storedFirst) {
        firstTouch = storedFirst;
      } else if (meaningful(sessionTouch)) {
        localStorage.setItem(
          'yk_first_touch_v1',
          JSON.stringify(sessionTouch)
        );
      }
    } catch(e) {}
  }

  var visitorId =
    consentGranted
      ? (
          getCookie('yk_vid') ||
          uid('vis')
        )
      : uid('vis');

  if (consentGranted) {
    setCookie(
      'yk_vid',
      visitorId
    );
  }

  var sessionKey = null;

  if (consentGranted) {
    try {
      sessionKey =
        sessionStorage.getItem(
          'yk_sid'
        );
    } catch(e) {}
  }

  if (!sessionKey) {
    sessionKey =
      uid('ses');
  }

  if (consentGranted) {
    try {
      sessionStorage.setItem(
        'yk_sid',
        sessionKey
      );
    } catch(e) {}
  }

  async function send(eventType, metadata) {
    if (!consentGranted) {
      log('Skipped event because analytics consent is not granted:', eventType);
      pushDataLayer({ event: 'yk_tracking_skipped', yk_event_type: eventType, reason: 'consent_required' });
      return { skipped: true, reason: 'consent_required' };
    }
    var body = {
      eventId: uid('evt'),
      eventType: eventType,
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
      metadata: metadata || {}
    };

    /*
     * Preserve the event-time consent state.
     */
    if (hasExplicitConsentState()) {
      body.consent =
        consentSnapshot();
    }

    /*
     * Read only browser-observed Meta values.
     *
     * Do not create fbc from fbclid.
     * Do not create fbp.
     */
    var metaSignals =
      observedMetaSignals();

    if (metaSignals.fbc) {
      body.fbc =
        metaSignals.fbc;
    }

    if (metaSignals.fbp) {
      body.fbp =
        metaSignals.fbp;
    }
    try {
      if (navigator.sendBeacon && eventType === 'page_exit') {
        navigator.sendBeacon(endpoint, new Blob([JSON.stringify(body)], { type: 'application/json' }));
        return { ok: true, beacon: true };
      }
    } catch(e) {}

    try {
      log('Sending', eventType, body);
      var response = await fetch(endpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      var result = null;
      try { result = await response.json(); } catch(e) {}
      if (!response.ok) {
        var message = result && result.error ? result.error : ('HTTP ' + response.status);
        warn('Event failed:', eventType, response.status, message);
        pushDataLayer({ event: 'yk_tracking_error', yk_event_type: eventType, status: response.status, error: message });
        return { ok: false, status: response.status, error: message };
      }
      log('Event recorded:', eventType, response.status);
      pushDataLayer({ event: 'yk_tracking_sent', yk_event_type: eventType, status: response.status });
      return result || { ok: true, status: response.status };
    } catch (error) {
      var message2 = error && error.message ? error.message : String(error);
      warn('Network/CORS failure:', eventType, message2);
      pushDataLayer({ event: 'yk_tracking_error', yk_event_type: eventType, status: 0, error: message2 });
      return { ok: false, status: 0, error: message2 };
    }
  }

  function decorateForm(form) {
    if (!consentGranted || !form || !form.appendChild) return;
    var fields = {
      yk_visitor_id: visitorId,
      yk_session_id: sessionKey,
      yk_first_touch: JSON.stringify(firstTouch || {}),
      yk_session_touch: JSON.stringify(sessionTouch || {})
    };
    Object.keys(fields).forEach(function (name) {
      var input = form.querySelector('input[name="' + name + '"]');
      if (!input) { input = document.createElement('input'); input.type = 'hidden'; input.name = name; form.appendChild(input); }
      input.value = fields[name];
    });
  }

  function pushReady() {
    if (!consentGranted) return;
    pushDataLayer({ event: 'yk_tracking_ready', yk_visitor_id: visitorId, yk_session_id: sessionKey, yk_source: sessionTouch.source, yk_medium: sessionTouch.medium, yk_campaign: sessionTouch.campaign });
  }

  window.YKTracking = {
    track: send,

    status: function () {
      return {
        loaded: true,
        endpoint: endpoint,
        consentEndpoint: consentEndpoint,
        site: site,
        consentMode: consentMode,
        consentGranted: consentGranted,
        consent: consentSnapshot(),
        debug: debug,
        anonymousVisitorId: visitorId,
        sessionKey: sessionKey,
        firstTouch: firstTouch,
        sessionTouch: sessionTouch
      };
    },

    context: function () {
      return consentGranted
        ? {
            anonymousVisitorId: visitorId,
            sessionKey: sessionKey,
            firstTouch: firstTouch,
            sessionTouch: sessionTouch
          }
        : null;
    },

    decorateForm: decorateForm,

    /*
     * Rich consent API.
     *
     * Example:
     *
     * YKTracking.setConsent({
     *   analytics: true,
     *   adUserData: false,
     *   adPersonalization: false,
     *   marketing: true,
     *   source: 'your_cmp'
     * });
     */
    setConsent: function (detail) {
      return updateConsent(
        detail || {}
      );
    },

    /*
     * Legacy analytics-only API remains compatible.
     */
    grantConsent: function () {
      return updateConsent({
        analytics: true,
        source: 'yk_tracker_api'
      });
    },

    revokeConsent: function () {
      return updateConsent({
        analytics: false,
        source: 'yk_tracker_api'
      });
    }
  };

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

  document.addEventListener('click', function (event) {
    var explicit = event.target && event.target.closest ? event.target.closest('[data-yk-event]') : null;
    var target = explicit || (event.target && event.target.closest ? event.target.closest('a[href]') : null);
    if (!target) return;
    var automatic = explicit ? null : automaticLinkEvent(target);
    if (!explicit && !automatic) return;
    send(explicit ? (target.getAttribute('data-yk-event') || 'cta_click') : automatic.event, {
      label: target.getAttribute('data-yk-label') || (target.textContent || '').trim().slice(0,120),
      destination: target.getAttribute('href') || null,
      contact_channel: target.getAttribute('data-yk-channel') || (automatic && automatic.channel) || null,
      automatic: !explicit
    });
  }, true);

  document.querySelectorAll('form[data-yk-lead-form]').forEach(decorateForm);
  document.addEventListener('focusin', function (event) {
    var form = event.target && event.target.closest ? event.target.closest('form[data-yk-lead-form]') : null;
    if (!form || form.getAttribute('data-yk-started') === '1') return;
    form.setAttribute('data-yk-started', '1');
    decorateForm(form);
    send('form_start', { form_id: form.id || null, form_name: form.getAttribute('name') || null });
  }, true);

  document.addEventListener('submit', function (event) {
    var form = event.target && event.target.matches && event.target.matches('form[data-yk-lead-form]') ? event.target : null;
    if (!form) return;
    decorateForm(form);
    send('lead_form_submit', { form_id: form.id || null, form_name: form.getAttribute('name') || null });
  }, true);

  window.addEventListener('yk:consent', function (event) {
    var detail =
      event && event.detail
        ? event.detail
        : {};

    window.YKTracking.setConsent(
      detail
    );
  });

  log('Loaded', window.YKTracking.status());
  if (consentGranted) { pushReady(); send('page_view', { initial: true }); }
  else {
    pushDataLayer({ event: 'yk_tracking_waiting_for_consent' });
    log('Waiting for analytics consent. For testing use data-consent-mode="granted".');
  }
})();
