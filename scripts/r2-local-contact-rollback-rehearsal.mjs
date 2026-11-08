import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Outputs SQL for the ALREADY-RUNNING DISPOSABLE LOCAL Supabase container only.
// It does not connect to any database or use credentials. CI must enforce
// the container name/hostname boundary before piping its output into psql.
// NEVER execute the resulting SQL on production or a preview with live secrets.
assert.deepEqual(process.argv.slice(2), ['--disposable-local-only']);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (name) => readFileSync(path.join(root, name), 'utf8');
const marker = 'CREATE OR REPLACE FUNCTION public.ingest_website_lead(';
const close = '$function$;';
function extractFunction(sql) {
  const start = sql.indexOf(marker);
  assert.ok(start >= 0, 'Canonical ingest function absent');
  assert.equal(sql.indexOf(marker, start + marker.length), -1, 'Multiple canonical definitions');
  const startBody = sql.indexOf('AS $function$', start);
  const end = sql.indexOf(close, startBody + 13);
  assert.ok(startBody > start && end > startBody, 'Canonical function body missing');
  return sql.slice(start, end + close.length);
}
const old = extractFunction(load('supabase/migrations/008_identity_resolution.sql'));
const changed = extractFunction(load('supabase/migrations/20261108080000_r2_browser_lead_primary_contact_v1.sql'));
assert.notEqual(old, changed, 'New migration has no change');
assert.match(old, /SECURITY DEFINER\\s+SET search_path TO 'public'/);
assert.match(changed, /SECURITY DEFINER\\s+SET search_path TO 'public'/);
const signature = 'public.ingest_website_lead(text,text,text,text,text,text,text,text,text,date,text,text,text,text,text,text,jsonb,jsonb,jsonb)';
const bodyHash = "md5(btrim(replace(split_part(split_part(pg_get_functiondef(to_regprocedure('" + signature + "')), 'AS $function$', 2), '$function$', 1), E'\\r\\n', E'\\n')))";
const checkAuthority = "exists (select 1 from pg_proc p where p.oid = to_regprocedure('" +
  signature + "') and p.prosecdef and p.proowner::regrole::text = 'postgres' " +
  "and p.proacl::text = '{postgres=X/postgres,service_role=X/postgres}' " +
  "and array_to_string(p.proconfig, ',') = 'search_path=public')";
const before = [
  '\\set ON_ERROR_STOP on',
  "\\echo 'R2 local rollback rehearsal: begin (no production connection)'",
  'DO $r2_local_preimage$ BEGIN',
  "  IF " + bodyHash + " = '309f9d3ea4929e26f6c44f77099559ed' THEN",
  "    RAISE EXCEPTION 'R2 local: contact repair not installed; cannot test restore';",
  '  END IF;',
  '  IF NOT ' + checkAuthority + " THEN RAISE EXCEPTION 'R2 local: wrong RPC authority'; END IF;",
  'END $r2_local_preimage$;',
  "SELECT set_config('salsys.r2_local_preimage_hash', " + bodyHash + ', false);',
  'BEGIN;',
];
const after = [
  'DO $r2_local_legacy_restore$ BEGIN',
  "  IF " + bodyHash + " <> '309f9d3ea4929e26f6c44f77099559ed' THEN",
  "    RAISE EXCEPTION 'R2 local: legacy RPC not precisely restored';",
  '  END IF;',
  '  IF NOT ' + checkAuthority + " THEN RAISE EXCEPTION 'R2 local: restore altered authority'; END IF;",
  'END $r2_local_legacy_restore$;',
  'ROLLBACK;',
  'DO $r2_local_rollback_verify$ BEGIN',
  "  IF " + bodyHash + " <> current_setting('salsys.r2_local_preimage_hash') THEN",
  "    RAISE EXCEPTION 'R2 local: transaction rollback did not preserve repaired RPC';",
  '  END IF;',
  '  IF NOT ' + checkAuthority + " THEN RAISE EXCEPTION 'R2 local: rollback altered authority'; END IF;",
  'END $r2_local_rollback_verify$;',
  "\\echo 'R2 local rollback rehearsal: old RPC restoration and transaction rollback PASSED'",
];
process.stdout.write([...before, old, ...after].join('\\n') + '\\n');
