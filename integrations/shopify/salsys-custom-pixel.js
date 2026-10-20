/*
 * Salsys Shopify Custom Pixel Adapter V1
 *
 * Paste into Shopify Settings -> Customer events -> Add custom pixel, then:
 * 1) replace SOURCE_KEY with the publishable Salsys client source key;
 * 2) configure the Shopify pixel privacy setting to require analytics consent;
 * 3) connect the pixel.
 *
 * SOURCE_KEY is publishable by design. Never paste a trusted Salsys server
 * secret into Shopify pixel code.
 *
 * Shopify checkout_completed is recorded only as
 * web.checkout_completed_observed. It is not authoritative payment/revenue
 * evidence. Order/payment/refund truth must be sent from a trusted Shopify
 * backend/webhook to Salsys /api/events/v1.
 */

const SALSYS_SOURCE_KEY = 'REPLACE_WITH_PUBLISHABLE_SOURCE_KEY';
const SALSYS_BASE_URL = 'https://salsysos.com';
const SALSYS_SDK_VERSION = '1.0.0';
const SALSYS_SESSION_STORAGE_KEY = 'salsys_shopify_session_v1';

let salsysPrivacy = init.customerPrivacy || {};
let salsysLastVisitorId = null;
let salsysLastConsentFingerprint = null;

function salsysId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function trimText(value, max) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function locationSnapshot(event) {
  const location = event && event.context && event.context.document
    ? event.context.document.location
    : null;
  const href = trimText(location && location.href, 2000);

  let parsed = null;
  try {
    parsed = href ? new URL(href) : null;
  } catch (_error) {
    parsed = null;
  }

  return {
    href,
    hostname: trimText(parsed && parsed.hostname, 240),
    pathname: trimText(parsed && parsed.pathname, 1600) || '/',
    title: trimText(event && event.context && event.context.document && event.context.document.title, 500),
    referrer: trimText(event && event.context && event.context.document && event.context.document.referrer, 2000),
    url: parsed,
  };
}

