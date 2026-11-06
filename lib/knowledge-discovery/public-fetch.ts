import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { pinPublicAddress, scopedDiscoveredUrl, type LookupAddresses } from './url-policy';

export class WebsiteFetchError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'WebsiteFetchError';
  }
}
export type PublicWebResponse = { url: string; status: number; contentType: string; body: string };
type RawReply = { status: number; location: string | null; contentType: string; body: string };

/** All sockets use a previously checked public IP rather than a new DNS lookup. */
async function requestPinned(url: URL, address: string, family: 4 | 6, limitBytes: number): Promise<RawReply> {
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    let ended = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (err?: Error, value?: RawReply) => {
      if (ended) return;
      ended = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err);
      else if (value) resolve(value);
    };
    const req = request(url, {
      method: 'GET', agent: false,
      headers: {
        'user-agent': 'SalsysOSKnowledgeBot/0.1 (+public website discovery)',
        accept: 'text/html,application/xhtml+xml,application/xml,text/xml,text/plain',
        'accept-encoding': 'identity',
      },
      lookup: (_hostname, _options, callback) => callback(null, address, family),
    }, response => {
      const status = response.statusCode ?? 0;
      const location = typeof response.headers.location === 'string' ? response.headers.location : null;
      const contentType = String(response.headers['content-type'] ?? '').toLowerCase().slice(0, 160);
      const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase();
      const declared = Number(response.headers['content-length'] ?? 0);
      if ((declared && declared > limitBytes) || !['identity', ''].includes(encoding)) {
        response.destroy();
        finish(new WebsiteFetchError('response_exceeds_limits'));
        return;
      }
      const buffers: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > limitBytes) {
          response.destroy();
          finish(new WebsiteFetchError('response_exceeds_limits'));
          return;
        }
        buffers.push(chunk);
      });
      response.on('end', () => finish(undefined, {
        status, location, contentType, body: Buffer.concat(buffers).toString('utf8'),
      }));
      response.on('error', error => finish(error));
    });
    // Total wall-clock deadline, not just an idle-socket timeout. A remote
    // host cannot keep this worker busy indefinitely by dripping small chunks.
    timer = setTimeout(() => req.destroy(new WebsiteFetchError('fetch_timeout')), 8_000);
    req.setTimeout(8_000, () => req.destroy(new WebsiteFetchError('fetch_timeout')));
    req.on('error', error => finish(error));
    req.end();
  });
}

export async function fetchPublicWeb(
  seed: URL, candidate: URL, kind: 'html' | 'robots' | 'sitemap' | 'verification',
  resolver?: LookupAddresses,
  transport: typeof requestPinned = requestPinned,
  authorizeRedirect?: (next: URL) => Promise<void>,
): Promise<PublicWebResponse> {
  let current = candidate;
  const byteLimit = kind === 'html' ? 512 * 1024 : kind === 'verification' ? 4 * 1024 : 256 * 1024;
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (!scopedDiscoveredUrl(seed, current, current.href)) throw new WebsiteFetchError('offsite_or_unsafe_url');
    const pinned = await pinPublicAddress(current, resolver);
    const reply = await transport(current, pinned.address, pinned.family, byteLimit);
    if ([301, 302, 303, 307, 308].includes(reply.status)) {
      // Ownership proof must come from the configured host itself, not a
      // different www/alias or forwarding endpoint.
      if (kind === 'verification') throw new WebsiteFetchError('verification_redirect_not_allowed');
      if (!reply.location || redirect === 3) throw new WebsiteFetchError('redirect_limit');
      const next = scopedDiscoveredUrl(seed, current, reply.location);
      if (!next) throw new WebsiteFetchError('redirect_out_of_scope');
      // A page or sitemap may redirect to a path with different robots rules
      // (or from apex to www). Never fetch its body before those rules are
      // checked. Direct transport callers without a guard fail closed.
      if (kind !== 'robots') {
        if (!authorizeRedirect) throw new WebsiteFetchError('redirect_robots_required');
        await authorizeRedirect(next);
      }
      current = next;
      continue;
    }
    if (reply.status === 429 || reply.status >= 500) throw new WebsiteFetchError('remote_temporarily_unavailable');
    if (reply.status === 401 || reply.status === 403) throw new WebsiteFetchError('access_denied');
    if (reply.status >= 400 && !(kind === 'robots' && reply.status === 404) &&
        !(kind === 'sitemap' && reply.status === 404)) throw new WebsiteFetchError('http_error');
    const supported = kind === 'html'
      ? /^(text\/html|application\/xhtml\+xml)\b/.test(reply.contentType)
      : kind === 'robots'
        ? /^text\/plain\b/.test(reply.contentType)
        : kind === 'verification'
          ? /^text\/plain\b/.test(reply.contentType)
          : /^(application\/xml|text\/xml|text\/plain|application\/octet-stream)\b/.test(reply.contentType);
    if (reply.status !== 404 && !supported) throw new WebsiteFetchError('unsupported_content_type');
    return { url: current.href, status: reply.status, contentType: reply.contentType, body: reply.body };
  }
  throw new WebsiteFetchError('redirect_limit');
}

