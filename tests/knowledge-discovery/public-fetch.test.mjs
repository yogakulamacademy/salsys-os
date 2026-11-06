import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = resolve('lib/knowledge-discovery/public-fetch.ts');
const policyPath = pathToFileURL(resolve('lib/knowledge-discovery/url-policy.ts')).href;
const dir = await mkdtemp(join(tmpdir(), 'salsys-kb-fetch-'));
let source = await readFile(sourcePath, 'utf8');
assert.ok(source.includes("from './url-policy'"), 'Source import moved; review test harness.');
source = source.replace("from './url-policy'", "from '" + policyPath + "'");
const tempFile = join(dir, 'public-fetch.ts');
await writeFile(tempFile, source, 'utf8');
const { evaluateRobots, discoverHtmlLinks, discoverSitemapLinks, readHtmlTitle } =
  await import(pathToFileURL(tempFile).href);
test.after(async () => { await rm(dir, { recursive: true, force: true }); });

test('robots rules respect longest matching allow and specific bot groups', () => {
  const robots = [
    'User-agent: *', 'Disallow: /private', 'Allow: /private/public',
    '', 'User-agent: SalsysOSKnowledgeBot', 'Disallow: /staff',
    'Allow: /staff/public', 'Crawl-delay: 3',
  ].join('\n');
  assert.deepEqual(evaluateRobots(robots, '/staff/list'), { allowed: false, delaySeconds: 3 });
  assert.deepEqual(evaluateRobots(robots, '/staff/public/help'), { allowed: true, delaySeconds: 3 });
  assert.deepEqual(evaluateRobots(robots, '/private', 'otherbot'), { allowed: false, delaySeconds: 0 });
  assert.deepEqual(evaluateRobots(robots, '/private/public', 'otherbot'), { allowed: true, delaySeconds: 0 });
});

test('discovered links stay on domain and remove query tracking', () => {
  const seed = new URL('https://yogakulam.com/');
  const page = new URL('https://www.yogakulam.com/courses/');
  const html = '<title>Sample</title>'
    + '<a href="/about?utm_source=abc">About</a>'
    + '<a href="https://evil-yogakulam.com/">Bad</a>'
    + '<a href="javascript:alert(1)">Unsafe</a>'
    + '<a href="/about#section">Duplicate</a>'
    + '<a href="/guide.pdf">PDF</a>';
  assert.deepEqual(discoverHtmlLinks(seed, page, html), ['https://www.yogakulam.com/about']);
  assert.equal(readHtmlTitle('<title>  Courses  &amp;  Teachers </title>'), 'Courses &amp; Teachers');
});

test('sitemap extracts same-site locations and ignores nested XML', () => {
  const seed = new URL('https://yogakulam.com/');
  const sitemap = '<urlset><url><loc>https://yogakulam.com/a?a=2</loc></url>'
    + '<url><loc>https://other.site/b</loc></url>'
    + '<loc>https://yogakulam.com/extra.xml</loc></urlset>';
  assert.deepEqual(discoverSitemapLinks(seed, seed, sitemap), ['https://yogakulam.com/a']);
});
