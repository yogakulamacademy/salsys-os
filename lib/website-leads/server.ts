export type WebsiteLeadPayload = {
  externalEventId: string;
  site?: string | null;
  formName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  courseCode?: string | null;
  preferredLocation?: string | null;
  preferredMonth?: string | null;
  preferredMode?: string | null;
  country?: string | null;
  timezone?: string | null;
  message?: string | null;
  anonymousVisitorId?: string | null;
  sessionKey?: string | null;
  firstTouch?: Record<string, unknown>;
  sessionTouch?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const safeText = (value: unknown, max = 500) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

function safeObject(value: unknown, maxBytes = 8000): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    const encoded = JSON.stringify(value);
    return encoded.length <= maxBytes ? (value as Record<string, unknown>) : { truncated: true };
  } catch {
    return {};
  }
}

function normalizeMonth(value: unknown) {
  const text = safeText(value, 20);
  if (!text) return null;
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}

export function sanitizeWebsiteLeadPayload(input: unknown): WebsiteLeadPayload {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid lead payload.');
  }

  const raw = input as Record<string, unknown>;
  const externalEventId = safeText(raw.externalEventId ?? raw.external_event_id ?? raw.submissionId ?? raw.submission_id, 180);
  if (!externalEventId) throw new Error('externalEventId is required.');

  const email = safeText(raw.email, 320);
  const phone = safeText(raw.phone ?? raw.mobile ?? raw.whatsapp, 80);
  const firstName = safeText(raw.firstName ?? raw.first_name ?? raw.name, 160);

  if (!email && !phone && !firstName) {
    throw new Error('At least a name, email or phone number is required.');
  }

  return {
    externalEventId,
    site: safeText(raw.site, 160),
    formName: safeText(raw.formName ?? raw.form_name ?? raw.formId ?? raw.form_id, 180),
    firstName,
    lastName: safeText(raw.lastName ?? raw.last_name, 160),
    email,
    phone,
    courseCode: safeText(raw.courseCode ?? raw.course_code, 120),
    preferredLocation: safeText(raw.preferredLocation ?? raw.preferred_location ?? raw.location, 180),
    preferredMonth: normalizeMonth(raw.preferredMonth ?? raw.preferred_month),
    preferredMode: safeText(raw.preferredMode ?? raw.preferred_mode ?? raw.mode, 80),
    country: safeText(raw.country, 120),
    timezone: safeText(raw.timezone, 120),
    message: safeText(raw.message ?? raw.query ?? raw.enquiry ?? raw.inquiry, 8000),
    anonymousVisitorId: safeText(
      raw.anonymousVisitorId ??
        raw.anonymous_visitor_id ??
        raw.salsys_visitor_id ??
        raw.yk_visitor_id,
      180,
    ),
    sessionKey: safeText(
      raw.sessionKey ??
        raw.session_key ??
        raw.salsys_session_id ??
        raw.yk_session_id,
      180,
    ),
    firstTouch: safeObject(
      raw.firstTouch ??
        raw.first_touch ??
        parseMaybeJson(raw.salsys_first_touch ?? raw.yk_first_touch),
    ),
    sessionTouch: safeObject(
      raw.sessionTouch ??
        raw.session_touch ??
        parseMaybeJson(raw.salsys_session_touch ?? raw.yk_session_touch),
    ),
    metadata: safeObject(raw.metadata),
  };
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) return value;
  try { return JSON.parse(value); } catch { return {}; }
}

export function isWebsiteCaptureAuthorized(secret: string | null) {
  const expected = process.env.WEBSITE_LEAD_CAPTURE_SECRET;
  return Boolean(expected && secret && secret === expected);
}
