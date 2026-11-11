import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Offline-only fixture generator. No DB, network or Supabase connections.
const cli = process.argv.slice(2);
const mode = cli[0];
function arg(key) {
  const i = cli.indexOf(key);
  assert(i >= 0 && cli[i+1], 'Missing required ' + key);
  return cli[i+1];
}
function output(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  fs.writeFileSync(file, data);
}
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
function gitBlob(text) {
  return crypto.createHash('sha1').update('blob ' + Buffer.byteLength(text,'utf8')+'\0').update(text,'utf8').digest('hex');
}
if (mode === 'ledger') {
  const f=JSON.parse(fs.readFileSync(arg('--snapshot'),'utf8'));
  assert.equal(f.source_project,'ndxpjqkthuzxlmbenxti');
  assert.equal(f.expected_ledger_count,433);
  assert.equal(f.migrations.length,433);
  const stage=f.migrations.map(r=>r.version);
  assert.equal(new Set(stage).size,433,'duplicate staging versions');
  assert(stage.every(v=>/^\d{3,14}$/.test(v)),'unexpected version');
  assert(!stage.includes('20261110041634'),'PR #685 not in hosted ledger');
  assert.equal(f.whatsapp_aliases.length,2);
  assert.deepEqual(f.whatsapp_aliases.map(x=>x.staging),['20261111082713','20261111082927']);
  assert.deepEqual(f.whatsapp_aliases.map(x=>x.source_replay),['20261111103500','20261111141500']);
  for (const alias of f.whatsapp_aliases) {
    const record=f.migrations.find(x=>x.version===alias.staging);
    assert(record,'missing staging alias');
    assert.equal(record.name,alias.name);
    assert(!stage.includes(alias.source_replay),'source alias must not appear in hosted ledger');
    assert(fs.existsSync(alias.source_file),'source alias missing: '+alias.source_file);
  }
  const mapping=new Map(f.whatsapp_aliases.map(x=>[x.staging,x.source_replay]));
  const mapped=stage.map(v=>mapping.get(v)??v).sort();
  assert.equal(new Set(mapped).size,433,'mapping collision');
  const digest=sha(mapped.join('\n'));
  assert.equal(digest,f.local_replay_404_sha256_sorted_versions_newline_join,
    'hosted snapshot does not reconcile to independently observed replay #404');
  output(path.join(arg('--out'),'ledger-parity.json'),JSON.stringify({
    verdict:'PASS_OFFLINE_VERSION_SNAPSHOT_ONLY',
    hosted_project:f.source_project,
    snapshot_date_utc:f.observed_date_utc,
    replay_commit:f.local_replay_404_commit,
    hosted_count:433, archived_local_replay_count:433,
    aliases:f.whatsapp_aliases, other_version_differences:0,
    sorted_version_sha256:digest,
    pr685_in_hosted_migration_ledger:false,
    limitations:['Snapshot not a fresh hosted read','Version names do not prove DDL/body/row parity','Not a physical backup restore']
  },null,2)+'\n');
  console.log('PASS: 433 pinned staging versions reconcile with archived replay #404 via exactly two WhatsApp aliases');
} else if (mode === 'fixture') {
  const sql=fs.readFileSync(arg('--reviewed-sql'),'utf8');
  assert.equal(gitBlob(sql),'4dce41ad8f75d486c33e1364646ca24d44bf5c31','reviewed SQL bytes changed');
  assert.match(sql,/^BEGIN;$/m);
  assert.match(sql,/^COMMIT;\s*$/m);
  const rev=[...sql.matchAll(/^REVOKE EXECUTE ON FUNCTION public\.([a-z0-9_]+)\(([^)]*)\) FROM ([^;]+);$/gm)];
  const paths=[...sql.matchAll(/^ALTER FUNCTION public\.([a-z0-9_]+)\(([^)]*)\) SET search_path = public, pg_temp;$/gm)];
  assert.equal(rev.length,26); assert.equal(paths.length,4);
  const def=rev.slice(0,22),retry=rev[22],wrap=rev.slice(23);
  assert.equal(def[0][1],'attach_whatsapp_outbound_message_id');
  assert.equal(def.at(-1)[1],'update_crm_stage_probability');
  assert.equal(retry[1],'prepare_failed_whatsapp_provider_retry_v1');
  assert.deepEqual(wrap.map(r=>r[1]),['get_pipeline_snapshot','get_reengaged_workspace_v2','get_tracking_workspace']);
  assert.deepEqual(paths.map(r=>r[1]),['log_new_lead_stage','normalize_event_intelligence_url_v1','privacy_purpose_for_event_v1','set_updated_at']);
  const fn=m=>'public.'+m[1]+'('+m[2]+')';
  const setup=[
    '-- SYNTHETIC DISPOSABLE LOCAL DATABASE ONLY, NO CUSTOMER ROWS',
    'CREATE SCHEMA auth;',
    'CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $ar$ SELECT current_user::text $ar$;',
    'CREATE FUNCTION public.can_manage_organization(p_organization_id uuid) RETURNS boolean LANGUAGE sql AS $cm$ SELECT false $cm$;',
    'REVOKE EXECUTE ON FUNCTION public.can_manage_organization(uuid) FROM PUBLIC, anon;'
  ];
  for (const m of def) {
    setup.push('CREATE FUNCTION '+fn(m)+' RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$ BEGIN NULL; END; $fn$;');
    setup.push('GRANT EXECUTE ON FUNCTION '+fn(m)+' TO authenticated,service_role;');
  }
  for (const m of wrap) {
    setup.push('CREATE FUNCTION '+fn(m)+' RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $fn$ BEGIN NULL; END; $fn$;');
    setup.push('GRANT EXECUTE ON FUNCTION '+fn(m)+' TO authenticated,service_role;');
  }
  setup.push('CREATE FUNCTION '+fn(retry)+' RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$ BEGIN NULL; END; $fn$;');
  setup.push('REVOKE EXECUTE ON FUNCTION '+fn(retry)+' FROM PUBLIC, anon;');
  setup.push('GRANT EXECUTE ON FUNCTION '+fn(retry)+' TO authenticated,service_role;');
  for (const m of paths) {
    setup.push('CREATE FUNCTION '+fn(m)+' RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $fn$ BEGIN NULL; END; $fn$;');
    setup.push('REVOKE EXECUTE ON FUNCTION '+fn(m)+' FROM PUBLIC, anon;');
  }
  setup.push([
    'CREATE FUNCTION public.approve_sales_asset_v1(p_organization_id uuid,p_asset_id uuid,p_auto_send_allowed boolean)',
    'RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $sales$',
    'DECLARE v_actor uuid;',
    'BEGIN',
    " IF auth.role() <> 'authenticated' THEN RAISE EXCEPTION 'denied'; END IF;",
    " IF v_actor is null THEN RAISE EXCEPTION 'denied'; END IF;",
    " IF not public.can_manage_organization(p_organization_id) THEN RAISE EXCEPTION 'denied'; END IF;",
    'END;',
    '$sales$;',
    'REVOKE EXECUTE ON FUNCTION public.approve_sales_asset_v1(uuid,uuid,boolean) FROM PUBLIC,anon,service_role;',
    'GRANT EXECUTE ON FUNCTION public.approve_sales_asset_v1(uuid,uuid,boolean) TO authenticated;'
  ].join('\n'));
  const anonCount="SELECT count(*)::int FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')";
  const pathCount="SELECT count(*)::int FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('log_new_lead_stage','normalize_event_intelligence_url_v1','privacy_purpose_for_event_v1','set_updated_at') AND p.proconfig @> ARRAY['search_path=public, pg_temp']::text[]";
  const pre=[
    'DO $check$ BEGIN',
    " IF ("+anonCount+") <> 25 THEN RAISE EXCEPTION 'PRESTATE_ANON_NOT_25'; END IF;",
    " IF ("+pathCount+") <> 0 THEN RAISE EXCEPTION 'PRESTATE_SEARCH_PATH_NOT_0'; END IF;",
    " IF NOT pg_catalog.has_function_privilege('authenticated','public.prepare_failed_whatsapp_provider_retry_v1(uuid,uuid,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'PRESTATE_RETRY_AUTH_MISSING'; END IF;",
    'END $check$;'
  ].join('\n')+'\n';
  const post=[
    'DO $check$ BEGIN',
    " IF ("+anonCount+") <> 0 THEN RAISE EXCEPTION 'POSTSTATE_ANON_NOT_0'; END IF;",
    " IF ("+pathCount+") <> 4 THEN RAISE EXCEPTION 'POSTSTATE_SEARCH_PATH_NOT_4'; END IF;",
    " IF pg_catalog.has_function_privilege('authenticated','public.prepare_failed_whatsapp_provider_retry_v1(uuid,uuid,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'POSTSTATE_RETRY_AUTH_STILL_ALLOWED'; END IF;",
    " IF pg_catalog.has_function_privilege('service_role','public.approve_sales_asset_v1(uuid,uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'POSTSTATE_SALES_SERVICE_ROLE_ALLOWED'; END IF;",
    'END $check$;'
  ].join('\n')+'\n';
  const fault=sql.replace(/COMMIT;\s*$/,"DO $forced$ BEGIN RAISE EXCEPTION 'EXPECTED_LOCAL_TEST_ABORT'; END $forced$;\nCOMMIT;\n");
  assert(fault.includes('EXPECTED_LOCAL_TEST_ABORT'));
  const dest=arg('--out');
  for (const [name,data] of [['setup.sql',setup.join('\n')+'\n'],['before.sql',pre],['after.sql',post],['fault-injected-local-only.sql',fault]]) {
    output(path.join(dest,name),data);
  }
  output(path.join(dest,'fixture-summary.json'),JSON.stringify({
    purpose:'Synthetic ACL fixture only; NOT a full hosted database reconstruction',
    exact_sql_git_blob:gitBlob(sql),
    definer_functions:def.length,invoker_wrappers:wrap.length,
    retry_functions:1,search_path_functions:paths.length,
    expected_anon_pre:25,expected_anon_post:0,
    rollback_test:'In second disposable DB inject exception after reviewed postflight and before COMMIT'
  },null,2)+'\n');
  console.log('PASS: reviewed SQL bytes verified; synthetic fixture and transaction failure scenario generated');
} else {
  throw Error('Usage: node scripts/r2-pr685-recovery-rehearsal.mjs ledger|fixture ...');
}
