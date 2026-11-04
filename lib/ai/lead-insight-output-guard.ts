/**
 * Deterministic C5c safety check for staff-visible, model-authored prose.
 *
 * This is a last-resort leakage and unsupported-claim filter, not a semantic
 * fact checker. The evidence validator and mandatory staff review still apply.
 */
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_LIKE = /(?:\+?\d[\s().-]*){9,15}/g;
const NEGATED_STATEMENT = /\b(?:not|no|never|without|unverified|unconfirmed|unknown|cannot|can't)\b/i;
const INSTRUCTION_ECHO = /\b(?:ignore|override|disregard)\s+(?:all\s+)?(?:previous|prior|system|developer)\s+instructions\b|\b(?:reveal|print|display|output)\s+(?:the\s+)?(?:api|secret|system)\s+(?:key|prompt|token)\b/i;

// Models cannot assert commercial settlement, admission, reservations or
// accommodation availability, even if a student claimed them in conversation.
// These require verified operational records which C2 does not currently have.
const UNSAFE_COMMERCIAL_ASSERTIONS: readonly RegExp[] = [
  /\b(?:payment|deposit|balance|refund|tuition|fees?)\b.{0,45}\b(?:confirmed|verified|settled|received|completed|processed|guaranteed|paid|approved)\b/gi,
  /\b(?:received|confirmed|settled|processed|completed|refunded|approved)\b.{0,45}\b(?:payment|deposit|balance|refund|tuition|fees?)\b/gi,
  /\b(?:enroll(?:ment|ed)?|admission|registration|booking)\b.{0,45}\b(?:confirmed|approved|guaranteed|completed|successful)\b/gi,
  /\b(?:you(?:'re| are)|student is|student has been|they(?:'re| are))\s+(?:(?:now|fully|already)\s+)?(?:enrolled|registered|admitted|accepted)\b/gi,
  /\b(?:seat|spot|place|room|accommodation)\b.{0,45}\b(?:reserved|secured|confirmed|guaranteed|available)\b/gi,
  /\b(?:reserved|secured|confirmed|guaranteed)\b.{0,45}\b(?:seat|spot|place|room|accommodation)\b/gi,
  /\b(?:certificate|certification)\b.{0,45}\b(?:guaranteed|issued|approved)\b/gi,
  /\b(?:guaranteed|issued|approved)\b.{0,45}\b(?:certificate|certification)\b/gi,
];

export function containsDirectContactDetail(value: string): boolean {
  if (EMAIL_ADDRESS.test(value)) return true;
  // Detect phone-like runs without blanket blocking dates such as 2026-11-04
  // or course hour counts such as "200-hour" and "300-hour".
  for (const candidate of value.matchAll(PHONE_LIKE)) {
    const matchedText = candidate[0].trim();
    // ISO dates with an adjacent hour can look like a 10-digit telephone.
    if (/^\d{4}-\d{1,2}-\d{1,2}(?:\s+\d{1,2})?$/.test(matchedText) ||
        /^\d{1,2}-\d{1,2}-\d{4}(?:\s+\d{1,2})?$/.test(matchedText)) continue;
    const digits = matchedText.replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 15) return true;
  }
  return false;
}

export function hasUnverifiedCommercialClaim(value: string): boolean {
  for (const pattern of UNSAFE_COMMERCIAL_ASSERTIONS) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      // "Payment not received" and "No confirmed booking" are not positive
      // settlement assertions. This limited lexical exception does not
      // establish that a negative claim is factually true.
      const matchStart = match.index ?? 0;
      const prefix = value.slice(Math.max(0, matchStart - 12), matchStart);
      if (NEGATED_STATEMENT.test(prefix + match[0])) continue;
      return true;
    }
  }
  return false;
}

export function assertSafeInsightProse(value: string): void {
  if (containsDirectContactDetail(value)) {
    throw Error('AI insight contains a direct contact detail.');
  }
  if (INSTRUCTION_ECHO.test(value)) {
    throw Error('AI insight echoed an instruction or secret-disclosure request.');
  }
  if (hasUnverifiedCommercialClaim(value)) {
    throw Error('Unverified financial, booking or enrollment claim in AI output.');
  }
}
