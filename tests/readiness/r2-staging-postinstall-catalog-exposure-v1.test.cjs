const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '../../docs/sql/r2-staging-postinstall-catalog-exposure-v1.sql');
const sql = fs.readFileSync(file, 'utf8');

function nonLiteralSql(input) {
  // Remove line comments and single-quoted values before safety scanning.
  return input
    .replace(/--[^\r\n]*/g, '')
    .replace(/'(?:''|[^'])*'/g, "''");
}

test('SQL is one aggregate-only read and never contains executable DDL/DML', () => {
  const body = nonLiteralSql(sql);
  assert.match(body, /^\s*with\b/i);
  assert.equal((body.match(/;/g) ?? []).length, 1, 'one statement only');
  assert.match(body, /\bselect\b/i);
  assert.doesNotMatch(body, /\b(?:insert|update|delete|truncate|create|alter|drop|grant|revoke|copy|do|execute|call|vacuum|listen|notify)\b/i);
  assert.doesNotMatch(body, /\b(?:pg_sleep|dblink|http_post|net\.http_get|net\.http_post|cron\.schedule|migration\s+repair)\b/i);
});

test('inventory covers public table RLS, view security_invoker and SECURITY DEFINER executable roles', () => {
  for (const term of [
    'relrowsecurity', 'has_table_privilege', 'anon_reachable_rls_off',
    'authenticated_reachable_rls_off', 'security_invoker=true',
    'anon_exposed_non_invoker_views', 'authenticated_exposed_non_invoker_views',
    'prosecdef', 'has_function_privilege', 'anon_executable_definer_functions',
    'authenticated_executable_definer_functions',
  ]) assert.ok(sql.includes(term), term);
});


test('column-specific grants and materialized view exposure are classified before release', () => {
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
      assert.ok(sql.includes(`has_any_column_privilege('${role}', t.oid, '${privilege}')`));
    }
  }
  assert.match(sql, /c\.relkind = 'm'/);
  for (const name of [
    'anon_exposed_materialized_views',
    'authenticated_exposed_materialized_views',
    'or m.anon_exposed_materialized_views > 0',
    'or m.authenticated_exposed_materialized_views > 0',
  ]) assert.ok(sql.includes(name), name);
  assert.match(sql, /cross join materialized_view_counts m/);
});

test('empty or dangerous catalogs cannot report acceptance as passed', () => {
  assert.match(sql, /when t\.public_tables = 0 or f\.security_definer_functions = 0/);
  assert.match(sql, /SCHEMA_NOT_INSTALLED_OR_INCOMPLETE/);
  assert.match(sql, /PRIVILEGE_CATALOG_REVIEW_REQUIRED/);
  assert.match(sql, /CATALOG_GUARDS_PASS_NOT_ACCEPTANCE/);
  assert.match(sql, /f\.anon_executable_definer_functions > 0/);
  assert.match(sql, /t\.anon_reachable_rls_off > 0/);
});

test('catalog report explicitly refuses to claim human/privacy/recovery verification', () => {
  for (const term of [
    'false as authenticated_tenant_e2e_verified',
    'false as privacy_consent_verified',
    'false as backup_restore_verified',
    'false as authorized_to_release',
  ]) assert.ok(sql.includes(term), term);
  assert.doesNotMatch(sql, /\b(auth\.users|public\.leads|public\.lead_contacts|public\.messages)\b/i);
});

test('no secret, hardcoded customer endpoint or provider project ref embedded', () => {
  assert.doesNotMatch(sql, /https?:\/\/|bearer |service_role|sk_[a-z0-9]|sb_secret|salsysos\.com|yogakulam\.com/i);
  assert.doesNotMatch(sql, /ndxpjqkthuzxlmbenxti|doaozrkrtgeslddwhclj|wunnbqjvfzmawubglyhe/i);
});
