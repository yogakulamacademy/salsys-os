/**
 * Client-only presentation filter: discovered pages originate in untrusted
 * website content. Never turn a malformed or off-host URL into a clickable
 * link, even if an earlier crawler asserted the page was in scope.
 */
export function safeDiscoveryPageLink(
  raw: string,
  configuredWebsite: string | null,
): { href: string; pathname: string } | null {
  if (!configuredWebsite || typeof raw !== 'string' ||
      raw.length === 0 || raw.length > 2048 ||
      /[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const configured = new URL(configuredWebsite);
    const candidate = new URL(raw);
    if (configured.protocol !== 'https:' || candidate.protocol !== 'https:' ||
        configured.username || configured.password || configured.port ||
        candidate.username || candidate.password || candidate.port ||
        candidate.hostname.toLowerCase().replace(/\.$/, '') !==
          configured.hostname.toLowerCase().replace(/\.$/, '')) return null;
    return { href: candidate.href, pathname: candidate.pathname || '/' };
  } catch {
    return null;
  }
}
