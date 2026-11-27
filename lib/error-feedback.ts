/** Short-lived presentation data only. Never use this cookie to authorize access. */
export const ERROR_QUERY_KEYS = ['error', 'error_description', 'error_message', 'notice'] as const;
export const ERROR_FEEDBACK_TTL = 60;
type ErrorFeedback = { path: string; entries: [string, string][]; expires: number };

export function isFeedbackPage(path: string) {
  // OAuth/CAPTCHA/API protocol errors must reach their own handlers unchanged.
  return !/^\/(?:api|auth|_next|go)(?:\/|$)/.test(path) && path !== '/signup/verify' && !/\.[a-z0-9]+$/i.test(path);
}

export function splitErrorFeedback(input: URL) {
  const url = new URL(input.href);
  const entries: [string, string][] = [];
  if (isFeedbackPage(url.pathname)) {
    for (const key of ERROR_QUERY_KEYS) {
      for (const value of url.searchParams.getAll(key)) if (value) entries.push([key, value.slice(0, 600)]);
      url.searchParams.delete(key);
    }
  }
  return { url, entries };
}

export function errorCookieName(path: string, secure: boolean) {
  let hash = 2166136261;
  for (const character of path) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${secure ? '__Host-' : ''}salsys-error-${(hash >>> 0).toString(36)}`;
}

export function encodeErrorFeedback(path: string, entries: [string, string][], now = Date.now()) {
  // Bound the full UTF-8 cookie well below browser limits, including Unicode messages.
  let remaining = 600;
  const bounded = entries.slice(0, 3).map(([key, value]): [string, string] => {
    const text = value.slice(0, remaining); remaining -= text.length; return [key, text];
  });
  const json = JSON.stringify({ path, entries: bounded, expires: now + ERROR_FEEDBACK_TTL * 1000 });
  return btoa(String.fromCharCode(...new TextEncoder().encode(json))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeErrorFeedback(raw: string | undefined, path: string, now = Date.now()): ErrorFeedback | null {
  if (!raw || raw.length > 3500) return null;
  try {
    const binary = atob(raw.replaceAll('-', '+').replaceAll('_', '/'));
    const value = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)))) as ErrorFeedback;
    if (value.path !== path || !Number.isFinite(value.expires) || value.expires < now || value.expires > now + ERROR_FEEDBACK_TTL * 1000 || !Array.isArray(value.entries)) return null;
    if (!value.entries.length || value.entries.length > 3 || !value.entries.every(entry => Array.isArray(entry) && entry.length === 2 && ERROR_QUERY_KEYS.includes(entry[0] as typeof ERROR_QUERY_KEYS[number]) && typeof entry[1] === 'string' && entry[1].length <= 600)) return null;
    return value;
  } catch { return null; }
}
