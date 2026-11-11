const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// #643: exact-source regression. Test makes no database or network writes.
const root = path.resolve(__dirname, '../..');
const baseline = fs.readFileSync(
  path.join(root, 'supabase/migrations/008_identity_resolution.sql'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261108080000_r2_browser_lead_primary_contact_v1.sql'), 'utf8');

const declaration = 'CREATE OR REPLACE FUNCTION public.ingest_website_lead(';
const closing = '$function$;';

function extract(sql) {
  const at = sql.indexOf(declaration);
  assert.ok(at >= 0, 'Original tenant-owned ingest RPC missing');
  assert.equal(sql.indexOf(declaration, at + declaration.length), -1,
    'Cannot have two RPC replacements');
  const end = sql.indexOf(closing, at + declaration.length);
  assert.ok(end >= 0, 'RPC closing delimiter missing');
  return sql.slice(at, end + closing.length);
}
function replaceOnce(value, from, to) {
  assert.equal(value.split(from).length, 2, 'Each old predicate must occur exactly once');
  return value.replace(from, to);
}
const oldEmail = [
  '            v_email_norm,', '            true', '        )',
].join('\n');
const newEmail = [
  '            v_email_norm,',
  '            not exists (',
  '                select 1 from public.lead_contacts lc',
  '                where lc.organization_id = v_organization_id',
  '                  and lc.lead_id = v_lead.id',
  "                  and lc.contact_type = 'email'",
  '                  and lc.is_primary = true',
  '            )',
  '        )',
].join('\n');
const oldPhone = [
  '            v_phone_norm,', '            v_email_norm is null', '        )',
].join('\n');
const newPhone = [
  '            v_phone_norm,',
  '            v_email_norm is null',
  '            and not exists (',
  '                select 1 from public.lead_contacts lc',
  '                where lc.organization_id = v_organization_id',
  '                  and lc.lead_id = v_lead.id',
  "                  and lc.contact_type = 'phone'",
  '                  and lc.is_primary = true',
  '            )',
  '        )',
].join('\n');

test('migration replaces exactly the two original contact-primary expressions', () => {
  const before = extract(baseline);
  const after = extract(migration);
  const expected = replaceOnce(
    replaceOnce(before, oldEmail, newEmail), oldPhone, newPhone);
  assert.equal(after, expected, 'Any other RPC change needs its own code review');
  assert.match(after, /SECURITY DEFINER\s+SET search_path TO 'public'/);
  assert.match(after, /pg_advisory_xact_lock/);
  assert.match(after, /on conflict \(\s*organization_id,\s*contact_type,\s*normalized_value\s*\)\s*do nothing/);
  assert.match(after, /update public\.leads[\s\S]*?returning \*[\s\S]*?into v_lead;/i);
  assert.equal((after.match(/insert into public\.lead_contacts\s*\(/gi) ?? []).length, 2);
});

test('migration checks source body and existing security boundary before replacement', () => {
  assert.match(migration, /md5\(btrim\(replace\(/);
  assert.match(migration, /309f9d3ea4929e26f6c44f77099559ed/);
  assert.match(migration, /to_regprocedure\(/);
  const signatures = [...migration.matchAll(/to_regprocedure\(\s*'([^']+)'\s*\)/g)].map(m => m[1]);
  const exactSignature =
    'public.ingest_website_lead(text,text,text,text,text,text,text,text,text,date,text,text,text,text,text,text,jsonb,jsonb,jsonb)';
  assert.deepEqual(signatures, [exactSignature, exactSignature],
    'Pre-check and post-check must both address the exact existing 19-argument RPC');
  assert.match(migration, /p\.prosecdef = true/);
  assert.match(migration, /p\.proowner::regrole::text = 'postgres'/);
  assert.match(migration, /p\.proacl::text = '\{postgres=X\/postgres,service_role=X\/postgres\}'/);
  assert.match(migration, /array_to_string\(p\.proconfig, ','\) = 'search_path=public'/);
  assert.match(migration, /post-migration privileged RPC boundary changed/);
  assert.match(migration, /^begin;[\s\S]*\ncommit;\s*$/i);
  const outside = migration.replace(extract(migration), '');
  assert.doesNotMatch(outside, /^\s*(?:drop\s+function|alter\s+table|truncate|delete\s+from|create\s+table|grant\s+execute|update\s+public\.)\b/im);
});
