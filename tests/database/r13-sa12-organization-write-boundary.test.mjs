import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';

test('SA-12 organization column privilege boundary preserves tenant name edit',async()=>{
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(url.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  assert.equal(url.pathname,'/postgres');
  assert.equal(url.username,'postgres');
  const admin=new pg.Client({connectionString:url.href});
  const name='salsys_org_write_'+randomUUID().replaceAll('-','');
  const roles=[]; let db,created=false;
  await admin.connect();
  try{
    for(const role of ['anon','authenticated','service_role']){
      if(!(await admin.query('select 1 from pg_roles where rolname=$1',[role])).rowCount){
        await admin.query('create role '+role+' nologin'+(role==='service_role'?' bypassrls':''));
        roles.push(role);
      }
    }
    await admin.query('create database "'+name+'"');created=true;
    url.pathname='/'+name;db=new pg.Client({connectionString:url.href});await db.connect();
    // Synthetic bound-session predicate, not actual Supabase JWT or session logic.
    await db.query(`
      create table public.organizations(id uuid primary key,name text not null,slug text unique not null,status text not null,created_at timestamptz default now(),updated_at timestamptz default now());
      alter table public.organizations enable row level security;
      create policy organizations_member_read on public.organizations for select to authenticated using(id::text=current_setting('test.bound_org',true));
      create policy organizations_admin_update on public.organizations for update to authenticated
        using(id::text=current_setting('test.bound_org',true) and current_setting('test.role',true) in ('owner','admin'))
        with check(id::text=current_setting('test.bound_org',true) and current_setting('test.role',true) in ('owner','admin'));
      grant usage on schema public to authenticated,anon,service_role;
      grant select,update on public.organizations to authenticated;
      grant update(status) on public.organizations to authenticated;
      grant select,update on public.organizations to service_role;
    `);
    const a=randomUUID(),b=randomUUID();
    await db.query("insert into public.organizations(id,name,slug,status) values($1,'A','a','active'),($2,'B','b','active')",[a,b]);
    await db.query(readFileSync('supabase/drafts/r13_sa12_organization_write_boundary.sql','utf8'));
    const scalar=async(sql,params=[])=>(await db.query(sql,params)).rows[0]?.value;
    assert.equal(await scalar("select has_table_privilege('authenticated','public.organizations','UPDATE') as value"),false);
    for(const col of ['id','slug','status','created_at','updated_at']){
      assert.equal(await scalar("select has_column_privilege('authenticated','public.organizations',$1,'UPDATE') as value",[col]),false);
    }
    assert.equal(await scalar("select has_column_privilege('authenticated','public.organizations','name','UPDATE') as value"),true);
    assert.equal(await scalar("select has_column_privilege('service_role','public.organizations','status','UPDATE') as value"),true);
    await db.query("select set_config('test.bound_org',$1,false),set_config('test.role','owner',false)",[a]);
    await db.query('set role authenticated');
    assert.equal((await db.query("update public.organizations set name='Renamed' where id=$1 returning id",[a])).rowCount,1);
    assert.equal((await db.query("update public.organizations set name='No' where id=$1 returning id",[b])).rowCount,0);
    for(const [column,expression] of [['status',"'suspended'"],['slug',"'changed'"],['id','gen_random_uuid()'],['created_at','now()'],['updated_at','now()']]){
      await assert.rejects(db.query('update public.organizations set '+column+'='+expression+' where id=$1',[a]),e=>e.code==='42501');
    }
    await db.query("select set_config('test.role','admissions',false)");
    assert.equal((await db.query("update public.organizations set name='No' where id=$1 returning id",[a])).rowCount,0);
    await db.query('reset role');
    assert.equal(await scalar('select name as value from public.organizations where id=$1',[a]),'Renamed');
    assert.equal(await scalar('select status as value from public.organizations where id=$1',[a]),'active');
    // Rehearsal asserts inherited PUBLIC grants cannot silently defeat the change.
    await db.query('grant update(status) on public.organizations to public');
    await db.query('revoke update(status) on public.organizations from public');
    assert.equal(await scalar("select has_column_privilege('anon','public.organizations','status','UPDATE') as value"),false);
  }finally{
    if(db)await db.end();
    if(created)await admin.query('drop database "'+name+'"');
    for(const role of roles.reverse())await admin.query('drop role '+role);
    await admin.end();
  }
});
