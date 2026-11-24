import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// R13-P0: PostgreSQL 17 fixture independent of optional Supabase CLI downloads.
// Exact draft DDL and rollback-only SQL fixture run on an isolated disposable
// localhost database, never on production, remote, or shared test sources.
function localPostgresUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS, '1');
  assert.ok(process.env.SALSYS_TEST_DATABASE_URL);
  const url = new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(url.protocol, 'postgres:');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Never connect remote DB');
  assert.equal(url.pathname, '/postgres', 'Only disposable local admin database');
  assert.equal(url.username, 'postgres');
  return url;
}

test('R13 draft commercial migration passes real PostgreSQL, privileges and audited lifecycle', async () => {
  const url = localPostgresUrl();
  const dbName = 'salsys_r13_fixture_' + randomUUID().replaceAll('-','');
  const ddl = readFileSync('supabase/migrations/20261108120000_r13_commercial_state_foundation_v1.sql','utf8');
  const fixture = readFileSync('tests/database/r13-commercial-state-full-local.sql','utf8')
    .split('\n')
    .filter(line => !line.trim().startsWith('\\'))
    .join('\n');
  assert.ok(ddl.includes('create table public.saas_organization_subscriptions'));
  assert.ok(fixture.includes('ROLLBACK;'));
  const dbUrl = new URL(url.href);
  dbUrl.pathname = '/' + dbName;
  const admin = new pg.Client({ connectionString:url.href });
  let db, created = false;
  const newRoles=[];
  await admin.connect();
  try {
    for(const name of ['anon','authenticated','service_role']){
      const found=await admin.query('select 1 from pg_roles where rolname=$1',[name]);
      if(found.rowCount===0){
        await admin.query('create role ' + name + ' nologin' + (name==='service_role'?' bypassrls':''));
        newRoles.push(name);
      }
    }
    await admin.query('create database "'+dbName+'"');
    created=true;
    db=new pg.Client({ connectionString:dbUrl.href });
    await db.connect();

    // Only schema dependencies needed to exercise unmodified R13 migration.
    // The full historical Supabase graph is tested separately by replay.
    await db.query([
      'create table public.organizations (',
      ' id uuid primary key default gen_random_uuid(),',
      ' name text not null, slug text not null unique,',
      " status text not null default 'active',",
      ' created_at timestamptz not null default now(),',
      ' updated_at timestamptz not null default now());',
      'create table public.capability_catalog (',
      ' code text primary key, name text not null);',
      'create table public.organization_capabilities (',
      ' organization_id uuid not null references public.organizations(id),',
      ' capability_code text not null references public.capability_catalog(code),',
      ' enabled boolean not null default false,',
      ' primary key(organization_id,capability_code));',
      'create function public.set_updated_at() returns trigger',
      'language plpgsql as $f$ begin new.updated_at=now(); return new; end $f$;',
      "insert into public.capability_catalog(code,name) values ('education_core','Education core');",
    ].join('\n'));

    // First exercise actual SQL migration: the database is disposable.
    await db.query(ddl);
    // Now exercise privileges, real triggers, statuses, tenancy, immutability.
    await db.query(fixture);

    const empty=await db.query(
      'select (select count(*) from public.saas_plans) as plans,'+
      ' (select count(*) from public.saas_organization_subscriptions) as subscriptions,'+
      ' (select count(*) from public.saas_subscription_events) as events');
    assert.deepEqual(empty.rows[0],{plans:'0',subscriptions:'0',events:'0'},
      'All fixture rows must have been rolled back');
  } finally {
    if(db) await db.end().catch(()=>{});
    if(created) await admin.query('drop database "'+dbName+'" with (force)');
    for(const name of newRoles.reverse()){
      await admin.query('drop role if exists '+name);
    }
    await admin.end();
  }
});
