import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';

/** Conservative public-web-only boundary for proposed Knowledge Builder crawls. */
const BLOCKED_SUFFIXES = [
  '.localhost', '.local', '.internal', '.intranet', '.lan', '.home',
  '.home.arpa', '.test', '.invalid', '.example', '.onion',
];

export class WebsiteScopeError extends Error {
  constructor(message: string) { super(message); this.name = 'WebsiteScopeError'; }
}

export function parseWebsiteSeed(value: string): URL {
  const input = value.trim();
  if (!input || input.length > 2048 || /[\x00-\x1F\x7F]/.test(input)) {
    throw new WebsiteScopeError('Enter a valid public website URL.');
  }
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : 'https://' + input;
  let url: URL;
  try { url = new URL(candidate); } catch { throw new WebsiteScopeError('Enter a valid website URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new WebsiteScopeError('Only public HTTP(S) websites on standard ports are supported.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.length > 253 || isIP(host) || !host.includes('.') ||
      host === 'localhost' || BLOCKED_SUFFIXES.some(suffix => host.endsWith(suffix)) ||
      host.split('.').some(label => !label || label.length > 63 || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(label))) {
    throw new WebsiteScopeError('The website must have a public DNS hostname.');
  }
  url.hostname = host;
  url.hash = '';
  url.search = ''; // Avoid infinite query-driven crawl spaces and tracking tokens.
  return url;
}

export function publicIpOnly(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped/compatible, transition, documentation and non-global space are refused.
    if (lower.includes('.') || lower.includes('::ffff:')) return false;
    // Compare numeric prefixes, not only literal spelling: compressed
    // 2001::1 and zero-padded 2001:0000::1 are the same reserved block.
    const sections = lower.split(':');
    const first = Number.parseInt(sections[0], 16);
    const second = sections[1] ? Number.parseInt(sections[1], 16) : 0;
    if (!Number.isInteger(first) || !Number.isInteger(second)) return false;
    if (first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) return false;
    if (first === 0x2002 || first === 0x3fff) return false;
    return first >= 0x2000 && first < 0x4000;
  }
  return false;
}

export type PinnedPublicAddress = { address: string; family: 4 | 6 };
export type LookupAddresses = (hostname: string) => Promise<PinnedPublicAddress[]>;

export const resolveWebsiteAddresses: LookupAddresses = async hostname =>
  dnsLookup(hostname, { all: true, verbatim: true }) as Promise<PinnedPublicAddress[]>;

/** Resolve every address; reject the whole hostname if even one record is unsafe. */
export async function pinPublicAddress(
  url: URL,
  resolver: LookupAddresses = resolveWebsiteAddresses,
  timeoutMs = 5_000,
): Promise<PinnedPublicAddress> {
  // Revalidate after every redirect too, not just the initial user input.
  parseWebsiteSeed(url.href);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let addresses: PinnedPublicAddress[];
  try {
    addresses = await Promise.race([
      resolver(url.hostname),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new WebsiteScopeError('Public DNS resolution timed out.')),
          timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!addresses.length || addresses.length > 32 ||
      addresses.some(a => !publicIpOnly(a.address) || a.family !== isIP(a.address))) {
    throw new WebsiteScopeError('The hostname does not resolve exclusively to public IP addresses.');
  }
  return addresses[0];
}

function comparableHost(host: string): string { return host.toLowerCase().replace(/\.$/, ''); }

/** Never follow a discovered link outside the EXACT verified hostname. */
export function scopedDiscoveredUrl(seed: URL, page: URL, rawHref: string): URL | null {
  if (!rawHref || rawHref.length > 2048 || /^[\s\u0000-\u001f]*#/.test(rawHref)) return null;
  let next: URL;
  try { next = new URL(rawHref, page); } catch { return null; }
  if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password || next.port) return null;
  if ((seed.protocol === 'https:' || page.protocol === 'https:') &&
      next.protocol !== 'https:') return null;
  if (comparableHost(seed.hostname) !== comparableHost(next.hostname)) return null;
  try { return parseWebsiteSeed(next.href); } catch { return null; }
}
