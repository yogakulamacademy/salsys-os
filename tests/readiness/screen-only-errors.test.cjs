const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const test = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');

function load(file, imports = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)(name => imports[name] ?? require(name), module, module.exports);
  return module.exports;
}
const core = load('lib/error-feedback.ts');
const { withScreenOnlyErrors } = load('lib/error-feedback-middleware.ts', { '@/lib/error-feedback': core });
const origin = 'https://crm.salsysos.com';
const req = (url, options) => new NextRequest(origin + url, options);
const run = async () => NextResponse.next();
const secure = process.env.NODE_ENV === 'production';

test('a legacy error redirects to a clean URL and retains filters, next, and hash', async () => {
  const response = await withScreenOnlyErrors(req('/login?error=Try+again&next=%2Frevenue%3Fmonth%3D11&mode=resend#form'), run);
  const url = new URL(response.headers.get('Location'));
  assert.equal(url.searchParams.has('error'), false);
  assert.equal(url.searchParams.get('next'), '/revenue?month=11');
  assert.equal(url.searchParams.get('mode'), 'resend');
  assert.equal(url.hash, '#form');
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly/i);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
});

test('the next clean request renders existing error props once while auth runs', async () => {
  const cookie = core.encodeErrorFeedback('/login', [['error', 'Try again']]);
  const name = core.errorCookieName('/login', secure);
  let calls = 0;
  const response = await withScreenOnlyErrors(req('/login?next=%2Frevenue', { headers: { cookie: `${name}=${cookie}` } }), async () => { calls++; const r = NextResponse.next(); r.cookies.set('auth-test', 'kept'); return r; });
  assert.equal(calls, 1);
  const internal = new URL(response.headers.get('x-middleware-rewrite'));
  assert.equal(internal.searchParams.get('error'), 'Try again');
  assert.equal(internal.searchParams.get('next'), '/revenue');
  assert.equal(response.headers.get('Location'), null);
  assert.equal(response.headers.get('x-middleware-next'), null);
  assert.equal(response.cookies.get(name).maxAge, 0);
  assert.equal(response.cookies.get('auth-test').value, 'kept');
});

test('feedback never bypasses protected-page authentication', async () => {
  const name = core.errorCookieName('/revenue', secure);
  const cookie = core.encodeErrorFeedback('/revenue', [['error', 'Denied']]);
  const response = await withScreenOnlyErrors(req('/revenue', { headers: { cookie: `${name}=${cookie}` } }), async () => NextResponse.redirect(origin + '/login?next=%2Frevenue'));
  assert.equal(new URL(response.headers.get('Location')).pathname, '/login');
  assert.equal(response.headers.has('x-middleware-rewrite'), false);
});

test('legacy descriptive error keys reach existing page error props', async () => {
  for (const key of ['error_description', 'error_message']) {
    const name = core.errorCookieName('/login', secure);
    const cookie = core.encodeErrorFeedback('/login', [[key, 'Please request a new link.']]);
    const response = await withScreenOnlyErrors(req('/login', {headers:{cookie:`${name}=${cookie}`}}), run);
    assert.equal(new URL(response.headers.get('x-middleware-rewrite')).searchParams.get('error'), 'Please request a new link.');
  }
});

test('middleware auth errors also get clean redirects without losing auth cookies', async () => {
  const response = await withScreenOnlyErrors(req('/revenue'), async () => { const r = NextResponse.redirect(origin + '/login?error=Session+expired'); r.cookies.set('auth-test', '', { maxAge: 0 }); return r; });
  assert.equal(response.headers.get('Location'), origin + '/login');
  assert.equal(response.cookies.get('auth-test').maxAge, 0);
  assert.ok(response.cookies.get(core.errorCookieName('/login', secure)));
});

test('OAuth callbacks and API error parameters stay with their handlers', async () => {
  for (const url of ['/api/integrations/google/callback?error=access_denied', '/auth/callback?error=access_denied', '/signup/verify?error=invalid_grant']) {
    let seen;
    const response = await withScreenOnlyErrors(req(url), async r => { seen = r.url; return NextResponse.next(); });
    assert.equal(seen, origin + url);
    assert.equal(response.headers.get('Location'), null);
  }
});

test('POST, HEAD and prefetch requests do not consume pending feedback', async () => {
  const name = core.errorCookieName('/login', secure);
  const cookie = core.encodeErrorFeedback('/login', [['error', 'Try again']]);
  for (const options of [{ method: 'POST' }, { method: 'HEAD' }, { headers: { 'next-router-prefetch': '1' } }, { headers: { purpose: 'prefetch' } }]) {
    const response = await withScreenOnlyErrors(req('/login', { ...options, headers: { ...options.headers, cookie: `${name}=${cookie}` } }), run);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('x-middleware-rewrite'), null);
  }
});

test('expired, cross-page, malformed and oversized feedback is rejected', () => {
  const now = Date.now();
  const value = core.encodeErrorFeedback('/login', [['error', 'Try again']], now);
  assert.equal(core.decodeErrorFeedback(value, '/signup', now), null);
  assert.equal(core.decodeErrorFeedback(value, '/login', now + 61000), null);
  assert.equal(core.decodeErrorFeedback('bad', '/login'), null);
  assert.equal(core.decodeErrorFeedback('x'.repeat(4000), '/login'), null);
  const unicode = core.encodeErrorFeedback('/login', [['error', '🙂'.repeat(2000)]]);
  assert.ok(unicode.length < 3500);
  assert.ok(core.decodeErrorFeedback(unicode, '/login'));
});