function robotsRegex(pattern: string): RegExp {
  const ending = pattern.endsWith('$');
  const clean = ending ? pattern.slice(0, -1) : pattern;
  const expression = clean.split('*').map(segment => segment.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + expression + (ending ? '$' : ''));
}

export function evaluateRobots(text: string, path: string, bot = 'salsysosknowledgebot'): { allowed: boolean; delaySeconds: number } {
  type Group = { agents: string[]; rules: Array<{ verb: string; path: string }>; delay: number };
  const groups: Group[] = [];
  let group: Group | null = null;
  let inRules = false;
  for (const raw of text.slice(0, 256 * 1024).split(/\r?\n/)) {
    const line = raw.split('#', 1)[0].trim();
    if (!line) { if (inRules) { group = null; inRules = false; } continue; }
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || inRules) { group = { agents: [], rules: [], delay: 0 }; groups.push(group); inRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow', 'disallow', 'crawl-delay'].includes(key)) {
      inRules = true;
      if (key === 'crawl-delay') group.delay = Math.max(group.delay, Math.min(3600, Number(value) || 0));
      else group.rules.push({ verb: key, path: value });
    }
  }
  const matching = (name: string) => groups.filter(g => g.agents.includes(name));
  const selected = matching(bot).length ? matching(bot) : matching('*');
  const rules = selected.flatMap(g => g.rules);
  const delaySeconds = selected.reduce((max, g) => Math.max(max, g.delay), 0);
  let bestLength = -1;
  let bestAllow = true;
  for (const rule of rules) {
    if (!rule.path || !robotsRegex(rule.path).test(path)) continue;
    const size = rule.path.replace(/[\\*$]/g, '').length;
    if (size > bestLength || (size === bestLength && rule.verb === 'allow')) {
      bestLength = size;
      bestAllow = rule.verb === 'allow';
    }
  }
  return { allowed: bestAllow, delaySeconds };
}

export function discoverHtmlLinks(seed: URL, pageUrl: URL, html: string): string[] {
  const href = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  const seen = new Set<string>();
  for (const match of html.matchAll(href)) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    const page = scopedDiscoveredUrl(seed, pageUrl, value.replace(/&amp;/gi, '&'));
    if (!page || /\.(?:pdf|jpg|jpeg|png|gif|webp|svg|zip|docx|xlsx|mp4|mp3|webm)$/i.test(page.pathname)) continue;
    seen.add(page.href);
    if (seen.size >= 80) break;
  }
  return [...seen];
}

export function discoverSitemapLinks(seed: URL, from: URL, xml: string): string[] {
  const found = new Set<string>();
  for (const match of xml.matchAll(/<loc>\s*([^<]{1,2048})\s*<\/loc>/gi)) {
    const candidate = scopedDiscoveredUrl(seed, from, match[1].trim().replace(/&amp;/gi, '&'));
    if (candidate && !candidate.pathname.toLowerCase().endsWith('.xml')) found.add(candidate.href);
    if (found.size >= 80) break;
  }
  return [...found];
}

export function readHtmlTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]{0,320}?)<\/title\s*>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim().slice(0, 180) : null;
}
