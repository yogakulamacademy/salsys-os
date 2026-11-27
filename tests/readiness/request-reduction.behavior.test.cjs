const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const test = require('node:test');
const assert = require('node:assert/strict');

function load(file, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('module', 'exports', ...Object.keys(globals), code)(module, module.exports, ...Object.values(globals));
  return module.exports;
}
const { createWorkspaceRequest } = load('lib/workspace-request.ts');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('three overlapping shell consumers make one GET with separately readable bodies', async () => {
  let calls = 0, finish;
  const request = createWorkspaceRequest(async (url, options) => {
    calls++; assert.equal(url, '/api/workspace');
    assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'same-origin');
    return new Promise(resolve => { finish = resolve; });
  });
  const reads = [request(), request(), request()];
  await flush(); assert.equal(calls, 1);
  finish(Response.json({ activeOrganizationId: 'tenant-a' }));
  const values = await Promise.all(reads.map(async read => (await read).json()));
  assert.deepEqual(values, Array(3).fill({ activeOrganizationId: 'tenant-a' }));
});

test('settled workspace data is not reused; another shell has an independent request', async () => {
  let calls = 0;
  const fetcher = async () => Response.json({ revision: ++calls });
  const firstShell = createWorkspaceRequest(fetcher), secondShell = createWorkspaceRequest(fetcher);
  assert.equal((await (await firstShell()).json()).revision, 1);
  assert.equal((await (await firstShell()).json()).revision, 2);
  assert.equal((await (await secondShell()).json()).revision, 3);
});

test('network and HTTP failures retain their semantics and do not poison later reads', async () => {
  let calls = 0;
  const request = createWorkspaceRequest(async () => {
    if (++calls === 1) throw new Error('offline');
    return new Response('denied', { status: 401 });
  });
  const a = request(), b = request();
  await assert.rejects(a, /offline/); await assert.rejects(b, /offline/);
  assert.equal(calls, 1); assert.equal((await request()).status, 401); assert.equal(calls, 2);
});

function pollingEnvironment() {
  let now = 0, id = 0;
  const timers = new Map();
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const window = new EventTarget();
  const navigator = { onLine: true };
  const globals = { document, window, navigator, Date: { now: () => now },
    setTimeout: (fn, ms) => { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout: timer => timers.delete(timer),
  };
  return { ...globals, timers, start: load('lib/visible-polling.ts', globals).startVisiblePolling,
    advance: async ms => {
      now += ms;
      for (const [timer, item] of [...timers]) if (item.at <= now) { timers.delete(timer); item.fn(); }
      await flush();
    },
    visibility: async state => { document.visibilityState = state; document.dispatchEvent(new Event('visibilitychange')); await flush(); },
  };
}

test('hidden tabs make no alert reads and resume once when due', async () => {
  const env = pollingEnvironment(); let calls = 0;
  await env.visibility('hidden');
  const stop = env.start(async () => { calls++; }, 60000);
  await env.advance(3600000); assert.equal(calls, 0);
  await env.visibility('visible'); assert.equal(calls, 1);
  env.window.dispatchEvent(new Event('focus')); await flush(); assert.equal(calls, 1);
  await env.advance(60000); assert.equal(calls, 2);
  await env.visibility('hidden'); await env.advance(3600000); assert.equal(calls, 2);
  stop(); await env.visibility('visible'); assert.equal(calls, 2); assert.equal(env.timers.size, 0);
});

test('slow requests do not overlap; visible/focus/online bursts do not duplicate them', async () => {
  const env = pollingEnvironment(); let calls = 0, finish;
  const stop = env.start(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, 25000);
  await env.advance(120000);
  env.window.dispatchEvent(new Event('focus')); env.window.dispatchEvent(new Event('online'));
  assert.equal(calls, 1);
  finish(); await flush(); await env.advance(24999); assert.equal(calls, 1);
  await env.advance(1); assert.equal(calls, 2);
  stop(); finish(); await flush(); assert.equal(env.timers.size, 0);
});

test('disabled feeds stop, offline feeds pause, and rejected reads retry at the normal interval', async () => {
  const disabled = pollingEnvironment(); let disabledCalls = 0;
  disabled.start(async () => { disabledCalls++; return false; }, 25000); await flush();
  await disabled.advance(60000); disabled.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(disabledCalls, 1); assert.equal(disabled.timers.size, 0);
  const env = pollingEnvironment(); env.navigator.onLine = false; let calls = 0;
  const stop = env.start(async () => { calls++; throw new Error('unavailable'); }, 25000);
  await env.advance(60000); assert.equal(calls, 0);
  env.navigator.onLine = true; env.window.dispatchEvent(new Event('online')); await flush(); assert.equal(calls, 1);
  await env.advance(25000); assert.equal(calls, 2);
  stop(); assert.equal(env.timers.size, 0);
});
