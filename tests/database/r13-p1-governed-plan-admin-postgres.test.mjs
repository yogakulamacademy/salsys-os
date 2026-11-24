import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

test('R13 P1 durable plan governance uses actual P0 DDL, immutable evidence and independent review', async () => {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(url.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  assert.equal(url.pathname,'/postgres');
  assert.equal(url.username,'postgres');
  const database='salsys_p1_'+randomUUID().replaceAll('-','');
  const dbUrl=new URL(url.href);dbUrl.pathname='/'+database;
  const admin=new pg.Client({connectionString:url.href});
  let db,peer,created=false;
  const roles=[];
  await admin.connect();
  try {
    for(const role of ['anon','authenticated','service_role']){
      if(!(await admin.query('select 1 from pg_roles where rolname=$1',[role])).rowCount){
        await admin.query('create role '+role+' nologin'+(role==='service_role'?' bypassrls':''));
        roles.push(role);
      }
    }
    await admin.query('create database "'+database+'"');created=true;
    db=new pg.Client({connectionString:dbUrl.href});await db.connect();
    await db.query(`
      create table public.organizations(id uuid primary key,name text not null,slug text unique not null,status text not null);
      create table public.profiles(id uuid primary key,active boolean not null);
      create table public.organization_members(organization_id uuid references public.organizations(id),user_id uuid references public.profiles(id),role text not null,active boolean not null,primary key(organization_id,user_id));
      create table public.workspace_catalog(code text primary key,status text not null);
      insert into public.workspace_catalog values('admin','active'),('sales','active'),('retired','inactive');
      create table public.capability_catalog(code text primary key,name text not null);
      create table public.organization_capabilities(organization_id uuid references public.organizations(id),capability_code text references public.capability_catalog(code),enabled boolean not null,primary key(organization_id,capability_code));
      create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
    `);
    await db.query(readFileSync('supabase/migrations/20261108120000_r13_commercial_state_foundation_v1.sql','utf8'));
    await db.query(readFileSync('supabase/drafts/r13_governed_plan_admin.sql','utf8'));
    const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
    for(const table of ['operators','plan_requests','price_proposals','review_events']){
      assert.equal(await scalar("select relrowsecurity as value from pg_class where oid=$1::regclass",['saas_governance.'+table]),true);
      for(const role of ['anon','authenticated','service_role']){
        for(const right of ['INSERT','UPDATE','DELETE','TRUNCATE']){
          assert.equal(await scalar("select has_table_privilege($1,$2,$3) as value",[role,'saas_governance.'+table,right]),false);
        }
        if(role!=='service_role'||table==='operators') assert.equal(await scalar("select has_table_privilege($1,$2,'SELECT') as value",[role,'saas_governance.'+table]),false);
      }
      assert.equal(await scalar('select count(*)::int as value from saas_governance.'+table),0);
    }
    for(const role of ['anon','authenticated']){
      assert.equal(await scalar("select has_schema_privilege($1,'saas_governance','USAGE') as value",[role]),false);
      assert.equal(await scalar("select has_function_privilege($1,'saas_governance.create_plan_request(uuid,text,integer,jsonb,text)','EXECUTE') as value",[role]),false);
    }
    const platform=randomUUID(),tenant=randomUUID(),author=randomUUID(),reviewer=randomUUID(),reviewer2=randomUUID(),outsider=randomUUID();
    await db.query("insert into public.organizations values($1,'Platform','salsysos','active'),($2,'Tenant','tenant','active')",[platform,tenant]);
    for(const user of [author,reviewer,reviewer2,outsider]){
      await db.query("insert into public.profiles values($1,true)",[user]);
      await db.query("insert into public.organization_members values($1,$2,'owner',true)",[user===outsider?tenant:platform,user]);
      await db.query("insert into saas_governance.operators values($1,$2,true,true,true)",[user,platform]);
    }
    const snapshot={display_name:'Synthetic Free',amount_minor:0,setup_min_minor:0,setup_max_minor:0,setup_optional:true,tax_treatment:'exclusive',named_users:1,lead_records:2,workspace_codes:['admin','sales'],integration_codes:[]};
    const create=(actor=author,code='free',version=0,terms=snapshot)=>scalar("select public.commercial_create_plan_request_v1($1,$2,$3,$4::jsonb,'Synthetic local proposal only') as value",[actor,code,version,JSON.stringify(terms)]);
    const transition=(actor,id,rev,digest,action)=>scalar("select public.commercial_transition_plan_request_v1($1,$2,$3,$4,$5,'Synthetic review reason') as value",[actor,id,rev,digest,action]);
    await db.query('set role service_role');
    await assert.rejects(create(outsider),/operator not authorized/);
    await assert.rejects(create(author,'free',0,{...snapshot,amount_minor:1}),/Invalid plan price/);
    await assert.rejects(create(author,'free',0,{...snapshot,workspace_codes:['admin','retired']}),/Invalid workspace/);
    await assert.rejects(create(author,'free',0,{...snapshot,provider_token:'not allowed'}),/Invalid commercial snapshot/);
    const id=await create();
    await assert.rejects(scalar("select public.commercial_read_plan_requests_v1($1) as value",[outsider]),/operator not authorized/);
    const listing=await scalar("select public.commercial_read_plan_requests_v1($1) as value",[author]);
    assert.equal(listing.requests[0].id,id);
    assert.equal(listing.may_author,true);
    assert.deepEqual(listing.versions,{});
    const row=(await db.query("select snapshot::text as serialized,snapshot_sha256,revision,status from saas_governance.plan_requests where id=$1",[id])).rows[0];
    assert.equal(row.snapshot_sha256,createHash('sha256').update(row.serialized).digest('hex'));
    assert.equal(row.status,'draft');
    assert.equal(await transition(reviewer,id,1,row.snapshot_sha256,'submit'),false);
    assert.equal(await transition(author,id,1,'0'.repeat(64),'submit'),false);
    assert.equal(await transition(author,id,1,row.snapshot_sha256,'submit'),true);
    assert.equal(await transition(author,id,2,row.snapshot_sha256,'review'),false);
    await db.query('reset role');
    await db.query("update public.profiles set active=false where id=$1",[reviewer]);
    await db.query('set role service_role');
    await assert.rejects(transition(reviewer,id,2,row.snapshot_sha256,'review'),/operator not authorized/);
    await db.query('reset role');
    await db.query("update public.profiles set active=true where id=$1",[reviewer]);
    await db.query('set role service_role');
    peer=new pg.Client({connectionString:dbUrl.href});await peer.connect();await peer.query('set role service_role');
    const outcomes=await Promise.all([
      transition(reviewer,id,2,row.snapshot_sha256,'review'),
      peer.query("select saas_governance.transition_plan_request($1,$2,2,$3,'reject','Independent competing decision') as value",[reviewer2,id,row.snapshot_sha256]).then(r=>r.rows[0].value)
    ]);
    assert.equal(outcomes.filter(Boolean).length,1);
    assert.equal(await scalar("select count(*)::int as value from saas_governance.review_events where request_id=$1",[id]),3);
    assert.equal(await transition(reviewer,id,2,row.snapshot_sha256,'review'),false);
    await assert.rejects(db.query("update saas_governance.price_proposals set amount_minor=1 where request_id=$1",[id]),/permission denied/);
    await assert.rejects(db.query("delete from saas_governance.review_events where request_id=$1",[id]),/permission denied/);
    const stale=await create();
    const staleHash=await scalar("select snapshot_sha256 as value from saas_governance.plan_requests where id=$1",[stale]);
    await db.query('reset role');
    await assert.rejects(db.query("update saas_governance.price_proposals set amount_minor=1 where request_id=$1",[id]),/immutable/);
    await assert.rejects(db.query("delete from saas_governance.review_events where request_id=$1",[id]),/immutable/);
    assert.equal(await scalar("select count(*)::int as value from public.saas_plans"),0);
    assert.equal(await scalar("select count(*)::int as value from public.saas_organization_subscriptions"),0);
    await db.query("insert into public.saas_plans(code,display_name,version) values('free','Synthetic version conflict',1)");
    await db.query('set role service_role');
    await assert.rejects(transition(author,stale,1,staleHash,'submit'),/version changed/);
    assert.equal(await scalar("select revision as value from saas_governance.plan_requests where id=$1",[stale]),1);
  } finally {
    if(peer)await peer.end().catch(()=>{});
    if(db)await db.end().catch(()=>{});
    if(created)await admin.query('drop database "'+database+'" with (force)');
    for(const role of roles.reverse())await admin.query('drop role if exists '+role);
    await admin.end();
  }
});
