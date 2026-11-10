'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const typescript = require('typescript');

const root = path.resolve(__dirname, '../..');
const helper = fs.readFileSync(path.join(root, 'lib/dashboard-period-pagination.ts'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'lib/dashboard-period-data.ts'), 'utf8');

function loadHelper() {
  const result = typescript.transpileModule(helper, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  new Function('module', 'exports', result.outputText)(module, module.exports);
  return module.exports;
}

const { fetchCompleteDashboardPeriodRows, DASHBOARD_PERIOD_PAGE_SIZE } = loadHelper();

test('reads all 1,148 YTD rows rather than stopping at the first 1,000', async () => {
  const sourceRows = Array.from({ length: 1148 }, (_, id) => ({ id }));
  const requests = [];
  const result = await fetchCompleteDashboardPeriodRows(async (from, to) => {
    requests.push([from, to]);
    return { data: sourceRows.slice(from, to + 1), error: null };
  });

  assert.equal(DASHBOARD_PERIOD_PAGE_SIZE, 500);
  assert.equal(result.error, null);
  assert.equal(result.data.length, 1148);
  assert.equal(result.data[1000].id, 1000);
  assert.deepEqual(requests, [[0, 499], [500, 999], [1000, 1499]]);
});

test('an exact multiple of the page size requires the next empty page', async () => {
  const rows = Array.from({ length: 1000 }, (_, id) => id);
  const pages = [];
  const result = await fetchCompleteDashboardPeriodRows(async (from, to) => {
    pages.push(from);
    return { data: rows.slice(from, to + 1), error: null };
  });

  assert.equal(result.error, null);
  assert.equal(result.data.length, 1000);
  assert.deepEqual(pages, [0, 500, 1000]);
});

test('a later-page error discards earlier partial results', async () => {
  const result = await fetchCompleteDashboardPeriodRows(async (from) => {
    if (from === 0) return { data: Array.from({ length: 500 }, (_, id) => id), error: null };
    return { data: null, error: { message: 'temporary API failure' } };
  });
  assert.deepEqual(result.data, []);
  assert.match(result.error.message, /temporary API failure/);
});

test('missing, oversized and over-limit pages fail closed', async () => {
  const missing = await fetchCompleteDashboardPeriodRows(async () => ({ data: null, error: null }));
  const oversized = await fetchCompleteDashboardPeriodRows(async () => ({
    data: Array.from({ length: 501 }, (_, id) => id),
    error: null,
  }));
  const tooMany = await fetchCompleteDashboardPeriodRows(async () => ({
    data: Array.from({ length: 500 }, (_, id) => id),
    error: null,
  }));
  for (const result of [missing, oversized, tooMany]) {
    assert.deepEqual(result.data, []);
    assert.ok(result.error);
  }
});

test('all three analytics queries remain scoped to tenant and date before pagination', () => {
  assert.equal((dashboard.match(/fetchCompleteDashboardPeriodRows</g) || []).length, 4); // import + 3 query calls
  assert.equal((dashboard.match(/\.range\(from, to\)/g) || []).length, 3);
  assert.equal((dashboard.match(/\.order\("id", \{ ascending: true \}\)/g) || []).length, 3);
  for (const table of ['leads', 'payments', 'lead_stage_history']) {
    assert.match(dashboard, new RegExp('\\.from\\("' + table + '"\\)'));
  }
  assert.equal((dashboard.match(/\.eq\("organization_id", organizationId\)/g) || []).length, 2);
  assert.match(dashboard, /\.eq\("lead\.organization_id", organizationId\)/);
  assert.match(dashboard, /\.neq\("status", "archived"\)/);
  assert.match(dashboard, /\.gte\("created_at", period\.previousStartIso\)/);
  assert.match(dashboard, /\.lt\("created_at", period\.endExclusiveIso\)/);
  assert.doesNotMatch(dashboard, /createAdminClient|service_role/);
});
