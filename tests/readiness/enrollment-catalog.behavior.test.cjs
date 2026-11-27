const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const test = require('node:test');
const assert = require('node:assert/strict');
function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => name === 'server-only' ? {} : imports[name] ?? require(name), module, module.exports, ...Object.values(globals));
  return module.exports;
}
const data = load('lib/enrollment-panel-data.ts');
const leadId = '80000000-0000-4000-8000-000000000001';
function database({ enrolled = false, visible = true, admin = false, owner = 'user-a', user = 'user-a', fail = '' } = {}) {
  const queries = [];
  const lead = { id: leadId, organization_id: 'org-a', owner_user_id: owner, interested_course_id: 'course-a', potential_value: 90000, potential_currency: 'INR' };
  const rows = {
    leads: visible ? [lead] : [],
    courses: [{ id: 'course-a', organization_id: 'org-a', name: 'Archived course', active: false }, { id: 'course-b', organization_id: 'org-a', name: 'Active course', active: true }],
    course_batches: [{ id: 'batch-a', organization_id: 'org-a', course_id: 'course-a', start_date: '2020-01-01', location: 'Old batch' }, { id: 'batch-b', organization_id: 'org-a', course_id: 'course-b', start_date: '2099-01-01', location: 'New batch' }],
    enrollments: enrolled ? [{ id: 'enrollment-a', course_id: 'course-a', batch_id: 'batch-a', lead_id: leadId, status: 'confirmed', total_value: '90000', currency: 'INR', metadata: {} }] : [],
    payments: enrolled ? [{ id: 'paid-a', enrollment_id: 'enrollment-a', lead_id: leadId, amount: '20000.50', currency: 'INR', status: 'paid', payment_kind: 'deposit' }, { id: 'pending-a', enrollment_id: 'enrollment-a', lead_id: leadId, amount: '10000.25', currency: 'INR', status: 'pending', payment_kind: 'balance' }] : [],
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) },
    rpc: async (name, args) => { queries.push({ table: name, args }); return { data: admin, error: fail === 'role' ? { message: 'unavailable' } : null }; },
    from: table => {
      const record = { table, filters: [] }; queries.push(record); const q = {};
      q.select = columns => { record.columns = columns; return q; };
      for (const method of ['eq', 'gte', 'in', 'order', 'limit']) q[method] = (...args) => { record.filters.push([method, ...args]); return q; };
      const result = single => {
        if (table === fail) return { data: null, error: { message: 'synthetic unavailable' } };
        const found = (rows[table] ?? []).filter(row => record.filters.every(([method, key, value]) => method === 'eq' ? row[key] === value : method === 'in' ? value.includes(row[key]) : method === 'gte' ? row[key] >= value : true));
        return { data: single ? found[0] ?? null : found, error: null };
      };
      q.maybeSingle = async () => result(true); q.then = (yes, no) => Promise.resolve(result(false)).then(yes, no); return q;
    },
  };
  return { client, queries, rows };
}

test('an unopened enrollment form makes no catalog/course-batch reads for a lead with no enrollment', async () => {
  const f = database(); const panel = await data.getEnrollmentPanel(f.client, leadId, 'user-a');
  assert.equal(panel.canRecord, true); assert.equal(panel.defaults.total, 90000);
  assert.deepEqual(panel.courses, []); assert.deepEqual(panel.batches, []);
  assert.ok(!f.queries.some(q => q.table === 'courses' || q.table === 'course_batches'));
});

test('existing records use only referenced IDs, retaining old batch/course labels and exact paid totals', async () => {
  const f = database({ enrolled: true }); const panel = await data.getEnrollmentPanel(f.client, leadId, 'user-a');
  assert.equal(panel.enrollments[0].courseName, 'Archived course');
  assert.match(panel.enrollments[0].batchLabel, /2020.*Old batch/);
  assert.equal(panel.enrollments[0].paidVerified, 20000.5); assert.equal(panel.enrollments[0].paidPending, 10000.25);
  const batches = f.queries.find(q => q.table === 'course_batches');
  assert.ok(batches.filters.some(f => f[0] === 'in' && f[1] === 'id' && f[2][0] === 'batch-a'));
  assert.ok(!batches.filters.some(f => f[0] === 'gte' || f[0] === 'limit'));
  for (const q of f.queries.filter(q => ['courses', 'course_batches'].includes(q.table))) assert.ok(q.filters.some(f => f[0] === 'eq' && f[1] === 'organization_id' && f[2] === 'org-a'));
});

