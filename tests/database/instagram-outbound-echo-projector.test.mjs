import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;
const foundation = readFileSync(
  new URL('./instagram-outbound-echo.foundation.sql', import.meta.url), 'utf8',
);
const projector = readFileSync(
  new URL('../../supabase/migrations/20261104170000_instagram_outbound_echo_v1.sql',
    import.meta.url), 'utf8',
);

const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '10000000-0000-4000-8000-000000000002';
const LEAD_A = '20000000-0000-4000-8000-000000000001';
const LEAD_A2 = '20000000-0000-4000-8000-000000000002';
const LEAD_B = '20000000-0000-4000-8000-000000000003';
const THREAD_A = '30000000-0000-4000-8000-000000000001';
const THREAD_A2 = '30000000-0000-4000-8000-000000000002';
const THREAD_B = '30000000-0000-4000-8000-000000000003';
const ACCOUNT_A = 'ig-synthetic-account-A';
const ACCOUNT_B = 'ig-synthetic-account-B';
const RECIPIENT_A = 'ig-synthetic-recipient-A';
const RECIPIENT_A2 = 'ig-synthetic-recipient-A2';
const RECIPIENT_B = 'ig-synthetic-recipient-B';
const MID = 'ig-synthetic-provider-mid';
const OCCURRED = '2026-11-05T10:55:00.000Z';
let nextRaw = 1;

function requireIsolatedLocalPostgres() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS, '1',
    'Local test opt-in is required');
  const source = process.env.SALSYS_TEST_DATABASE_URL;
  assert.ok(source, 'Explicit local test database URL is required');
  const url = new URL(source);
  assert.equal(url.protocol, 'postgres:', 'Only PostgreSQL connections are allowed');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname),
    'Refusing any non-loopback database');
  assert.equal(url.pathname, '/postgres',
    'Refusing to run outside the local postgres administration database');
  assert.equal(url.username, 'postgres',
    'Refusing non-admin or production database accounts');
  return source;
}

async function insertRaw(client, {
  organization = ORG_A,
  account = ACCOUNT_A,
  recipient = RECIPIENT_A,
  mid = MID,
  echoMid = mid,
  sender = account,
  isEcho = true,
  body = 'Synthetic provider echo only',
} = {}) {
  const id = '40000000-0000-4000-8000-' + String(nextRaw++).padStart(12, '0');
  await client.query(
    `insert into public.raw_events
      (id,organization_id,source_system,source_event_type,source_event_id,
       source_account_id,source_subject_id,external_message_id,payload,occurred_at,received_at)
    values ($1,$2,'instagram','outbound_echo:text',$3,$4,$5,$6,$7::jsonb,$8,$8)`,
    [id,organization,'echo:'+id,account,recipient,mid,JSON.stringify({
      outbound_echo: {
        sender: { id: sender }, recipient: { id: recipient },
        message: { mid: echoMid, is_echo: isEcho, text: body },
      },
    }),OCCURRED],
  );
  return id;
}

async function project(client, id) {
  const data = await client.query(
    'select public.ingest_instagram_outbound_echo_v1($1::uuid) as result',
    [id],
  );
  return data.rows[0].result;
}

async function messageCount(client) {
  const query = await client.query('select count(*)::integer as n from public.messages');
  return query.rows[0].n;
}

