import {register} from '@shopify/web-pixels-extension';

const SALSYS_BASE_URL = 'https://salsysos.com';
const SALSYS_SDK_VERSION = '1.0.0';
const SESSION_KEY = 'salsys_shopify_session_v1';

register(({analytics, browser, settings, init, customerPrivacy}) => {
  const sourceKey = typeof settings.sourceKey === 'string' ? settings.sourceKey.trim() : '';
  const baseUrl = typeof settings.baseUrl === 'string' && settings.baseUrl.trim()
    ? settings.baseUrl.trim().replace(/\/$/, '')
    : SALSYS_BASE_URL;

  let privacy = init.customerPrivacy || {};
  let lastVisitorId = null;
  let lastConsentFingerprint = null;

  function id(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  }

  function text(value, max) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized ? normalized.slice(0, max) : null;
  }

  function decision(allowed) {
    return allowed === true ? 'granted' : 'limited';
  }

  function consentDecisions(value) {
    return {
      analytics: decision(value && value.analyticsProcessingAllowed),
      marketing: decision(value && value.marketingAllowed),
      personalization: decision(value && value.preferencesProcessingAllowed),
      sale_sharing: decision(value && value.saleOfDataAllowed),
    };
  }

  function consentFingerprint(value) {
    return JSON.stringify(consentDecisions(value));
  }

  async function consentReceipt(visitorId, force = false) {
    if (!sourceKey || !visitorId) return false;
    const fingerprint = `${visitorId}:${consentFingerprint(privacy)}`;
    if (!force && fingerprint === lastConsentFingerprint) return true;

    try {
      const response = await fetch(`${baseUrl}/api/privacy/consent/client/v1`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'X-Salsys-Source-Key': sourceKey,
        },
        body: JSON.stringify({
          event_id: id('consent'),
          visitor_id: visitorId,
          platform: 'shopify',
          occurred_at: new Date().toISOString(),
          decisions: consentDecisions(privacy),
        }),
      });
      if (!response.ok) return false;
      lastConsentFingerprint = fingerprint;
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function sessionId() {
    try {
      let value = await browser.sessionStorage.getItem(SESSION_KEY);
      if (!value) {
        value = id('shopify_session');
        await browser.sessionStorage.setItem(SESSION_KEY, value);
      }
      return value;
    } catch (_error) {
      return id('shopify_session');
    }
  }

  function location(event) {
    const documentContext = event && event.context ? event.context.document : null;
    const href = text(documentContext && documentContext.location && documentContext.location.href, 2000);
    let url = null;
    try {
      url = href ? new URL(href) : null;
    } catch (_error) {
      url = null;
    }
    return {
      href,
      url,
      hostname: text(url && url.hostname, 240),
      pathname: text(url && url.pathname, 1600) || '/',
      title: text(documentContext && documentContext.title, 500),
      referrer: text(documentContext && documentContext.referrer, 2000),
    };
  }

  function touch(url) {
    const params = url ? url.searchParams : null;
    const value = (key, max = 240) => text(params && params.get(key), max);
    return {
      source: value('utm_source'),
      medium: value('utm_medium'),
      campaign: value('utm_campaign'),
      content: value('utm_content'),
      term: value('utm_term'),
      utmId: value('utm_id'),
      gclid: value('gclid'),
      gbraid: value('gbraid'),
      wbraid: value('wbraid'),
      fbclid: value('fbclid'),
      campaignId: value('campaignid') || value('campaign_id'),
      adsetId: value('adsetid') || value('adset_id'),
      adId: value('adid') || value('ad_id'),
      creativeId: value('creative') || value('creative_id'),
      adgroupId: value('adgroupid') || value('adgroup_id'),
    };
  }

  const map = {
    page_viewed: 'web.page_viewed',
    product_viewed: 'web.product_viewed',
    collection_viewed: 'web.collection_viewed',
    search_submitted: 'web.search_submitted',
    cart_viewed: 'web.cart_viewed',
    product_added_to_cart: 'web.product_added_to_cart',
    product_removed_from_cart: 'web.product_removed_from_cart',
    checkout_started: 'web.checkout_started',
    checkout_contact_info_submitted: 'web.checkout_contact_info_submitted',
    checkout_address_info_submitted: 'web.checkout_address_info_submitted',
    checkout_shipping_info_submitted: 'web.checkout_shipping_info_submitted',
    payment_info_submitted: 'web.payment_info_submitted',
    checkout_completed: 'web.checkout_completed_observed',
  };

  function safeMetadata(event) {
    const data = event && event.data ? event.data : {};
    const productVariant = data.productVariant || data.merchandise || null;
    const product = productVariant && productVariant.product ? productVariant.product : data.product || null;
    const cartLine = data.cartLine || null;
    const checkout = data.checkout || null;
    return {
      shopify_event_name: text(event && event.name, 120),
      shopify_event_id: text(event && event.id, 240),
      shopify_sequence: Number.isFinite(event && event.seq) ? event.seq : null,
      product_id: text(product && product.id, 240),
      product_variant_id: text(productVariant && productVariant.id, 240),
      product_title: text(product && product.title, 500),
      cart_line_id: text(cartLine && cartLine.id, 240),
      checkout_token: text(checkout && checkout.token, 240),
      currency_code: text(
        (checkout && checkout.currencyCode) ||
          (productVariant && productVariant.price && productVariant.price.currencyCode),
        20,
      ),
    };
  }

  async function send(event) {
    const eventName = map[event && event.name];
    if (!eventName || !sourceKey || privacy.analyticsProcessingAllowed !== true) return;

    const shopifyClientId = text(event && event.clientId, 170);
    const visitorId = shopifyClientId ? `shopify_${shopifyClientId}` : null;
    const page = location(event);
    const currentSession = await sessionId();
    if (!visitorId || !currentSession || !page.hostname) return;

    lastVisitorId = visitorId;
    if (!(await consentReceipt(visitorId))) return;

    const payload = {
      event_id: `shopify_${text(event && event.id, 140) || id('evt')}`,
      event_name: eventName,
      schema_version: 1,
      occurred_at: text(event && event.timestamp, 80) || new Date().toISOString(),
      anonymous_visitor_id: visitorId,
      session_key: currentSession,
      site: page.hostname,
      properties: {
        pageUrl: page.href,
        pagePath: page.pathname,
        pageTitle: page.title,
        referrer: page.referrer,
        sessionTouch: touch(page.url),
        metadata: safeMetadata(event),
      },
      context: {platform: 'shopify'},
      metadata: {
        platform: 'shopify',
        sdk: {
          name: 'salsys-shopify',
          version: SALSYS_SDK_VERSION,
          integration: 'shopify_app_pixel',
        },
        authority: 'non_authoritative_storefront_telemetry',
      },
    };

    try {
      await fetch(`${baseUrl}/api/events/client/v1`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'X-Salsys-Source-Key': sourceKey,
        },
        body: JSON.stringify(payload),
      });
    } catch (_error) {
      // Browser customer events are best-effort. Authoritative business facts
      // arrive through a trusted Shopify server/webhook integration.
    }
  }

  customerPrivacy.subscribe('visitorConsentCollected', (event) => {
    privacy = event.customerPrivacy || {};
    lastConsentFingerprint = null;
    if (lastVisitorId) void consentReceipt(lastVisitorId, true);
  });

  Object.keys(map).forEach((name) => {
    analytics.subscribe(name, (event) => void send(event));
  });
});