test('catalog access fails closed for invisible leads, unassigned viewers and failed role verification', async () => {
  for (const options of [{ visible: false }, { owner: 'someone-else' }, { owner: null }]) {
    const f = database(options); assert.equal(await data.getEnrollmentCatalog(f.client, leadId, 'user-a'), null);
    assert.ok(!f.queries.some(q => q.table === 'courses' || q.table === 'course_batches'));
  }
  const failed = database({ fail: 'role' }); await assert.rejects(data.getEnrollmentCatalog(failed.client, leadId, 'user-a'), /verify enrollment access/);
  assert.ok(!failed.queries.some(q => q.table === 'course_batches'));
  const unassigned = database({ owner: null });
  assert.equal(await data.getEnrollmentCatalog(unassigned.client, leadId, ''), null);
});

test('enrollments without a course do not send invalid UUID filters or hide valid course labels', async () => {
  const f = database({ enrolled: true });
  f.rows.enrollments.push({ id: 'no-course', lead_id: leadId, course_id: null, batch_id: null, status: 'pending' });
  const panel = await data.getEnrollmentPanel(f.client, leadId, 'user-a');
  assert.equal(panel.enrollments[0].courseName, 'Archived course'); assert.equal(panel.enrollments[1].courseName, 'Course');
  const q = f.queries.find(q => q.table === 'courses');
  assert.deepEqual(q.filters.find(f => f[0] === 'in')[2], ['course-a']);
});

test('owner/admin catalog reads retain active-course filtering, tenant scope and the existing date/300 bounds', async () => {
  for (const options of [{}, { admin: true, owner: 'other' }]) {
    const f = database(options); const catalog = await data.getEnrollmentCatalog(f.client, leadId, 'user-a');
    assert.deepEqual(catalog.courses, [{ id: 'course-b', name: 'Active course' }]);
    assert.equal(catalog.batches.length, 1); assert.equal(catalog.batches[0].courseId, 'course-b');
    const q = f.queries.find(q => q.table === 'course_batches');
    assert.ok(q.filters.some(f => f[0] === 'limit' && f[1] === 300)); assert.ok(q.filters.some(f => f[0] === 'gte' && f[1] === 'start_date'));
  }
  const failed = database({ fail: 'course_batches' }); await assert.rejects(data.getEnrollmentCatalog(failed.client, leadId, 'user-a'), /could not be loaded/);
});

