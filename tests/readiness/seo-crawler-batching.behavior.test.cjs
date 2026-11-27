const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleValue = { exports: {} };
new Function('module', 'exports', compile(source('supabase/functions/seo-crawler/target-writes.ts')))(moduleValue, moduleValue.exports);
const { persistDiscoveredTargets, TARGET_BATCH_SIZE } = moduleValue.exports;
const context = { organizationId: 'org-a', siteId: 'site-a', runId: 'run-a', sourcePageId: 'source-a', depth: 0, httpStatus: 200, seenAt: '2026-11-27T06:00:00Z' };
const link = (n, extra = {}) => ({ scope: 'internal', normalized: `https://example.com/course/${n}`, url: `https://example.com/course/${n}?utm_source=fixture`, ...extra });
const asset = p => /\.(png|pdf)$/i.test(p);

function database({ failAt = 0, omitId = false } = {}) {
  const calls = [], pages = new Map(), frontier = new Map();
  const client = { from: table => ({ upsert: (rows, options) => {
    const operation = { table, rows, options }; calls.push(operation);
    const result = () => {
      if (calls.indexOf(operation) + 1 === failAt) return { data: null, error: { message: 'synthetic write failure' } };
      if (table === 'seo_pages') {
        for (const row of rows) if (!pages.has(row.normalized_url)) pages.set(row.normalized_url, { id: `page-${pages.size}`, normalized_url: row.normalized_url });
        const data = rows.map(row => pages.get(row.normalized_url)).reverse();
        return { data: omitId ? data.slice(1) : data, error: null };
      }
      for (const row of rows) if (!frontier.has(row.normalized_url)) frontier.set(row.normalized_url, { ...row, status: 'queued' });
      return { data: null, error: null };
    };
    return { select: async () => result(), then: (yes, no) => Promise.resolve(result()).then(yes, no) };
  } }) };
  return { client, calls, pages, frontier };
}

test('400 link records to 200 destinations use two bulk writes and IDs are mapped by URL', async () => {
  const db = database();
  const evidence = Array.from({ length: 400 }, (_, i) => link(i % 200, { anchor: `Anchor ${i}` }));
  const ids = await persistDiscoveredTargets(db.client, evidence, context, asset);
  assert.equal(db.calls.length, 2); assert.equal(db.calls[0].rows.length, 200);
  assert.equal(ids.size, 200); assert.equal(db.frontier.size, 200); assert.equal(evidence.length, 400);
  for (const record of evidence) assert.equal(ids.get(record.normalized), db.pages.get(record.normalized).id);
  for (const call of db.calls) for (const row of call.rows) { assert.equal(row.organization_id, 'org-a'); assert.equal(row.site_id, 'site-a'); }
  assert.equal(db.calls[1].options.ignoreDuplicates, true);
  assert.equal(db.calls[0].options.onConflict, 'organization_id,site_id,normalized_url');
});

test('large discovery sets are chunked and retries retain existing queue state and identity', async () => {
  const db = database(); const evidence = Array.from({ length: 451 }, (_, i) => link(i));
  const ids = await persistDiscoveredTargets(db.client, evidence, context, asset);
  assert.equal(db.calls.length, 6); assert.ok(db.calls.every(c => c.rows.length <= TARGET_BATCH_SIZE));
  db.frontier.get(link(0).normalized).status = 'done';
  await persistDiscoveredTargets(db.client, evidence, context, asset);
  assert.equal(db.pages.size, 451); assert.equal(db.frontier.size, 451);
  assert.equal(db.frontier.get(link(0).normalized).status, 'done');
  assert.equal(ids.get(link(0).normalized), db.pages.get(link(0).normalized).id);
});

test('external links are evidence only; assets, depth limits and broken-page guards retain their behavior', async () => {
  const external = link(1, { scope: 'external', normalized: 'https://external.test/page' });
  const image = link(2, { normalized: 'https://example.com/image.png' });
  const db = database(); await persistDiscoveredTargets(db.client, [external, image, link(3)], context, asset);
  assert.equal(db.pages.size, 2); assert.equal(db.frontier.size, 1);
  for (const override of [{ depth: 10 }, { httpStatus: 404 }, { httpStatus: 503 }]) {
    const restricted = database(); await persistDiscoveredTargets(restricted.client, [link(1)], { ...context, ...override }, asset);
    assert.equal(restricted.pages.size, 1); assert.equal(restricted.frontier.size, 0);
  }
  const empty = database(); await persistDiscoveredTargets(empty.client, [external], context, asset); assert.equal(empty.calls.length, 0);
});

test('write failures and incomplete returned IDs fail explicitly; partial writes can be safely retried', async () => {
  for (const failAt of [1, 2, 3]) {
    const db = database({ failAt }); const evidence = Array.from({ length: 201 }, (_, i) => link(i));
    await assert.rejects(persistDiscoveredTargets(db.client, evidence, context, asset), /synthetic write failure/);
    const before = db.pages.size;
    assert.ok(before <= 201);
    await persistDiscoveredTargets(db.client, evidence, context, asset);
    assert.equal(db.pages.size, 201); assert.equal(db.frontier.size, 201);
  }
  const missing = database({ omitId: true });
  await assert.rejects(persistDiscoveredTargets(missing.client, [link(1)], context, asset), /IDs were not fully returned/);
  assert.equal(missing.frontier.size, 0);
});