function sessionTouch(parsedUrl) {
  const params = parsedUrl ? parsedUrl.searchParams : null;
  const value = (key, max = 240) => trimText(params && params.get(key), max);

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

function privacyDecision(allowed) {
  return allowed === true ? 'granted' : 'limited';
}

function salsysConsentDecisions(privacy) {
  return {
    analytics: privacyDecision(privacy && privacy.analyticsProcessingAllowed),
    marketing: privacyDecision(privacy && privacy.marketingAllowed),
    personalization: privacyDecision(privacy && privacy.preferencesProcessingAllowed),
    sale_sharing: privacyDecision(privacy && privacy.saleOfDataAllowed),
  };
}

function privacyFingerprint(privacy) {
  return JSON.stringify(salsysConsentDecisions(privacy));
}

async function sendConsent(privacy, visitorId, force = false) {
  if (!visitorId) return false;
  if (!SALSYS_SOURCE_KEY || SALSYS_SOURCE_KEY === 'REPLACE_WITH_PUBLISHABLE_SOURCE_KEY') return false;

  const fingerprint = `${visitorId}:${privacyFingerprint(privacy)}`;
  if (!force && fingerprint === salsysLastConsentFingerprint) return true;

  const payload = {
    event_id: salsysId('consent'),
    visitor_id: visitorId,
    platform: 'shopify',
    occurred_at: new Date().toISOString(),
    decisions: salsysConsentDecisions(privacy),
  };

  try {
    const response = await fetch(`${SALSYS_BASE_URL}/api/privacy/consent/client/v1`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'X-Salsys-Source-Key': SALSYS_SOURCE_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return false;
    salsysLastConsentFingerprint = fingerprint;
    return true;
  } catch (_error) {
    // Shopify remains the visual/privacy authority. Salsys will not persist the
    // matching optional event until its own privacy receipt exists.
    return false;
  }
}

async function getSessionId() {
  let sessionId = null;
  try {
    sessionId = await browser.sessionStorage.getItem(SALSYS_SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = salsysId('shopify_session');
      await browser.sessionStorage.setItem(SALSYS_SESSION_STORAGE_KEY, sessionId);
    }
  } catch (_error) {
    sessionId = salsysId('shopify_session');
  }
  return sessionId;
}

const EVENT_MAP = {
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

function safeCommerceMetadata(event) {
  const data = event && event.data ? event.data : {};
  const productVariant = data.productVariant || data.merchandise || null;
  const product = productVariant && productVariant.product ? productVariant.product : data.product || null;
  const cartLine = data.cartLine || null;
  const checkout = data.checkout || null;

  return {
    shopify_event_name: trimText(event && event.name, 120),
    shopify_event_id: trimText(event && event.id, 240),
    shopify_sequence: Number.isFinite(event && event.seq) ? event.seq : null,
    product_id: trimText(product && product.id, 240),
    product_variant_id: trimText(productVariant && productVariant.id, 240),
    product_title: trimText(product && product.title, 500),
    cart_line_id: trimText(cartLine && cartLine.id, 240),
    checkout_token: trimText(checkout && checkout.token, 240),
    currency_code: trimText(
      (checkout && checkout.currencyCode) ||
        (productVariant && productVariant.price && productVariant.price.currencyCode),
      20,
    ),
  };
}

async function sendEvent(event) {
  const eventName = EVENT_MAP[event && event.name];
  if (!eventName) return;
  if (!salsysPrivacy || salsysPrivacy.analyticsProcessingAllowed !== true) return;
  if (!SALSYS_SOURCE_KEY || SALSYS_SOURCE_KEY === 'REPLACE_WITH_PUBLISHABLE_SOURCE_KEY') return;

  const location = locationSnapshot(event);
  const sessionId = await getSessionId();
  const shopifyClientId = trimText(event && event.clientId, 170);
  const visitorId = shopifyClientId ? `shopify_${shopifyClientId}` : null;
  if (!visitorId || !sessionId || !location.hostname) return;

  salsysLastVisitorId = visitorId;

  // The privacy receipt is bound to the exact anonymous visitor ID used by the
  // event. Send/refresh it before the optional event so the server privacy gate
  // can make a deterministic decision without bypassing Shopify consent.
  const consentReady = await sendConsent(salsysPrivacy, visitorId);
  if (!consentReady) return;

  const payload = {
    event_id: `shopify_${trimText(event.id, 140) || salsysId('evt')}`,
    event_name: eventName,
    schema_version: 1,
    occurred_at: trimText(event.timestamp, 80) || new Date().toISOString(),
    anonymous_visitor_id: visitorId,
    session_key: sessionId,
    site: location.hostname,
    properties: {
      pageUrl: location.href,
      pagePath: location.pathname,
      pageTitle: location.title,
      referrer: location.referrer,
      sessionTouch: sessionTouch(location.url),
      metadata: safeCommerceMetadata(event),
    },
    context: {
      platform: 'shopify',
    },
    metadata: {
      platform: 'shopify',
      sdk: {
        name: 'salsys-shopify',
        version: SALSYS_SDK_VERSION,
        integration: 'shopify_custom_pixel',
      },
      authority: 'non_authoritative_storefront_telemetry',
    },
  };

  try {
    await fetch(`${SALSYS_BASE_URL}/api/events/client/v1`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'X-Salsys-Source-Key': SALSYS_SOURCE_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (_error) {
    // Shopify customer events are best-effort browser telemetry. Authoritative
    // order/payment state is delivered separately by trusted server webhooks.
  }
}

customerPrivacy.subscribe('visitorConsentCollected', (event) => {
  salsysPrivacy = event.customerPrivacy || {};
  salsysLastConsentFingerprint = null;
  if (salsysLastVisitorId) {
    void sendConsent(salsysPrivacy, salsysLastVisitorId, true);
  }
});

Object.keys(EVENT_MAP).forEach((shopifyEventName) => {
  analytics.subscribe(shopifyEventName, (event) => {
    void sendEvent(event);
  });
});
