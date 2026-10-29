type InstagramTelephoneCandidate = {
  raw: string;
  normalized: string;
  internationalFormat: boolean;
};

const PHONE_INTENT_PATTERN = /\b(?:whats?app|wa|phone|mobile|contact|call|number|no\.?|cell)\b/i;
const PHONE_CANDIDATE_PATTERN = /(?:\+|00)?\d(?:[\s().-]*\d){7,14}/g;

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

function normalizeCandidate(raw: string) {
  const trimmed = raw.trim();
  const internationalFormat = /^(?:\+|00)/.test(trimmed);
  const rawDigits = digitsOnly(trimmed);
  const normalized = trimmed.startsWith('00') ? rawDigits.slice(2) : rawDigits;

  if (normalized.length < 8 || normalized.length > 15) return null;

  return {
    raw: trimmed,
    normalized,
    internationalFormat,
  } satisfies InstagramTelephoneCandidate;
}

export function extractInstagramTelephoneCandidate(
  body: string | null | undefined,
): InstagramTelephoneCandidate | null {
  const text = String(body ?? '').trim();
  if (!text) return null;

  const matches = text.match(PHONE_CANDIDATE_PATTERN) ?? [];
  if (!matches.length) return null;

  const hasPhoneIntent = PHONE_INTENT_PATTERN.test(text);

  for (const match of matches) {
    const candidate = normalizeCandidate(match);
    if (!candidate) continue;

    const withoutCandidate = text
      .replace(match, '')
      .replace(/[^\p{L}\p{N}]/gu, '')
      .trim();
    const messageIsMostlyNumber = withoutCandidate.length <= 12;

    if (
      candidate.internationalFormat ||
      hasPhoneIntent ||
      messageIsMostlyNumber
    ) {
      return candidate;
    }
  }

  return null;
}
