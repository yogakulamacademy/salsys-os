import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium, expect } from '@playwright/test';

const require = createRequire(import.meta.url);
const origin = 'https://fixture.example';

async function bundleImportCentre() {
  const output = resolve('test-results');
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(join(output, 'kb-browser-'));
  const entry = join(directory, 'entry.js');
  await writeFile(entry, `
    import { createElement } from 'react';
    import { createRoot } from 'react-dom/client';
    import { KnowledgeImportCentrePollingReview } from '@/components/knowledge-import-centre-polling-review';
    const root = document.getElementById('root');
    createRoot(root).render(createElement(KnowledgeImportCentrePollingReview, { scopeKey: root.dataset.scope }));
  `);
  const webpack = require('next/dist/compiled/webpack/webpack');
  webpack.init();
  await new Promise((ok, fail) => webpack.webpack({
    entry, mode: 'development', devtool: false,
    output: { path: directory, filename: 'browser.js' },
    resolve: { alias: { '@': process.cwd() }, modules: [resolve('node_modules')], extensions: ['.tsx', '.ts', '.js'] },
    module: { rules: [{ test: /\.(tsx?|css)$/, use: resolve('tests/provider/knowledge-import-browser-loader.cjs') }] },
  }, (error, stats) => error || stats.hasErrors() ? fail(error || Error(stats.toString({ all: false, errors: true }))) : ok()));
  return readFile(join(directory, 'browser.js'));
}

// Only the outer page shell is supplied here. All requests from the actual Import
// Centre go through the real cookie-authenticated server composition in the fixture.
export async function openKnowledgeImportBrowser({ cookies, resolveScope, handle, reserve, bytes, readDraft }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const script = await bundleImportCentre();
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    let jobId;
    await page.context().addCookies([...cookies].map(([name, value]) => ({ name, value, url: origin, httpOnly: true, secure: true, sameSite: 'Lax' })));
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'application/javascript', body: script });
      const headers = await request.allHeaders();
      if (url.pathname === '/settings/knowledge') {
        const scope = await resolveScope(headers.cookie);
        if (!/^[0-9a-f]{64}$/.test(scope ?? '')) return route.fulfill({ status: 401 });
        if (url.searchParams.get('status') === 'draft') {
          const found = await readDraft(headers.cookie);
          return route.fulfill({ contentType: 'text/html', body: found ? '<h1>Imported draft is ready for review</h1>' : '<h1>Draft unavailable</h1>' });
        }
        return route.fulfill({ contentType: 'text/html', body: `<main id="root" data-scope="${scope}"></main><script src="/app.js"></script>` });
      }
      if (!url.pathname.startsWith('/api/knowledge-import-review/')) return route.abort();
      const [, , , id, operation] = url.pathname.split('/');
      if (operation === 'reserve') {
        jobId = id;
        reserve(id);
      }
      const body = request.postDataBuffer();
      const response = await handle(new Request(url, { method: request.method(), headers, body: body ?? undefined }));
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await page.goto(`${origin}/settings/knowledge`);
    const centre = page.getByRole('region', { name: 'Knowledge Import Centre' });
    await centre.getByLabel('Choose JSON file').setInputFiles({ name: 'browser-fixture.json', mimeType: 'application/json', buffer: bytes });
    await centre.getByRole('button', { name: 'Start import' }).click();
    await expect(centre.getByText(/Upload received/)).toBeVisible({ timeout: 30000 });
    assert.ok(jobId);
    const job = centre.getByRole('article').filter({ hasText: `Import ${jobId.slice(0, 8)}` });
    await expect(job.getByText('Queued', { exact: true })).toBeVisible();
    return {
      async verifyDraftReview() {
        await expect(job.getByText('Completed', { exact: true })).toBeVisible({ timeout: 15000 });
        const review = centre.getByRole('link', { name: 'View latest drafts' });
        assert.equal(await review.getAttribute('href'), '/settings/knowledge?status=draft#knowledge-library');
        await review.click();
        await expect(page.getByRole('heading', { name: 'Imported draft is ready for review' })).toBeVisible();
      },
      close: () => browser.close(),
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
