/**
 * DM-LINK-02: server-side destination validation planning primitive.
 * It never fetches a URL or grants permission to dispatch an Instagram DM.
 * Allowed origin/prefix configuration must come from an approved tenant policy.
 */
export type DmLinkDestinationDecision =
  | { allowed: true; normalizedUrl: string }
  | { allowed: false; reason: 'invalid_config' | 'invalid_url' | 'not_allowed' };

export function validateDmLinkDestination(input: {
  destination: string;
  allowedOrigins: readonly string[];
  allowedPathPrefixes: readonly string[];
}): DmLinkDestinationDecision {
  if (!input || typeof input.destination !== 'string' ||
      !Array.isArray(input.allowedOrigins) || !Array.isArray(input.allowedPathPrefixes) ||
      input.allowedOrigins.length < 1 || input.allowedOrigins.length > 20 ||
      input.allowedPathPrefixes.length < 1 || input.allowedPathPrefixes.length > 30 ||
      input.allowedOrigins.some(x => typeof x !== 'string') ||
      input.allowedPathPrefixes.some(x => typeof x !== 'string')) {
    return { allowed: false, reason: 'invalid_config' };
  }
  const origins: string[] = [];
  for (const configured of input.allowedOrigins) {
    try {
      const url = new URL(configured);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
          url.search || url.pathname !== '/' || url.port ||
          url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
          /^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) || url.hostname.includes(':')) {
        return { allowed: false, reason: 'invalid_config' };
      }
      origins.push(url.origin);
    } catch {
      return { allowed: false, reason: 'invalid_config' };
    }
  }
  const prefixes = input.allowedPathPrefixes;
  if (prefixes.some(x => !/^\/[A-Za-z0-9/_-]+\/$/.test(x) || x.includes('//') || x.includes('/../'))) {
    return { allowed: false, reason: 'invalid_config' };
  }
  if (input.destination.length > 2000 || /[\\\u0000-\u0020\u007f]/.test(input.destination) ||
      /%(?:2f|5c|2e|00|0[ad])/i.test(input.destination)) {
    return { allowed: false, reason: 'invalid_url' };
  }
  let candidate: URL;
  try {
    candidate = new URL(input.destination);
  } catch {
    return { allowed: false, reason: 'invalid_url' };
  }
  if (candidate.protocol !== 'https:' || candidate.username || candidate.password ||
      candidate.port || candidate.hash || !origins.includes(candidate.origin) ||
      !prefixes.some(prefix => candidate.pathname.startsWith(prefix)) ||
      candidate.search || candidate.pathname.includes('//')) {
    return { allowed: false, reason: 'not_allowed' };
  }
  return { allowed: true, normalizedUrl: candidate.href };
}
