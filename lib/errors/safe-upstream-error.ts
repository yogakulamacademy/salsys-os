const HTML_ERROR_PATTERN = /<!doctype\s+html|<html\b|<head\b|<body\b|cloudflare/i;
const HTTP_STATUS_PATTERN = /(?:error\s*code|http|status(?:\s*code)?)\D{0,12}([45]\d{2})/i;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

function compact(value: unknown, max = 360) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(IPV4_PATTERN, '[redacted-ip]')
    .trim()
    .slice(0, max);
}

function errorField(error: unknown, key: string) {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return null;
  return (error as Record<string, unknown>)[key] ?? null;
}

function detectedStatus(error: unknown, message: string) {
  for (const candidate of [errorField(error, 'status'), errorField(error, 'statusCode')]) {
    const status = Number(candidate);
    if (Number.isInteger(status) && status >= 400 && status <= 599) {
      return status;
    }
  }

  const code = compact(errorField(error, 'code'), 40);
  if (/^[45]\d{2}$/.test(code)) return Number(code);

  const match = message.match(HTTP_STATUS_PATTERN);
  return match ? Number(match[1]) : null;
}

/**
 * Converts provider/database errors into a bounded log-safe message.
 *
 * Supabase can surface proxy/CDN failures as complete HTML documents. Those
 * bodies are noisy and may contain request/network metadata that should not be
 * copied into application logs. Normal compact Postgres/Supabase messages are
 * preserved for diagnosis.
 */
export function safeUpstreamErrorMessage(
  error: unknown,
  fallback = 'Upstream service request failed',
) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : errorField(error, 'message') ?? error;
  const message = compact(rawMessage, 2000);
  const status = detectedStatus(error, message);

  if (!message) {
    return status ? `${fallback} (HTTP ${status})` : fallback;
  }

  if (HTML_ERROR_PATTERN.test(message) || message.length > 900) {
    return status ? `${fallback} (HTTP ${status})` : fallback;
  }

  const bounded = compact(message, 360);
  return bounded || (status ? `${fallback} (HTTP ${status})` : fallback);
}