test('actual GET route returns 400/401/403/503 and private no-store responses without exposing choices', async () => {
  async function get(options, id = leadId) {
    const f = database(options);
    const { GET } = load('app/api/leads/[id]/enrollment-catalog/route.ts', { '@/lib/supabase/server': { createClient: async () => f.client }, '@/lib/enrollment-panel-data': data });
    return { response: await GET(new Request('https://fixture.test/catalog'), { params: Promise.resolve({ id }) }), queries: f.queries };
  }
  assert.equal((await get({}, 'not-an-id')).response.status, 400);
  for (const [options, status] of [[{ user: null }, 401], [{ owner: 'other' }, 403], [{ fail: 'course_batches' }, 503]]) {
    const { response } = await get(options); assert.equal(response.status, status); assert.match(response.headers.get('Cache-Control'), /private, no-store/);
    assert.equal((await response.json()).courses, undefined);
  }
  const { response } = await get({}); assert.equal(response.status, 200); assert.equal((await response.json()).courses.length, 1);
});

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function component() {
  const state = [], effects = [], calls = []; let cursor = 0;
  const react = {
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef: initial => { const index = cursor++; return state[index] ?? (state[index] = { current: initial }); },
    useEffect: effect => { const index = cursor++; if (!(index in state)) { state[index] = true; effects.push(effect()); } },
    useTransition: () => [false, fn => fn()],
  };
  const fetch = (url, options) => new Promise((resolve, reject) => { calls.push({ url, options, resolve }); options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); });
  const { InboxEnrollment } = load('components/inbox-enrollment.tsx', { react, '@/components/use-feedback-messages': { useFeedbackMessages() {} }, '@/app/enrollments/payment-actions': { recordEnrollmentAction() { throw Error('No mutation expected'); }, logEnrollmentPaymentAction() { throw Error('No mutation expected'); } } }, { fetch });
  const panel = { canRecord: true, isAdmin: false, ownerAssigned: true, courses: [], batches: [], defaults: { courseId: 'course-a', total: 90000, currency: 'INR' }, enrollments: [] };
  const render = () => { cursor = 0; return InboxEnrollment({ leadId, panel }); };
  function nodes(tree, check) { if (!tree) return []; if (Array.isArray(tree)) return tree.flatMap(t => nodes(t, check)); if (typeof tree !== 'object') return []; return [...(check(tree) ? [tree] : []), ...nodes(tree.props?.children, check)]; }
  const text = tree => !tree ? '' : Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
  const button = (tree, name) => nodes(tree, n => n.type === 'button' && text(n).includes(name))[0];
  return { render, calls, nodes, button, text, unmount: () => effects.forEach(f => f?.()) };
}
const choices = { courses: [{ id: 'course-a', name: 'Course A' }], batches: [{ id: 'batch-a', courseId: 'course-a', label: 'Sample batch' }] };

test('actual form requests no choices at mount, one on open, and prevents save until loaded', async () => {
  const c = component(); let tree = c.render(); assert.equal(c.calls.length, 0);
  c.button(tree, 'Mark enrolled').props.onClick(); tree = c.render(); assert.equal(c.calls.length, 1);
  assert.equal(c.button(tree, 'Save enrolment').props.disabled, true);
  assert.match(c.calls[0].url, /enrollment-catalog$/); assert.equal(c.calls[0].options.cache, 'no-store');
  c.calls[0].resolve({ ok: true, json: async () => choices }); await flush(); tree = c.render();
  assert.ok(c.text(tree).includes('Course A')); assert.ok(c.text(tree).includes('Sample batch'));
  c.nodes(tree, n => n.type === 'input' && n.props.value === 'unpaid')[0].props.onChange(); tree = c.render();
  assert.equal(c.button(tree, 'Save enrolment').props.disabled, false); c.unmount();
});

test('failed loading exposes Retry, prevents duplicate retries and refreshes choices on reopen', async () => {
  const c = component(); c.button(c.render(), 'Mark enrolled').props.onClick();
  c.calls[0].resolve({ ok: false, json: async () => ({ error: 'Choices temporarily unavailable' }) }); await flush();
  let tree = c.render(); assert.ok(c.text(tree).includes('Choices temporarily unavailable')); assert.equal(c.button(tree, 'Save enrolment').props.disabled, true);
  const retry = c.button(tree, 'Retry loading choices'); retry.props.onClick(); retry.props.onClick(); assert.equal(c.calls.length, 2);
  c.calls[1].resolve({ ok: true, json: async () => choices }); await flush(); tree = c.render();
  c.button(tree, 'Cancel').props.onClick(); c.button(c.render(), 'Mark enrolled').props.onClick(); assert.equal(c.calls.length, 3); c.unmount();
});

test('closing cancels an outstanding read and its stale response cannot replace reopened form choices', async () => {
  const c = component(); c.button(c.render(), 'Mark enrolled').props.onClick();
  c.button(c.render(), 'Cancel').props.onClick(); assert.equal(c.calls[0].options.signal.aborted, true);
  c.button(c.render(), 'Mark enrolled').props.onClick();
  c.calls[0].resolve({ ok: true, json: async () => ({ courses: [{ id: 'old', name: 'Stale choices' }], batches: [] }) });
  c.calls[1].resolve({ ok: true, json: async () => choices }); await flush();
  const tree = c.render(); assert.ok(!c.text(tree).includes('Stale choices')); assert.ok(c.text(tree).includes('Course A')); c.unmount();
});
