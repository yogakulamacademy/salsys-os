const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../../components/tracker-snippet.tsx');
const source = fs.readFileSync(filename, 'utf8');

function loadActualSnippetGenerator() {
  const start = source.indexOf('function installSnippet(');
  const end = source.indexOf('\n\nexport function TrackerSnippet()', start);
  assert.ok(start >= 0 && end > start, 'actual tracker snippet generator must exist');

  const generated = ts.transpileModule(
    source.slice(start, end) + '\nmodule.exports = installSnippet;\n',
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
      },
      reportDiagnostics: true,
    },
  );
  assert.equal(generated.diagnostics.length, 0, 'snippet generator must transpile cleanly');

  const context = { module: { exports: null }, encodeURIComponent };
  vm.runInNewContext(generated.outputText, context, { timeout: 2000 });
  assert.equal(typeof context.module.exports, 'function');
  return context.module.exports;
}

test('R2 tracking UI presents only the production consent-required snippet', () => {
  assert.doesNotMatch(source, /testSnippet|Temporary controlled test snippet/);
  assert.doesNotMatch(source, /installSnippet\(selected\.siteId,\s*['"]granted['"]/);
  assert.match(source, /installSnippet\(selected\.siteId,\s*leadCapture\)/);
});

test('R2 actual snippet generator always includes required consent and consent UI', () => {
  const installSnippet = loadActualSnippetGenerator();

  for (const enabled of [false, true]) {
    const html = installSnippet('test-site-anon', enabled);
    assert.equal((html.match(/<script\b/g) || []).length, 2);
    assert.match(html, /data-consent-mode="required"/);
    assert.match(html, /salsys-intelligence\.js/);
    assert.match(html, /salsys-consent\.js/);
    assert.match(html, /data-consent-banner="auto"/);
    assert.doesNotMatch(html, /data-consent-mode="granted"|data-debug="true"/);
    assert.equal(html.includes('data-salsys-lead-capture="auto"'), enabled);
  }
});

test('R2 installation escapes public site ID in query parameters', () => {
  const installSnippet = loadActualSnippetGenerator();
  const html = installSnippet('test-site +1', false);
  assert.match(html, /site_id=test-site%20%2B1/);
  assert.match(html, /data-consent-mode="required"/);
});
