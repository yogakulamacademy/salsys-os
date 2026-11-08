import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// #643. A deliberately reduced replica of the production lead_contacts
// unique-index conflict. No real ingest RPCs, tracking endpoints or contacts.
function localAdminUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS, '1');
  assert.ok(process.env.SALSYS_TEST_DATABASE_URL);
  const url = new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(url.protocol, 'postgres:');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'No remote DB connection');
  assert.equal(url.pathname, '/postgres', 'Only isolated fixture admin');
  assert.equal(url.username, 'postgres');
  return url;
}

test('production-style contact insert raises 23505 for a second primary; serialized candidate stays unique', async () => {
  const origin = localAdminUrl();
  const name = 'salsys_r2_primary_' + randomUUID().replaceAll('-', '');
  const quoted = '"' + name + '"';
  const dbUrl = new URL(origin);
  dbUrl.pathname = '/' + name;
  const admin = new pg.Client({ connectionString: origin.href });
  const clients = [];
  let created = false;
  await admin.connect();
  try {
    await admin.query('create database ' + quoted);
    created = true;
    async function connect() {
      const client = new pg.Client({ connectionString: dbUrl.href });
      await client.connect();
      clients.push(client);
      return client;
    }
    const setup = await connect();
    await setup.query([
      'create table public.fixture_leads (',
      '  organization_id uuid not null, id uuid not null,',
      '  primary key (organization_id,id));',
      'create table public.fixture_contacts (',
      '  id bigint generated always as identity primary key,',
      '  organization_id uuid not null, lead_id uuid not null,',
      '  contact_type text not null, normalized_value text not null,',
      '  is_primary boolean not null,',
      '  foreign key (organization_id,lead_id) references public.fixture_leads(organization_id,id));',
      'create unique index uq_lead_contacts_org_contact',
      '  on public.fixture_contacts(organization_id,contact_type,normalized_value);',
      'create unique index uq_lead_contacts_one_primary_per_type_v1',
      '  on public.fixture_contacts(organization_id,lead_id,contact_type)',
      '  where is_primary = true;',
    ].join('\n'));

    const orgA = randomUUID(), leadA = randomUUID();
    const orgB = randomUUID(), leadB = randomUUID();
    await setup.query('insert into public.fixture_leads values ($1,$2),($3,$4)',
      [orgA,leadA,orgB,leadB]);

    // Exact existing INSERT's conflict target and primary flags for email.
    const insert = (client, org, lead, value, primary) => client.query([
      'insert into public.fixture_contacts',
      '(organization_id,lead_id,contact_type,normalized_value,is_primary)',
      "values ($1,$2,'email',$3,$4)",
      'on conflict (organization_id,contact_type,normalized_value) do nothing',
      'returning id',
    ].join('\n'), [org,lead,value,primary]);

    assert.equal((await insert(setup,orgA,leadA,'a@example.invalid',true)).rowCount,1);
    await assert.rejects(
      insert(setup,orgA,leadA,'b@example.invalid',true),
      err => err.code === '23505' && err.constraint === 'uq_lead_contacts_one_primary_per_type_v1',
      'The normalized-value conflict target does not handle the separate primary index',
    );
    assert.equal((await insert(setup,orgA,leadA,'a@example.invalid',true)).rowCount,0);
    assert.equal((await insert(setup,orgA,leadA,'b@example.invalid',false)).rowCount,1);
    assert.equal((await insert(setup,orgB,leadB,'a@example.invalid',true)).rowCount,1);
    const isolated = await setup.query([
      'select organization_id::text as org,count(*)::integer as n,',
      'count(*) filter(where is_primary)::integer as primaries',
      'from public.fixture_contacts group by organization_id',
    ].join(' '));
    assert.deepEqual(isolated.rows.sort((a,b)=>a.org.localeCompare(b.org)),
      [{org:orgA,n:2,primaries:1},{org:orgB,n:1,primaries:1}]
        .sort((a,b)=>a.org.localeCompare(b.org)));

    // Research-only candidate: serialize at the lead, then re-read primary.
    // NOT a deployment/migration; a real fix must preserve actual other triggers.
    const orgC = randomUUID(), leadC = randomUUID();
    await setup.query('insert into public.fixture_leads values ($1,$2)',[orgC,leadC]);
    async function candidate(client, normalized) {
      await client.query('begin');
      try {
        await client.query("set local statement_timeout='10s'");
        const owned = await client.query(
          'select id from public.fixture_leads where organization_id=$1 and id=$2 for update',
          [orgC,leadC]);
        assert.equal(owned.rowCount,1);
        await client.query([
          'insert into public.fixture_contacts',
          '(organization_id,lead_id,contact_type,normalized_value,is_primary)',
          "select $1,$2,'email',$3,not exists(",
          "select 1 from public.fixture_contacts",
          "where organization_id=$1 and lead_id=$2 and contact_type='email' and is_primary=true)",
          'on conflict (organization_id,contact_type,normalized_value) do nothing',
        ].join(' '),[orgC,leadC,normalized]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
    const a=await connect(), b=await connect();
    await Promise.all([
      candidate(a,'first@example.invalid'),
      candidate(b,'second@example.invalid'),
    ]);
    await candidate(a,'first@example.invalid');
    const result = await setup.query([
      'select normalized_value,is_primary from public.fixture_contacts',
      'where organization_id=$1 and lead_id=$2 order by normalized_value',
    ].join(' '),[orgC,leadC]);
    assert.equal(result.rowCount,2);
    assert.equal(result.rows.filter(x=>x.is_primary).length,1);
    assert.equal(result.rows.filter(x=>!x.is_primary).length,1);
  } finally {
    await Promise.allSettled(clients.map(c=>c.end()));
    try { if (created) await admin.query('drop database '+quoted+' with (force)'); }
    finally { await admin.end(); }
  }
});
