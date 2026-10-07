export type TrackingAttribution = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  utmId?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid?: string | null;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
  adgroupId?: string | null;
  creativeId?: string | null;
};

export type TrackingConsentState = {
  analytics: boolean | null;
  adUserData: boolean | null;
  adPersonalization: boolean | null;
  marketing: boolean | null;
  mode?: string | null;
  source?: string | null;
};

export type TrackingConsentPayload = {
  eventId: string;
  occurredAt?: string;
  anonymousVisitorId?: string;
  sessionKey?: string;
  site?: string;
  consent: TrackingConsentState;
};

export type TrackingPayload = {
  eventId: string;
  eventType: string;
  occurredAt?: string;
  anonymousVisitorId: string;
  sessionKey: string;
  site?: string;
  pageUrl?: string;
  pagePath?: string;
  pageTitle?: string;
  referrer?: string;
  firstTouch?: TrackingAttribution;
  sessionTouch?: TrackingAttribution;
  fbc?: string;
  fbp?: string;
  consent?: TrackingConsentState;
  metadata?: Record<string, unknown>;
};

const safeText = (value: unknown, max = 500) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

const safeBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

const cleanConsent = (
  value: unknown,
): TrackingConsentState | undefined => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return undefined;
  }

  const obj =
    value as Record<string, unknown>;

  const consent: TrackingConsentState = {
    analytics: safeBoolean(obj.analytics),
    adUserData: safeBoolean(obj.adUserData),
    adPersonalization: safeBoolean(obj.adPersonalization),
    marketing: safeBoolean(obj.marketing),
    mode: safeText(obj.mode, 60),
    source: safeText(obj.source, 100),
  };

  const hasExplicitState = [
    consent.analytics,
    consent.adUserData,
    consent.adPersonalization,
    consent.marketing,
  ].some((state) => state !== null);

  return hasExplicitState
    ? consent
    : undefined;
};

export function sanitizeTrackingPayload(input: unknown): TrackingPayload {
  if (!input || typeof input !== 'object') throw new Error('Invalid tracking payload.');
  const raw = input as Record<string, unknown>;
  const eventId = safeText(raw.eventId, 100);
  const eventType = safeText(raw.eventType, 80);
  const visitor = safeText(raw.anonymousVisitorId, 120);
  const session = safeText(raw.sessionKey, 120);
  if (!eventId || !eventType || !visitor || !session) throw new Error('Missing tracking identifiers.');

  const cleanAttribution = (value: unknown): TrackingAttribution => {
    const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    return {
      source: safeText(obj.source, 120), medium: safeText(obj.medium, 120), campaign: safeText(obj.campaign, 220),
      content: safeText(obj.content, 220), term: safeText(obj.term, 220), utmId: safeText(obj.utmId, 220),
      gclid: safeText(obj.gclid, 300), gbraid: safeText(obj.gbraid, 300), wbraid: safeText(obj.wbraid, 300),
      fbclid: safeText(obj.fbclid, 300), campaignId: safeText(obj.campaignId, 120), adsetId: safeText(obj.adsetId, 120),
      adId: safeText(obj.adId, 120), adgroupId: safeText(obj.adgroupId, 120), creativeId: safeText(obj.creativeId, 120),
    };
  };

  let metadata: Record<string, unknown> = {};
  if (raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)) {
    const encoded = JSON.stringify(raw.metadata);
    metadata = encoded.length <= 8000 ? (raw.metadata as Record<string, unknown>) : { truncated: true };
  }

  return {
    eventId, eventType,
    occurredAt: safeText(raw.occurredAt, 80) ?? undefined,
    anonymousVisitorId: visitor,
    sessionKey: session,
    site: safeText(raw.site, 160) ?? undefined,
    pageUrl: safeText(raw.pageUrl, 2000) ?? undefined,
    pagePath: safeText(raw.pagePath, 1000) ?? undefined,
    pageTitle: safeText(raw.pageTitle, 500) ?? undefined,
    referrer: safeText(raw.referrer, 2000) ?? undefined,
    firstTouch: cleanAttribution(raw.firstTouch),
    sessionTouch: cleanAttribution(raw.sessionTouch),
    fbc: safeText(raw.fbc, 500) ?? undefined,
    fbp: safeText(raw.fbp, 500) ?? undefined,
    consent: cleanConsent(raw.consent),
    metadata,
  };
}


export function sanitizeTrackingConsentPayload(
  input: unknown,
): TrackingConsentPayload {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new Error('Invalid tracking consent payload.');
  }

  const raw =
    input as Record<string, unknown>;

  const eventId =
    safeText(raw.eventId, 100);

  if (!eventId) {
    throw new Error('Missing consent event identifier.');
  }

  const consent =
    cleanConsent(raw.consent);

  if (!consent) {
    throw new Error('At least one explicit consent state is required.');
  }

  return {
    eventId,
    occurredAt:
      safeText(raw.occurredAt, 80) ??
      undefined,
    anonymousVisitorId:
      safeText(raw.anonymousVisitorId, 120) ??
      undefined,
    sessionKey:
      safeText(raw.sessionKey, 120) ??
      undefined,
    site:
      safeText(raw.site, 160) ??
      undefined,
    consent,
  };
}

function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '*') return trimmed;
  try { return new URL(trimmed).origin; } catch { return trimmed.replace(/\/$/, ''); }
}

export function getTrackingAllowedOrigins() {
  return (process.env.TRACKING_ALLOWED_ORIGINS || '')
    .split(',').map(normalizeOrigin).filter(Boolean);
}

export function isTrackingOriginAllowed(origin: string | null) {
  if (!origin) return true;
  const allowed = getTrackingAllowedOrigins();
  const normalized = normalizeOrigin(origin);
  return allowed.includes('*') || allowed.includes(normalized);
}

export function trackingCorsHeaders(origin: string | null) {
  const allowed = getTrackingAllowedOrigins();
  const normalized = origin ? normalizeOrigin(origin) : null;
  const allowOrigin = normalized && (allowed.includes('*') || allowed.includes(normalized)) ? normalized : allowed[0] || '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Tracking-Secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
