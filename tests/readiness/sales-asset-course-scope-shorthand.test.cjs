const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20261103215330_sales_asset_course_scope_shorthand_v1.sql',
  ),
  'utf8',
);

test('Sales Asset shorthand normalization is narrow and preserves specialized durations', () => {
  assert.match(migration, /\^\(online\)\?\(200\|300\|500\)h\$/);
  assert.match(migration, /scope_key \|\| 'ytt'/);
  assert.match(migration, /85h prenatal/);
  assert.match(migration, /100h programs/);
  assert.doesNotMatch(migration, /\(100\|200\|300\|500\)h/);
  assert.doesNotMatch(migration, /similarity\s*\(|levenshtein\s*\(|soundex\s*\(|fuzzy/i);
});

test('Sales Asset shorthand helper remains deterministic and non-public', () => {
  assert.match(migration, /create or replace function public\.sales_asset_course_scope_key_v1\(p_value text\)/);
  assert.match(migration, /language sql/);
  assert.match(migration, /immutable/);
  assert.match(migration, /set search_path = pg_catalog/);
  assert.match(
    migration,
    /revoke all on function public\.sales_asset_course_scope_key_v1\(text\)[\s\S]*from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.sales_asset_course_scope_key_v1\(text\)[\s\S]*to authenticated, service_role/,
  );
});
