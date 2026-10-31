import "server-only";

import { createHash } from "crypto";

export function normalizeActivationEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 320 || !normalized.includes("@")) {
    return null;
  }
  return normalized;
}

export function normalizeActivationPhone(value: string) {
  const trimmed = value.trim();
  if (!/^\+[\d\s().-]+$/.test(trimmed)) {
    return null;
  }
  const compact = "+" + trimmed.slice(1).replace(/\D/g, "");
  return /^\+\d{7,15}$/.test(compact) ? compact : null;
}

export function sha256ActivationIdentifier(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashedActivationEmails(values: readonly string[]) {
  return [...new Set(values
    .map(normalizeActivationEmail)
    .filter((value): value is string => Boolean(value))
    .map(sha256ActivationIdentifier))];
}

export function hashedActivationPhones(values: readonly string[]) {
  return [...new Set(values
    .map(normalizeActivationPhone)
    .filter((value): value is string => Boolean(value))
    .map(sha256ActivationIdentifier))];
}
