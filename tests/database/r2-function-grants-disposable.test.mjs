import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Execute the exact review-only staged ACL patch against synthetic functions
// in disposable CI PostgreSQL 17. Never connect to hosted staging/Production.
const proposal = readFileSync(new URL(
  '../../docs/sql/r2-staging-postinstall-function-grants-parity-v1.sql',
  import.meta.url,
), 'utf8');
const revocations = [...proposal.matchAll(
  /^REVOKE EXECUTE ON FUNCTION public\.([a-z0-9_]+)\(([^;\n]*)\) FROM ([^;\n]+);$/gm,
)].map(x => ({name:x[1],args:x[2],from:x[3]}));
const paths = [...proposal.matchAll(
  /^ALTER FUNCTION public\.([a-z0-9_]+)\(([^;\n]*)\) SET search_path = public, pg_temp;$/gm,
)].map(x => ({name:x[1],args:x[2]}));
const definer = revocations.filter(x =>
  x.from==='PUBLIC, anon, authenticated' ||
  x.name==='attach_whatsapp_outbound_message_id'
);
const wrappers = revocations.filter(x =>
  ['get_pipeline_snapshot','get_reengaged_workspace_v2','get_tracking_workspace'].includes(x.name)
);

function disposableUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1','Explicit local test opt-in');
  assert.ok(process.env.SALSYS_TEST_DATABASE_URL,'Local database missing');
  const u=new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(u.protocol,'postgres:');
  assert.equal(u.hostname,'127.0.0.1','No hosted DB connections allowed');
  assert.equal(u.port,'55432','Refuse non-CI PostgreSQL port');
  assert.equal(u.pathname,'/postgres','Refuse application databases');
  assert.equal(u.username,'postgres','Only CI PostgreSQL fixture');
  return u.toString();
}
function sqlStub({name,args},securityDefiner=false) {
  return 'CREATE FUNCTION public.'+name+'('+args+') RETURNS text LANGUAGE sql '+
    (securityDefiner?'SECURITY DEFINER ':'')+"AS $$ SELECT 'synthetic-only'::text $$";
}
async function expectPrivilege(db,role,func,expected) {
  const r=await db.query(
    "SELECT pg_catalog.has_function_privilege($1,p.oid,$4) AS result "+
    "FROM pg_catalog.pg_proc p "+
    "JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
    "WHERE n.nspname='public' AND p.proname=$2 "+
    "AND pg_catalog.pg_get_function_identity_arguments(p.oid)=$3",
    [role,func.name,func.args,'EXECUTE']);
  assert.equal(r.rowCount,1,'Exact synthetic signature required: '+func.name);
  assert.equal(r.rows[0].result,expected,
    role+' EXECUTE '+func.name+'('+func.args+')');
}