test('real outbound echo projector preserves tenant scope and exactly-once retries in isolated PostgreSQL', async () => {
  const url = requireIsolatedLocalPostgres();
  const db = new Client({ connectionString: url });
  await db.connect();
  let transactionOpen = false;
  try {
    // Do not use a non-empty application database even if it is loopback.
    const before = await db.query(
      `select to_regclass('public.raw_events') is not null as has_raw,
        to_regclass('public.messages') is not null as has_messages,
        to_regclass('public.integration_connections') is not null as has_integrations`,
    );
    assert.deepEqual(before.rows[0], {
      has_raw: false, has_messages: false, has_integrations: false,
    }, 'Refusing a populated application database');

    await db.query('begin');
    transactionOpen = true;
    await db.query("set local statement_timeout = '20s'");
    await db.query("set local lock_timeout = '2s'");
    await db.query(foundation);
    // This is the EXACT repository migration, not a mocked SQL reimplementation.
    await db.query(projector);
    await db.query(
      "select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ role:'service_role' })],
    );

    const acl = await db.query(`select
      has_function_privilege('anon','public.ingest_instagram_outbound_echo_v1(uuid)','EXECUTE') as anon_allowed,
      has_function_privilege('authenticated','public.ingest_instagram_outbound_echo_v1(uuid)','EXECUTE') as authenticated_allowed,
      has_function_privilege('service_role','public.ingest_instagram_outbound_echo_v1(uuid)','EXECUTE') as service_allowed`);
    assert.deepEqual(acl.rows[0], {
      anon_allowed: false, authenticated_allowed: false, service_allowed: true,
    });

    await db.query(`insert into public.leads (id,organization_id) values
      ($1,$4),($2,$4),($3,$5)`,[LEAD_A,LEAD_A2,LEAD_B,ORG_A,ORG_B]);
    await db.query(`insert into public.integration_connections
      (organization_id,provider,status,external_account_id)
      values ($1,'instagram','connected',$2),($3,'instagram','connected',$4)`,
      [ORG_A,ACCOUNT_A,ORG_B,ACCOUNT_B]);
    await db.query(`insert into public.conversations
      (id,organization_id,lead_id,channel,external_account_id,external_conversation_id)
      values ($1,$4,$7,'instagram',$10,$11),
        ($2,$4,$8,'instagram',$10,$12),
        ($3,$5,$9,'instagram',$13,$14)`,
      [
        THREAD_A,THREAD_A2,THREAD_B,ORG_A,ORG_B,
        'unused',LEAD_A,LEAD_A2,LEAD_B,
        ACCOUNT_A,ACCOUNT_A+':'+RECIPIENT_A,ACCOUNT_A+':'+RECIPIENT_A2,
        ACCOUNT_B,ACCOUNT_B+':'+RECIPIENT_B,
      ]);

    const firstRaw = await insertRaw(db);
    const first = await project(db, firstRaw);
    assert.equal(first.ok, true);
    assert.equal(first.processed, true);
    assert.equal(await messageCount(db), 1);

    const stored = await db.query(`select organization_id,lead_id,conversation_id,
      direction::text as direction,external_message_id,status,sent_at,body,
      metadata->>'source' as source
      from public.messages`);
    assert.equal(stored.rows[0].organization_id,ORG_A);
    assert.equal(stored.rows[0].lead_id,LEAD_A);
    assert.equal(stored.rows[0].conversation_id,THREAD_A);
    assert.equal(stored.rows[0].direction,'outbound');
    assert.equal(stored.rows[0].external_message_id,MID);
    assert.equal(stored.rows[0].status,'sent');
    assert.equal(new Date(stored.rows[0].sent_at).toISOString(),OCCURRED);
    assert.equal(stored.rows[0].source,'signed_outbound_echo');

    // Repeating the very same provider raw event is a no-write duplicate.
    const repeated = await project(db, firstRaw);
    assert.equal(repeated.duplicate_message,true);
    assert.equal(repeated.processed,false);
    assert.equal(await messageCount(db),1);

    // Separate signed deliveries with the same provider MID also dedupe.
    const duplicateRaw = await insertRaw(db);
    const duplicate = await project(db, duplicateRaw);
    assert.equal(duplicate.duplicate_message,true);
    assert.equal(await messageCount(db),1);

    const noThreadRaw = await insertRaw(db,{recipient:'ig-synthetic-unmatched'});
    const deferred = await project(db,noThreadRaw);
    assert.equal(deferred.deferred,true);
    assert.equal(deferred.reason,'conversation_not_found');
    assert.equal(await messageCount(db),1);
    const noThreadStatus = await db.query(
      'select status from public.fixture_processing where source_event_id=$1',
      ['echo:'+noThreadRaw],
    );
    assert.equal(noThreadStatus.rows[0]?.status,'failed');

    // A connected account from a *different* organization cannot be used
    // to write in the original tenant, even if its provider payload is valid.
    const crossTenantRaw = await insertRaw(db,{
      organization:ORG_A,account:ACCOUNT_B,recipient:RECIPIENT_B,
      mid:'ig-cross-tenant-synthetic',
    });
    const crossTenant = await project(db,crossTenantRaw);
    assert.equal(crossTenant.ok,false);
    assert.equal(await messageCount(db),1);

    const spoofedRaw = await insertRaw(db,{
      mid:'ig-fake-id-synthetic',sender:'spoofed-other-account',
    });
    const spoofed = await project(db,spoofedRaw);
    assert.equal(spoofed.ok,false);
    assert.equal(await messageCount(db),1);

    const mismatchMidRaw = await insertRaw(db,{
      mid:'ig-event-id-synthetic',echoMid:'ig-different-id-synthetic',
    });
    const mismatchMid = await project(db,mismatchMidRaw);
    assert.equal(mismatchMid.ok,false);
    assert.equal(await messageCount(db),1);

    // A known MID in the wrong same-tenant conversation must conflict,
    // not create a second outbound message in a different CRM thread.
    const conflictRaw = await insertRaw(db,{recipient:RECIPIENT_A2});
    await db.query('savepoint provider_conflict');
    await assert.rejects(project(db,conflictRaw),
      /provider mid conflicts with another CRM conversation/);
    await db.query('rollback to savepoint provider_conflict');
    assert.equal(await messageCount(db),1);

    // An unprivileged caller fails even if a valid signed raw event exists.
    const deniedRaw = await insertRaw(db,{mid:'ig-denied-synthetic'});
    await db.query('savepoint forbidden_role');
    await db.query(
      "select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({role:'authenticated'})],
    );
    await assert.rejects(project(db,deniedRaw), /Service role required/);
    await db.query('rollback to savepoint forbidden_role');
    assert.equal(await messageCount(db),1);

    // CRM side effects belong to this rolled-back local test only.
    const final = await db.query(
      `select count(*)::integer as n from public.leads`,
    );
    assert.equal(final.rows[0].n,3);
  } finally {
    if (transactionOpen) await db.query('rollback');
    await db.end();
  }
});
