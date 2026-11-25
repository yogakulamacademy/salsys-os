const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

test('Inbox load fix: access worked out once per call, waiting counted in the database', () => {
  const a = read('supabase/migrations/20261125140000_inbox_access_once_per_call_v1.sql');
  assert.match(a, /v_row_old text := 'and public\.can_access_lead\(o\.id\)'/);
  assert.match(a, /v_access_role in \(''owner'', ''admin'', ''manager''\) or \(v_access_role = ''member'' and o\.owner_user_id = auth\.uid\(\)\)/);
  assert.match(a, /p_organization_id = public\.current_tenant_organization_id\(\)/);
  const w = read('supabase/migrations/20261125141000_inbox_waiting_in_one_call_v1.sql');
  assert.match(w, /''waitingWeek''/);
  assert.match(w, /''waiting'', ''older''/);
});

test('Inbox load fix: no refresh storms', () => {
  assert.match(read('components/conversations-sidebar.tsx'), /prefetch=\{false\}/);
  assert.match(read('components/toast-form.tsx'), /refresh = false/);
  const live = read('components/live-refresh.tsx');
  assert.doesNotMatch(live, /prefixes: \['\/conversations'\]/);
  assert.match(live, /MIN_REFRESH_INTERVAL_MS = 10_000/);
  const rt = read('components/conversations-realtime.tsx');
  assert.match(rt, /MIN_REFRESH_INTERVAL_MS = 15_000/);
  assert.match(rt, /!isLive\(message\.created_at\)/);
});
