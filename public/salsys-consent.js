/* Salsys Universal Consent UI v1.0.0 */
(function () {
  'use strict';

  if (window.SalsysConsent && window.SalsysConsent.__universalConsentUiV1) return;

  function findScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if ((scripts[i].src || '').indexOf('salsys-consent.js') !== -1) return scripts[i];
    }
    return null;
  }

  var script = findScript();
  if (!script) return;

  var dataset = script.dataset || {};
  var MODE = String(dataset.consentBanner || 'auto').toLowerCase();
  var SETTINGS_MODE = String(dataset.consentSettings || 'floating').toLowerCase();
  var BRAND_NAME = String(dataset.consentBrand || dataset.brandName || window.location.hostname || 'This website').slice(0, 120);
  var TITLE = String(dataset.consentTitle || 'Your privacy choices').slice(0, 180);
  var DESCRIPTION = String(
    dataset.consentDescription ||
      'We use optional analytics and marketing technologies to understand usage and improve our services. You can accept, reject, or customize your choices. Essential functions remain available.'
  ).slice(0, 1000);
  var PRIVACY_URL = safeUrl(dataset.privacyPolicyUrl || dataset.privacyUrl || '');
  var COOKIE_URL = safeUrl(dataset.cookiePolicyUrl || '');
  var ACCENT = safeColor(dataset.consentAccent || '#0f172a');
  var STORAGE_KEY = 'salsys_privacy_v1';
  var HOST_ID = 'salsys-consent-ui';
  var FIRST_RUN_DECISIONS = ['granted', 'denied', 'withdrawn', 'opted_out', 'limited'];
  var host = null;
  var shadow = null;
  var banner = null;
  var overlay = null;
  var launcher = null;
  var errorBox = null;
  var busy = false;
  var readyPromise = null;

  function safeUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) return null;
    try {
      var url = new URL(raw, window.location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.toString();
    } catch (_) {
      return null;
    }
  }

  function safeColor(value) {
    var raw = String(value || '').trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : '#0f172a';
  }

  function readState() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function gpcEnabled() {
    return navigator.globalPrivacyControl === true;
  }

  function hasPriorChoice() {
    return FIRST_RUN_DECISIONS.indexOf(String(readState().analytics || '').toLowerCase()) >= 0;
  }

  function waitForSdk() {
    if (window.SalsysIntelligence && typeof window.SalsysIntelligence.consent === 'function') {
      return Promise.resolve(window.SalsysIntelligence);
    }
    if (readyPromise) return readyPromise;

    readyPromise = new Promise(function (resolve, reject) {
      var started = Date.now();
      var timer = window.setInterval(function () {
        if (window.SalsysIntelligence && typeof window.SalsysIntelligence.consent === 'function') {
          window.clearInterval(timer);
          resolve(window.SalsysIntelligence);
          return;
        }
        if (Date.now() - started > 12000) {
          window.clearInterval(timer);
          reject(new Error('Salsys Tracking Intelligence SDK did not become ready.'));
        }
      }, 50);
    });

    return readyPromise;
  }

  function currentSdkConfig() {
    try {
      if (window.SalsysIntelligence && typeof window.SalsysIntelligence.config === 'function') {
        return window.SalsysIntelligence.config() || {};
      }
    } catch (_) {}
    return {};
  }

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function button(label, className, action) {
    var node = make('button', className, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function ensureUi() {
    if (shadow) return shadow;

    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.style.position = 'relative';
      host.style.zIndex = '2147483000';
      (document.body || document.documentElement).appendChild(host);
    }

    shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';

    var style = document.createElement('style');
    style.textContent = [
      ':host{all:initial}',
      '*{box-sizing:border-box}',
      'button,input,a{font:inherit}',
      '.salsys-root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;line-height:1.45}',
      '.banner{position:fixed;left:18px;right:18px;bottom:18px;max-width:1120px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 22px 60px rgba(15,23,42,.22);padding:20px;display:grid;gap:16px;z-index:2147483001}',
      '.banner-copy{min-width:0}',
      '.eyebrow{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b}',
      '.title{font-size:18px;font-weight:750;margin-top:3px;color:#0f172a}',
      '.description{font-size:13px;color:#475569;margin-top:7px;max-width:760px}',
      '.links{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}',
      '.links a{font-size:12px;color:#334155;text-decoration:underline;text-underline-offset:3px}',
      '.actions{display:flex;flex-wrap:wrap;gap:9px;align-items:center}',
      '.btn{border:1px solid #cbd5e1;border-radius:11px;padding:10px 14px;background:#fff;color:#0f172a;font-weight:650;font-size:13px;cursor:pointer;min-height:42px}',
      '.btn:hover{background:#f8fafc}',
      '.btn:focus-visible,.launcher:focus-visible,.close:focus-visible,input:focus-visible{outline:3px solid rgba(59,130,246,.35);outline-offset:2px}',
      '.btn-primary{background:var(--salsys-accent);border-color:var(--salsys-accent);color:#fff}',
      '.btn-primary:hover{filter:brightness(.94);background:var(--salsys-accent)}',
      '.btn-quiet{background:#f8fafc}',
      '.overlay{position:fixed;inset:0;background:rgba(15,23,42,.48);display:grid;place-items:center;padding:18px;z-index:2147483002}',
      '.panel{width:min(720px,100%);max-height:min(86vh,760px);overflow:auto;background:#fff;border-radius:20px;box-shadow:0 28px 80px rgba(15,23,42,.32);border:1px solid rgba(226,232,240,.9)}',
      '.panel-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:22px 22px 16px;border-bottom:1px solid #e2e8f0}',
      '.close{display:grid;place-items:center;width:38px;height:38px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#475569;cursor:pointer;font-size:20px;line-height:1}',
      '.panel-body{padding:18px 22px}',
      '.purpose{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;padding:15px 0;border-bottom:1px solid #edf2f7}',
      '.purpose:last-child{border-bottom:0}',
      '.purpose-title{font-size:14px;font-weight:700;color:#0f172a}',
      '.purpose-desc{font-size:12px;color:#64748b;margin-top:4px;max-width:560px}',
      '.toggle{appearance:none;width:46px;height:26px;border-radius:999px;background:#cbd5e1;position:relative;cursor:pointer;transition:.2s;border:0}',
      '.toggle:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.25);transition:.2s}',
      '.toggle:checked{background:var(--salsys-accent)}',
      '.toggle:checked:before{transform:translateX(20px)}',
      '.toggle:disabled{opacity:.55;cursor:not-allowed}',
      '.essential{font-size:11px;font-weight:700;color:#166534;background:#dcfce7;border-radius:999px;padding:5px 8px}',
      '.gpc{margin:14px 0 0;padding:11px 12px;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:12px}',
      '.error{margin:0 22px 4px;padding:10px 12px;border-radius:10px;background:#fef2f2;color:#991b1b;font-size:12px}',
      '.panel-actions{display:flex;flex-wrap:wrap;gap:9px;justify-content:flex-end;padding:16px 22px 22px;border-top:1px solid #e2e8f0}',
      '.launcher{position:fixed;left:16px;bottom:16px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;color:#334155;box-shadow:0 10px 30px rgba(15,23,42,.14);padding:9px 12px;font-size:12px;font-weight:650;cursor:pointer;z-index:2147483000}',
      '.hidden{display:none!important}',
      '.busy{opacity:.7;pointer-events:none}',
      '@media(min-width:820px){.banner{grid-template-columns:minmax(0,1fr) auto;align-items:center}.actions{justify-content:flex-end}}',
      '@media(max-width:520px){.banner{left:10px;right:10px;bottom:10px;padding:16px;border-radius:15px}.actions{display:grid;grid-template-columns:1fr}.btn{width:100%}.panel-head,.panel-body,.panel-actions{padding-left:16px;padding-right:16px}.panel-actions{display:grid;grid-template-columns:1fr}.launcher{left:10px;bottom:10px}}',
      '@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}'
    ].join('');
    shadow.appendChild(style);

    var root = make('div', 'salsys-root');
    root.style.setProperty('--salsys-accent', ACCENT);
    shadow.appendChild(root);

    banner = buildBanner(root);
    overlay = buildPreferences(root);
    launcher = buildLauncher(root);

    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest
        ? event.target.closest('[data-salsys-privacy-settings]')
        : null;
      if (!target) return;
      event.preventDefault();
      openPreferences();
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !overlay || overlay.classList.contains('hidden')) return;
      if (hasPriorChoice()) closePreferences();
      else showBanner();
    });

    return shadow;
  }

  function buildPolicyLinks(container) {
    if (!PRIVACY_URL && !COOKIE_URL) return;
    var links = make('div', 'links');
    if (PRIVACY_URL) {
      var privacy = make('a', '', 'Privacy policy');
      privacy.href = PRIVACY_URL;
      privacy.target = '_blank';
      privacy.rel = 'noopener noreferrer';
      links.appendChild(privacy);
    }
    if (COOKIE_URL) {
      var cookies = make('a', '', 'Cookie policy');
      cookies.href = COOKIE_URL;
      cookies.target = '_blank';
      cookies.rel = 'noopener noreferrer';
      links.appendChild(cookies);
    }
    container.appendChild(links);
  }

  function buildBanner(root) {
    var node = make('section', 'banner hidden');
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'false');
    node.setAttribute('aria-label', 'Privacy choices');

    var copy = make('div', 'banner-copy');
    copy.appendChild(make('div', 'eyebrow', BRAND_NAME));
    copy.appendChild(make('div', 'title', TITLE));
    copy.appendChild(make('div', 'description', DESCRIPTION));
    buildPolicyLinks(copy);

    var actions = make('div', 'actions');
    actions.appendChild(button('Reject all', 'btn btn-quiet', rejectAll));
    actions.appendChild(button('Customize', 'btn', openPreferences));
    actions.appendChild(button('Accept all', 'btn btn-primary', acceptAll));

    node.appendChild(copy);
    node.appendChild(actions);
    root.appendChild(node);
    return node;
  }

  function purposeRow(name, description, key, required) {
    var row = make('div', 'purpose');
    var copy = make('div');
    copy.appendChild(make('div', 'purpose-title', name));
    copy.appendChild(make('div', 'purpose-desc', description));
    row.appendChild(copy);

    if (required) {
      row.appendChild(make('span', 'essential', 'Always on'));
      return row;
    }

    var input = make('input', 'toggle');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.setAttribute('data-purpose', key);
    input.setAttribute('aria-label', name);
    if (key === 'sale_sharing' && gpcEnabled()) input.disabled = true;
    row.appendChild(input);
    return row;
  }

  function buildPreferences(root) {
    var backdrop = make('div', 'overlay hidden');
    backdrop.setAttribute('role', 'presentation');

    var panel = make('section', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Privacy settings');

    var head = make('div', 'panel-head');
    var headCopy = make('div');
    headCopy.appendChild(make('div', 'eyebrow', BRAND_NAME));
    headCopy.appendChild(make('div', 'title', 'Privacy settings'));
    headCopy.appendChild(make('div', 'description', 'Choose which optional purposes you allow. You can change these settings at any time.'));
    var close = button('×', 'close', function () {
      if (hasPriorChoice()) closePreferences();
      else showBanner();
    });
    close.setAttribute('aria-label', 'Close privacy settings');
    head.appendChild(headCopy);
    head.appendChild(close);

    var body = make('div', 'panel-body');
    body.appendChild(purposeRow('Essential', 'Required for security, core site functions, and remembering your privacy choices.', 'essential', true));
    body.appendChild(purposeRow('Analytics', 'Helps measure visits, pages, journeys, and performance so the service can be improved.', 'analytics', false));
    body.appendChild(purposeRow('Marketing', 'Allows marketing-related measurement and audience activity where configured.', 'marketing', false));
    body.appendChild(purposeRow('Advertising', 'Allows advertising identifiers and ad measurement where configured.', 'advertising', false));
    body.appendChild(purposeRow('Personalization', 'Allows optional personalization based on your permitted activity.', 'personalization', false));
    body.appendChild(purposeRow('Sale / sharing', 'Controls optional sale or sharing of data for applicable privacy regimes.', 'sale_sharing', false));
    if (gpcEnabled()) {
      body.appendChild(make('div', 'gpc', 'Global Privacy Control is enabled in this browser. Sale / sharing remains opted out.'));
    }
    buildPolicyLinks(body);

    errorBox = make('div', 'error hidden');

    var actions = make('div', 'panel-actions');
    actions.appendChild(button('Reject all', 'btn btn-quiet', rejectAll));
    actions.appendChild(button('Save choices', 'btn', saveCustom));
    actions.appendChild(button('Accept all', 'btn btn-primary', acceptAll));

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(errorBox);
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    root.appendChild(backdrop);

    backdrop.addEventListener('click', function (event) {
      if (event.target !== backdrop) return;
      if (hasPriorChoice()) closePreferences();
    });

    return backdrop;
  }

  function buildLauncher(root) {
    var node = button('Privacy settings', 'launcher hidden', openPreferences);
    node.setAttribute('aria-label', 'Open privacy settings');
    root.appendChild(node);
    return node;
  }

  function setBusy(value) {
    busy = Boolean(value);
    if (!shadow) return;
    var root = shadow.querySelector('.salsys-root');
    if (root) root.classList.toggle('busy', busy);
  }

  function setError(message) {
    ensureUi();
    if (!errorBox) return;
    if (!message) {
      errorBox.textContent = '';
      errorBox.classList.add('hidden');
      return;
    }
    errorBox.textContent = String(message).slice(0, 500);
    errorBox.classList.remove('hidden');
  }

  function updateLauncher() {
    ensureUi();
    if (!launcher) return;
    var show = SETTINGS_MODE === 'floating' && hasPriorChoice();
    launcher.classList.toggle('hidden', !show);
  }

  function hideBanner() {
    ensureUi();
    if (banner) banner.classList.add('hidden');
    updateLauncher();
  }

  function showBanner() {
    if (MODE === 'off' || MODE === 'false' || MODE === 'none') return;
    ensureUi();
    setError(null);
    if (overlay) overlay.classList.add('hidden');
    if (banner) banner.classList.remove('hidden');
    if (launcher) launcher.classList.add('hidden');
  }

  function currentToggleValue(key) {
    if (!overlay) return false;
    var input = overlay.querySelector('input[data-purpose="' + key + '"]');
    return Boolean(input && input.checked);
  }

  function syncToggles() {
    ensureUi();
    var state = readState();
    ['analytics', 'marketing', 'advertising', 'personalization', 'sale_sharing'].forEach(function (key) {
      var input = overlay && overlay.querySelector('input[data-purpose="' + key + '"]');
      if (!input) return;
      if (key === 'sale_sharing' && gpcEnabled()) {
        input.checked = false;
        input.disabled = true;
        return;
      }
      input.checked = state[key] === 'granted';
    });
  }

  function openPreferences() {
    if (MODE === 'off' || MODE === 'false' || MODE === 'none') return;
    ensureUi();
    setError(null);
    syncToggles();
    if (banner) banner.classList.add('hidden');
    if (launcher) launcher.classList.add('hidden');
    if (overlay) overlay.classList.remove('hidden');
    window.setTimeout(function () {
      var focusable = overlay && overlay.querySelector('input:not(:disabled),button');
      if (focusable && focusable.focus) focusable.focus();
    }, 0);
  }

  function closePreferences() {
    ensureUi();
    setError(null);
    if (overlay) overlay.classList.add('hidden');
    if (!hasPriorChoice()) showBanner();
    else updateLauncher();
  }

  function acceptAllDecisions() {
    return {
      analytics: 'granted',
      marketing: 'granted',
      advertising: 'granted',
      personalization: 'granted',
      sale_sharing: gpcEnabled() ? 'opted_out' : 'granted'
    };
  }

  function rejectAllDecisions() {
    return {
      analytics: 'denied',
      marketing: 'denied',
      advertising: 'denied',
      personalization: 'denied',
      sale_sharing: 'opted_out'
    };
  }

  function customDecisions() {
    return {
      analytics: currentToggleValue('analytics') ? 'granted' : 'denied',
      marketing: currentToggleValue('marketing') ? 'granted' : 'denied',
      advertising: currentToggleValue('advertising') ? 'granted' : 'denied',
      personalization: currentToggleValue('personalization') ? 'granted' : 'denied',
      sale_sharing: gpcEnabled()
        ? 'opted_out'
        : currentToggleValue('sale_sharing')
          ? 'granted'
          : 'opted_out'
    };
  }

  function emitChange(source, decisions, result) {
    try {
      window.dispatchEvent(new CustomEvent('salsys:consent-changed', {
        detail: {
          source: source,
          decisions: decisions,
          effective_decisions: result && result.effective_decisions ? result.effective_decisions : decisions,
          gpc: gpcEnabled(),
          notice_version: result && result.notice_version ? result.notice_version : null
        }
      }));
    } catch (_) {}
  }

  function save(decisions, source) {
    if (busy) return Promise.resolve({ ok: false, busy: true });
    setBusy(true);
    setError(null);

    return waitForSdk()
      .then(function (api) {
        return api.consent(decisions);
      })
      .then(function (result) {
        hideBanner();
        if (overlay) overlay.classList.add('hidden');
        updateLauncher();
        emitChange(source, decisions, result || {});
        return result || { ok: true };
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : 'Unable to save privacy choices. Tracking remains fail-closed.';
        if (overlay && overlay.classList.contains('hidden')) openPreferences();
        setError(message);
        throw error;
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function acceptAll() {
    return save(acceptAllDecisions(), 'consent_ui_accept_all');
  }

  function rejectAll() {
    return save(rejectAllDecisions(), 'consent_ui_reject_all');
  }

  function saveCustom() {
    return save(customDecisions(), 'consent_ui_custom');
  }

  function shouldShowInitialBanner(api) {
    if (MODE === 'off' || MODE === 'false' || MODE === 'none') return false;
    if (MODE !== 'auto' && MODE !== 'on' && MODE !== 'true') return false;
    var config = api && typeof api.config === 'function' ? api.config() || {} : currentSdkConfig();
    if (String(config.consent_mode || '').toLowerCase() === 'granted') return false;
    return !hasPriorChoice();
  }

  function initialize() {
    if (MODE === 'off' || MODE === 'false' || MODE === 'none') return;
    ensureUi();
    waitForSdk()
      .then(function (api) {
        if (shouldShowInitialBanner(api)) showBanner();
        else hideBanner();
      })
      .catch(function (error) {
        if (!hasPriorChoice()) showBanner();
        setError(error && error.message ? error.message : 'Privacy controls are temporarily unavailable.');
      });
  }

  window.SalsysConsent = {
    __universalConsentUiV1: true,
    version: '1.0.0',
    open: openPreferences,
    close: closePreferences,
    showBanner: showBanner,
    hideBanner: hideBanner,
    acceptAll: acceptAll,
    rejectAll: rejectAll,
    save: function (decisions) {
      return save(decisions || {}, 'consent_ui_programmatic');
    },
    state: readState,
    gpc: gpcEnabled,
    config: function () {
      return {
        mode: MODE,
        settings_mode: SETTINGS_MODE,
        brand_name: BRAND_NAME,
        privacy_policy_url: PRIVACY_URL,
        cookie_policy_url: COOKIE_URL
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