async function runCrawler({ denied = false, failTargets = false, html = '<a href="/one">First</a><a href="/one" rel="nofollow">Second</a><a href="/image.png">Image</a><a href="https://external.test/x">External</a>' } = {}) {
    let handler; const events = [], pageRows = new Map(); let storedLinks = [];
    const service = { from: table => {
      const q = { table, mode: 'read', value: null, filters: [] };
      for (const method of ['eq', 'is', 'order', 'limit']) q[method] = (...args) => { q.filters.push([method, ...args]); return q; };
      q.select = () => q;
      for (const method of ['insert', 'upsert', 'delete', 'update']) q[method] = value => { q.mode = method; q.value = value; return q; };
      const result = () => {
        events.push({ table, mode: q.mode, value: q.value });
        if (q.mode === 'read') {
          if (table === 'seo_crawl_runs') return { data: { id: 'run-a', organization_id: 'org-a', site_id: 'site-a', max_pages: 50 } };
          if (table === 'organization_members') return { data: denied ? null : { organization_id: 'org-a' } };
          if (table === 'organization_sites') return { data: { id: 'site-a', organization_id: 'org-a', hostname: 'example.com' } };
          if (table === 'seo_crawl_frontier') return { data: { id: 'queue-a', url: 'https://example.com/', depth: 0, attempt_count: 0 }, count: 0 };
        }
        if (table === 'seo_pages' && q.mode === 'upsert') {
          if (Array.isArray(q.value)) {
            if (failTargets) return { data: null, error: { message: 'synthetic target failure' } };
            return { data: q.value.map(row => { if (!pageRows.has(row.normalized_url)) pageRows.set(row.normalized_url, { id: `target-${pageRows.size}`, normalized_url: row.normalized_url }); return pageRows.get(row.normalized_url); }) };
          }
          return { data: { id: 'source-a' } };
        }
        if (table === 'seo_page_links' && q.mode === 'insert') storedLinks = q.value;
        return { data: null, error: null, count: 0 };
      };
      q.single = q.maybeSingle = async () => result(); q.then = (yes, no) => Promise.resolve(result()).then(yes, no);
      return q;
    }};
    const client = { auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }) } };
    const createClient = (_url, key) => key === 'service-fixture' ? service : client;
    const requireModule = name => name.includes('target-writes') ? moduleValue.exports : name.includes('supabase-js') ? { createClient } : {};
    const Deno = { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service-fixture' : 'fixture' }, serve: value => { handler = value; } };
    new Function('require', 'exports', 'Deno', 'fetch', compile(source('supabase/functions/seo-crawler/index.ts')))(requireModule, {}, Deno, async () => new Response(html, { headers: { 'content-type': 'text/html' } }));
    const response = await handler(new Request('https://crawler.test', { method: 'POST', headers: { authorization: 'Bearer synthetic-fixture', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'resume', runId: 'run-a', pageBudget: 1 }) }));
    return { response, events, storedLinks };
  }
test('actual crawler entrypoint retains distinct anchors/rel, scope guards and failure state', async () => {
  const ok = await runCrawler(); assert.equal(ok.response.status, 200); assert.equal(ok.storedLinks.length, 4);
  assert.deepEqual(ok.storedLinks.slice(0, 2).map(l => l.anchor_text), ['First', 'Second']);
  assert.equal(ok.storedLinks[0].target_page_id, ok.storedLinks[1].target_page_id);
  assert.equal(ok.storedLinks[1].is_nofollow, true); assert.equal(ok.storedLinks[3].target_page_id, null);
  const queue = ok.events.find(e => e.table === 'seo_crawl_frontier' && e.mode === 'upsert'); assert.equal(queue.value.length, 1);
  const denied = await runCrawler({ denied: true }); assert.equal(denied.response.status, 403); assert.ok(denied.events.every(e => e.mode === 'read'));
  const failed = await runCrawler({ failTargets: true }); assert.equal(failed.storedLinks.length, 0);
  assert.ok(failed.events.some(e => e.table === 'seo_crawl_frontier' && e.mode === 'update' && e.value.status === 'failed'));
  assert.ok(!failed.events.some(e => e.table === 'seo_crawl_frontier' && e.mode === 'update' && e.value.status === 'done'));
});

test('crawler text decodes entities once and preserves nested encodings in titles, text and anchors', async () => {
  const nested = 'A &amp;lt; B &amp;amp; C &AMP;gt; D &amp;#39;';
  const result = await runCrawler({ html: `<title>${nested}</title><p>&nbsp;&lt;tag&gt; &quot;ok&quot; &#39;yes&#39; &AMP; &unknown;</p><a href="/one">${nested}</a><script>hidden()</script><style>.hidden{}</style>` });
  assert.equal(result.response.status, 200);
  const snapshot = result.events.find(e => e.table === 'seo_page_snapshots' && e.mode === 'upsert').value;
  const decodedOnce = 'A &lt; B &amp; C &gt; D &#39;';
  assert.equal(snapshot.title, decodedOnce);
  assert.equal(result.storedLinks[0].anchor_text, decodedOnce);
  assert.equal(snapshot.readable_text, `${decodedOnce} <tag> "ok" 'yes' & &unknown; ${decodedOnce}`);
});
