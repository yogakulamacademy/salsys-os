import "server-only";

import type {
  AdActivationConsent,
  AdActivationEligibility,
  AdActivationSafeMetadata,
} from "@/lib/ad-activation/types";

const SAFE_METADATA_KEYS = new Set<keyof AdActivationSafeMetadata>([
  "courseId",
  "courseName",
  "location",
  "stage",
  "intent",
  "source",
  "medium",
  "campaign",
  "campaignId",
  "adsetId",
  "adId",
]);

const SENSITIVE_PATTERN =
  /(note|summary|message|transcript|medical|health|diagnos|condition|pregnan|prenatal|postnatal|medication|financial|payment|card|cvv|bank|document|attachment|password|secret|token|disease|symptom|therapy|treatment)/i;

export function evaluateAdActivationEligibility(
  consent: AdActivationConsent,
): AdActivationEligibility {
  if (consent.blockAdExports) {
    return { eligible: false, reason: "ad_exports_blocked" };
  }
  if (consent.advertising !== true) {
    return { eligible: false, reason: "advertising_not_granted" };
  }
  if (consent.personalization !== true) {
    return { eligible: false, reason: "personalization_not_granted" };
  }
  if (consent.marketing !== true) {
    return { eligible: false, reason: "marketing_not_granted" };
  }
  return { eligible: true, reason: "eligible" };
}

export function sanitizeAdActivationMetadata(
  input: Record<string, unknown>,
): AdActivationSafeMetadata {
  const output: AdActivationSafeMetadata = {};

  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_PATTERN.test(key)) {
      continue;
    }
    if (!SAFE_METADATA_KEYS.has(key as keyof AdActivationSafeMetadata)) {
      continue;
    }
    if (typeof value !== "string") {
      continue;
    }
    const clean = value.trim().slice(0, 500);
    if (SENSITIVE_PATTERN.test(clean)) {
      continue;
    }
    if (clean) {
      (output as Record<string, string>)[key] = clean;
    }
  }

  return output;
}

export function containsForbiddenActivationKey(
  input: unknown,
): boolean {
  if (!input || typeof input !== "object") {
    return false;
  }
  if (Array.isArray(input)) {
    return input.some(containsForbiddenActivationKey);
  }
  return Object.entries(input as Record<string, unknown>).some(
    ([key, value]) =>
      SENSITIVE_PATTERN.test(key) ||
      containsForbiddenActivationKey(value),
  );
}
