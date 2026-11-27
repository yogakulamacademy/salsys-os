const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const test = require('node:test');
const assert = require('node:assert/strict');

const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function pure(file) { const module = { exports: {} }; new Function('module', 'exports', compile(read(file)))(module, module.exports); return module.exports; }
const links = pure('lib/dm-links.ts');
const live = pure('lib/autopilot-live.ts');
const runner = ts.createSourceFile('runner.ts', read('lib/ai-autopilot-runner.ts'), ts.ScriptTarget.Latest, true);
const bodies = runner.statements.filter(s => ts.isFunctionDeclaration(s) && ['queueUnopenedLinks', 'followUpOpenedLinks'].includes(s.name?.text)).map(s => s.getText(runner)).join('\n');

function fixture({ stage = 'new', inbound = null, allowed = true, count = 1, scanner = false } = {}) {
  const events = [];
  const now = new Date('2026-11-27T06:00:00Z');
  const sent = '2026-11-26T06:00:00Z';
  const rows = Array.from({ length: count }, (_, i) => ({ id: `link-${i}`, organization_id: 'tenant-a', lead_id: `lead-${i}`, sent_at: sent, first_opened_at: scanner ? sent : null, courses: { name: 'Course' } }));
  const leads = rows.map(l => ({ id: l.lead_id, current_stage: stage, last_inbound_at: inbound, owner_user_id: 'owner' }));
  const admin = { from: table => {
    let mutation = false;
    const q = {};
    for (const method of ['select', 'eq', 'is', 'gte', 'lte', 'gt', 'order', 'limit', 'in', 'not']) q[method] = () => q;
    q.insert = () => { mutation = true; events.push(`write:${table}`); return q; };
    q.update = () => { mutation = true; events.push(`update:${table}`); return q; };
    const result = () => ({ data: mutation ? { id: 'task-id' } : table === 'dm_tracked_links' ? rows : leads, error: null });
    q.maybeSingle = async () => result(); q.then = (yes, no) => Promise.resolve(result()).then(yes, no);
    return q;
  }};
  const globals = { ...links, CLOSED_STAGES: live.CLOSED_STAGES, commercialAdvancedAllowed: async (org, op) => { events.push(`gate:${org}:${op}`); return allowed; } };
  const funcs = new Function(...Object.keys(globals), compile(bodies) + '\nreturn {queueUnopenedLinks,followUpOpenedLinks};')(...Object.values(globals));
  return { funcs, events, ctx: { admin, now, summary: { errors: 0, linkTasks: 0 }, businesses: new Map() } };
}

test('closed and already-replied leads produce neither eligibility RPCs nor task writes', async () => {
  for (const options of [{ stage: 'closed_won' }, { inbound: '2026-11-26T12:00:00Z' }]) {
    const f = fixture(options); await f.funcs.queueUnopenedLinks(f.ctx); assert.deepEqual(f.events, []);
  }
});

test('actionable tasks still require a fresh successful eligibility check immediately before writing', async () => {
  const denied = fixture({ allowed: false }); await denied.funcs.queueUnopenedLinks(denied.ctx);
  assert.deepEqual(denied.events, ['gate:tenant-a:ai_autopilot']);
  const accepted = fixture(); await accepted.funcs.queueUnopenedLinks(accepted.ctx);
  assert.deepEqual(accepted.events, ['gate:tenant-a:ai_autopilot', 'write:tasks', 'update:dm_tracked_links']);
  assert.equal(accepted.ctx.summary.linkTasks, 1);
});

test('the task cap avoids the eleventh eligibility RPC and scanner opens never query eligibility', async () => {
  const capped = fixture({ count: 12 }); await capped.funcs.queueUnopenedLinks(capped.ctx);
  assert.equal(capped.events.filter(e => e.startsWith('gate:')).length, 10);
  assert.equal(capped.events.filter(e => e === 'write:tasks').length, 10);
  const scanner = fixture({ scanner: true }); await scanner.funcs.followUpOpenedLinks(scanner.ctx);
  assert.deepEqual(scanner.events, []);
});
