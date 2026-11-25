const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('workspace check never waits on the last_seen_at row lock', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20261125110000_workspace_context_no_lock_wait_v1.sql'), 'utf8');
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /last_seen_at < now\(\) - interval '1 minute'/);
  assert.match(sql, /raise exception 'last_seen_at update not found/);
});