test('exact R2 function-privilege proposal closes anonymous EXECUTE while retaining human-only Sales Asset', {
  timeout: 90_000,
}, async () => {
  assert.equal(revocations.length,26,'Exactly 26 reviewed REVOKEs required');
  assert.equal(definer.length,22,'Exactly 22 privileged routines');
  assert.equal(wrappers.length,3,'Exactly three ordinary wrappers');
  assert.equal(paths.length,4,'Exactly four search paths');
  assert.match(proposal,/^BEGIN;$/m);
  assert.match(proposal,/^COMMIT;$/m);
  assert.doesNotMatch(proposal,/^GRANT /m);
  const innerSQL=proposal
    .replace(/^BEGIN;\s*$/m,'')
    .replace(/^COMMIT;\s*$/m,'');

  const db=new pg.Client({connectionString:disposableUrl()});
  await db.connect();
  let started=false;
  try {
    await db.query('BEGIN');started=true;
    await db.query("SET LOCAL statement_timeout='20s'");
    await db.query("SET LOCAL lock_timeout='5s'");
    const names=[...new Set([...revocations.map(x=>x.name),...paths.map(x=>x.name),
      'approve_sales_asset_v1'])];
    const existing=await db.query(
      "SELECT p.proname FROM pg_catalog.pg_proc p "+
      "JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
      "WHERE n.nspname='public' AND p.proname=ANY($1::text[])",[names]);
    assert.equal(existing.rowCount,0,'Refuse pre-existing application functions');

    const roles=await db.query(
      "SELECT rolname FROM pg_catalog.pg_roles "+
      "WHERE rolname IN ('anon','authenticated','service_role')");
    const present=new Set(roles.rows.map(row=>row.rolname));
    for(const role of ['anon','authenticated','service_role']){
      if(!present.has(role)) await db.query('CREATE ROLE '+role+' NOLOGIN');
    }

    // Set up the exact function identities with the preflight's owner and
    // SECURITY DEFINER/INVOKER properties; no function is ever invoked.
    for(const item of revocations) {
      await db.query(sqlStub(item,definer.some(x=>x.name===item.name)));
      if(definer.some(x=>x.name===item.name)){
        await db.query('GRANT EXECUTE ON FUNCTION public.'+item.name+
          '('+item.args+') TO service_role');
        if(item.name==='attach_whatsapp_outbound_message_id'){
          await db.query('GRANT EXECUTE ON FUNCTION public.'+item.name+
            '('+item.args+') TO authenticated');
        }
      }else if(wrappers.some(x=>x.name===item.name)){
        await db.query('GRANT EXECUTE ON FUNCTION public.'+item.name+
          '('+item.args+') TO authenticated,service_role');
      }else{
        // prepare_failed_whatsapp_provider_retry_v1 starts with authenticated
        // access, service-only intended, and anonymous denied.
        await db.query('REVOKE EXECUTE ON FUNCTION public.'+item.name+
          '('+item.args+') FROM PUBLIC,anon');
        await db.query('GRANT EXECUTE ON FUNCTION public.'+item.name+
          '('+item.args+') TO authenticated,service_role');
      }
    }
    for(const item of paths){
      await db.query(sqlStub(item));
      // These four were not part of the observed anon exposure count.
      await db.query('REVOKE EXECUTE ON FUNCTION public.'+item.name+
        '('+item.args+') FROM PUBLIC,anon');
    }

    // The existing human-only approval function must retain AUTHENTICATED,
    // deny service_role/anon, and carry the exact human guard body markers.
    const sale={name:'approve_sales_asset_v1',
      args:'p_organization_id uuid, p_asset_id uuid, p_auto_send_allowed boolean'};
    await db.query(
      'CREATE FUNCTION public.'+sale.name+'('+sale.args+') RETURNS text '+
      'LANGUAGE plpgsql SECURITY DEFINER AS $human$ BEGIN '+
      "-- auth.role() <> 'authenticated'\n"+
      '-- v_actor is null'+"\n"+
      '-- not public.can_manage_organization(p_organization_id)'+"\n"+
      "RETURN 'synthetic-human-only'; END; $human$");
    await db.query('REVOKE EXECUTE ON FUNCTION public.'+sale.name+
      '('+sale.args+') FROM PUBLIC,anon,service_role');
    await db.query('GRANT EXECUTE ON FUNCTION public.'+sale.name+
      '('+sale.args+') TO authenticated');

    for(const item of revocations){
      assert.equal((await db.query(
        "SELECT pg_catalog.has_function_privilege($1,p.oid,$4) AS can "+
        "FROM pg_catalog.pg_proc p "+
        "JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
        "WHERE n.nspname='public' AND p.proname=$2 "+
        "AND pg_catalog.pg_get_function_identity_arguments(p.oid)=$3",
        ['anon',item.name,item.args,'EXECUTE']
      )).rows[0].can,item.name!=='prepare_failed_whatsapp_provider_retry_v1',
      'Fixture should start with exactly the expected anonymous exposed group');
    }
    await expectPrivilege(db,'service_role',sale,false);
    await expectPrivilege(db,'authenticated',sale,true);

    // Preflight, exact 26 REVOKEs, four ALTER FUNCTION commands, postflight.
    // Outer ROLLBACK prevents durable changes to roles or functions.
    await db.query(innerSQL);

    for(const item of revocations){
      await expectPrivilege(db,'anon',item,false);
    }
    for(const item of definer){
      await expectPrivilege(db,'service_role',item,true);
      await expectPrivilege(db,'authenticated',item,
        item.name==='attach_whatsapp_outbound_message_id');
    }
    for(const item of wrappers){
      await expectPrivilege(db,'authenticated',item,true);
      await expectPrivilege(db,'service_role',item,true);
    }
    const retry=revocations.find(x=>x.name==='prepare_failed_whatsapp_provider_retry_v1');
    await expectPrivilege(db,'authenticated',retry,false);
    await expectPrivilege(db,'service_role',retry,true);
    await expectPrivilege(db,'service_role',sale,false);
    await expectPrivilege(db,'authenticated',sale,true);
    await expectPrivilege(db,'anon',sale,false);

    for(const item of paths){
      const r=await db.query(
        "SELECT p.proconfig FROM pg_catalog.pg_proc p "+
        "JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
        "WHERE n.nspname='public' AND p.proname=$1 "+
        "AND pg_catalog.pg_get_function_identity_arguments(p.oid)=$2",
        [item.name,item.args]);
      assert.ok(r.rows[0].proconfig?.includes('search_path=public, pg_temp'),
        'Fixed search path required for '+item.name);
    }
    const allAnon=await db.query(
      "SELECT count(*)::integer AS n FROM pg_catalog.pg_proc p "+
      "JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
      "WHERE n.nspname='public' AND "+
      "pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')");
    assert.equal(allAnon.rows[0].n,0,
      'No anonymous public function execute rights in synthetic catalog');
  } finally {
    if(started)await db.query('ROLLBACK');
    await db.end();
  }
});
