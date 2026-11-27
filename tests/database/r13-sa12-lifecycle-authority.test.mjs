import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';

test('SA-12 private lifecycle authorization requires explicit permission and matching current session',async()=>{
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(url.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  assert.equal(url.pathname,'/postgres');
  assert.equal(url.username,'postgres');
  const admin=new pg.Client({connectionString:url.href});
  const dbName='salsys_lifecycle_'+randomUUID().replaceAll('-','');
  const roles=[];let db,created=false;
  await admin.connect();
  try{
    for(const role of ['anon','authenticated','service_role']){
      if(!(await admin.query('select 1 from pg_roles where rolname=$1',[role])).rowCount){
        await admin.query('create role '+role+' nologin'+(role==='service_role'?' bypassrls':''));
        roles.push(role);
      }
    }
    await admin.query('create database "'+dbName+'"');created=true;
    url.pathname='/'+dbName;db=new pg.Client({connectionString:url.href});await db.connect();
    // JWT context is synthetic; this is not real signed-session acceptance.
    await db.query(`
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('test.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean);
      create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
      create table public.organizations(id uuid primary key,slug text unique not null,status text not null);
      create table public.profiles(id uuid primary key,active boolean not null);
      create table public.organization_members(organization_id uuid,user_id uuid,active boolean,role text);
      create table public.tenant_session_bindings(session_id uuid,user_id uuid,organization_id uuid);
    `);
    await db.query(readFileSync('supabase/drafts/r13_sa12_lifecycle_authority.sql','utf8'));
    const actor=randomUUID(),session=randomUUID(),platform=randomUUID(),target=randomUUID(),other=randomUUID();
    await db.query("insert into public.organizations values($1,'salsysos','active'),($2,'customer','active'),($3,'archived','archived')",[platform,target,other]);
    await db.query("insert into auth.users values($1,now(),false)",[actor]);
    await db.query("insert into auth.sessions values($1,$2,null)",[session,actor]);
    await db.query("insert into public.profiles values($1,true)",[actor]);
    await db.query("insert into public.organization_members values($1,$2,true,'admin')",[platform,actor]);
    await db.query("insert into public.tenant_session_bindings values($1,$2,$3)",[session,actor,platform]);
    const claims=async(p={})=>db.query("select set_config('test.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:actor,session_id:session,...p})]);
    const authorize=async(action='suspend',org=target,platformId=platform)=>(await db.query('select saas_lifecycle.require_operator($1,$2,$3) as actor',[platformId,org,action])).rows[0].actor;
    const denied=async(...args)=>assert.rejects(authorize(...args),e=>e.code==='42501');
    await claims();await denied();
    await db.query("insert into saas_lifecycle.operators(user_id,platform_organization_id,active,may_suspend) values($1,$2,true,true)",[actor,platform]);
    assert.equal(await authorize(),actor);
    await denied('restore');await denied('archive');await denied('suspend',platform);await denied('suspend',other);await denied('suspend',target,other);
    await db.query('update saas_lifecycle.operators set may_restore=true');
    assert.equal(await authorize('restore'),actor);
    await claims({role:'service_role'});await denied();
    await claims({session_id:'not-a-uuid'});await denied();
    await claims({session_id:randomUUID()});await denied();
    await claims();await db.query("update auth.sessions set not_after=now()-interval '1 second'");await denied();
    await db.query('update auth.sessions set not_after=null');
    await db.query('update public.tenant_session_bindings set organization_id=$1',[target]);await denied();
    await db.query('update public.tenant_session_bindings set organization_id=$1',[platform]);
    await db.query("update public.organization_members set role='admissions'");await denied();
    await db.query("update public.organization_members set role='admin'");
    await db.query('update auth.users set is_anonymous=true');await denied();
    await db.query('update auth.users set is_anonymous=false');
    await db.query('update saas_lifecycle.operators set active=false');await denied();
    for(const role of ['anon','authenticated','service_role']){
      const row=(await db.query("select has_schema_privilege($1,'saas_lifecycle','USAGE') as usage, has_function_privilege($1,'saas_lifecycle.require_operator(uuid,uuid,text)','EXECUTE') as execute,has_table_privilege($1,'saas_lifecycle.operators','INSERT') as insert",[role])).rows[0];
      assert.deepEqual(row,{usage:false,execute:false,insert:false});
    }
    assert.equal((await db.query('select status from public.organizations where id=$1',[target])).rows[0].status,'active');
  }finally{
    if(db)await db.end();
    if(created)await admin.query('drop database "'+dbName+'"');
    for(const role of roles.reverse())await admin.query('drop role '+role);
    await admin.end();
  }
});
