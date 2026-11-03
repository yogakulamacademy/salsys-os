const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20261103215230_sales_asset_course_scope_normalization_v1.sql',
  ),
  'utf8',
);

test('Sales Asset course scope normalization is deterministic rather than fuzzy', () => {
  assert.match(migration, /create or replace function public\.sales_asset_course_scope_key_v1\(p_value text\)/);
  assert.match(migration, /yoga\[\[:space:\]_\-\]\+teacher\[\[:space:\]_\-\]\+training/);
  assert.match(migration, /'yttc'/);
  assert.match(migration, /'hours\?\|hrs\?'/);
  assert.match(migration, /'\[\^a-z0-9\]\+'/);
  assert.doesNotMatch(migration, /similarity\s*\(|levenshtein\s*\(|soundex\s*\(/i);
  assert.match(migration, /not fuzzy matching/i);
});

test('all three Sales Asset eligibility paths use the normalized course key and still fail closed', () => {
  assert.match(migration, /create or replace function public\.resolve_sales_asset_for_dispatch_v1/);
  assert.match(migration, /create or replace function public\.search_sales_assets_for_copilot_v1/);
  assert.match(migration, /create or replace function public\.resolve_sales_asset_for_human_dispatch_v1/);

  assert.match(migration, /v_course_key text := public\.sales_asset_course_scope_key_v1\(p_course\)/);
  assert.match(migration, /from unnest\(v_asset\.course_scope\) as scope\(value\)/);
  assert.match(migration, /from unnest\(asset\.course_scope\) as scope\(value\)/);
  assert.match(migration, /v_course_key is null/);
  assert.match(migration, /v_course_key is not null/);

  assert.match(migration, /v_asset\.state <> 'approved'/);
  assert.match(migration, /v_asset\.revoked_at is not null/);
  assert.match(migration, /v_asset\.rights_status <> 'cleared'/);
  assert.match(migration, /v_asset\.language_scope/);
  assert.match(migration, /v_asset\.location_scope/);
  assert.match(migration, /storage\.objects/);
});

test('normalization migration preserves privileged dispatch boundaries and does not rewrite asset rows', () => {
  assert.match(
    migration,
    /revoke all on function public\.resolve_sales_asset_for_dispatch_v1\(uuid,uuid,text,text,text,text\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.resolve_sales_asset_for_dispatch_v1\(uuid,uuid,text,text,text,text\)[\s\S]*to service_role/,
  );
  assert.match(
    migration,
    /revoke all on function public\.resolve_sales_asset_for_human_dispatch_v1\(uuid,uuid,text,text,text,text\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.resolve_sales_asset_for_human_dispatch_v1\(uuid,uuid,text,text,text,text\)[\s\S]*to service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.search_sales_assets_for_copilot_v1\(uuid,text,text,text,text,text,integer\)[\s\S]*to authenticated/,
  );

  assert.doesNotMatch(migration, /update\s+public\.sales_assets\s+set/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.sales_assets/i);
});
