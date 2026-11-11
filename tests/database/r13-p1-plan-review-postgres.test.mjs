import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Real local PostgreSQL execution of RESEARCH-ONLY review schema.
// Dedicated disposable localhost database; NEVER shared, remote or production.
function safeLocalUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS, '1',
    'Explicit local database tests must be enabled');
  assert.ok(process.env.SALSYS_TEST_DATABASE_URL, 'Missing local test database');
  const uri = new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(uri.protocol, 'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(uri.hostname),
    'Never connect to a remote database');
  assert.equal(uri.pathname,'/postgres');
  assert.equal(uri.username,'postgres');
  return uri;
}

async function expectBlocked(db, sql, params, expected) {
  await db.query('SAVEPOINT negative_assertion');
  try {
    await assert.rejects(db.query(sql, params),expected);
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT negative_assertion');
    await db.query('RELEASE SAVEPOINT negative_assertion');
  }
}

test('R13-P1 price review survives real Postgres roles, revisions, races and rollback', async () => {
  const uri = safeLocalUrl();
  const fixtureName='salsys_r13_p1_'+randomUUID().replaceAll('-','');
  const proposal=JSON.parse(readFileSync(
    'docs/commercial/r13-p1-pricing-proposal-v1.json','utf8'));
  const ddl=readFileSync(
    'research/r13-p1/plan-review-durable-schema-preview.sql','utf8');
  assert.match(ddl,/RESEARCH-ONLY PostgreSQL review schema/);
  assert.doesNotMatch(ddl,/public\.payments|update public\.organizations|update public\.organization_capabilities/i);
  const admin=new pg.Client({connectionString:uri.href});
  const newRoles=[];
  const dbUri=new URL(uri.href);dbUri.pathname='/'+fixtureName;
  let db=null;
  let db2=null;
  let created=false;
  await admin.connect();
  try {
    for(const role of ['anon','authenticated','service_role']){
      const found=await admin.query('select 1 from pg_roles where rolname=$1',[role]);
      if(!found.rowCount){
        await admin.query('CREATE ROLE '+role+' NOLOGIN'+(role==='service_role'?' BYPASSRLS':''));
        newRoles.push(role);
      }
    }
    await admin.query('CREATE DATABASE "'+fixtureName+'"');
    created=true;
    db=new pg.Client({connectionString:dbUri.href});
    await db.connect();
    await db.query(ddl);

    const matrix=await db.query(String.raw`
      select
        (select count(*) from pg_class where oid in (
          'r13_review_preview.requests'::regclass,
          'r13_review_preview.price_versions'::regclass,
          'r13_review_preview.events'::regclass
        ) and relrowsecurity) as rls_count,
        has_schema_privilege('anon','r13_review_preview','USAGE') as anon_schema,
        has_schema_privilege('authenticated','r13_review_preview','USAGE') as member_schema,
        has_table_privilege('authenticated','r13_review_preview.requests','SELECT') as member_select,
        has_table_privilege('anon','r13_review_preview.events','SELECT') as anon_events,
        has_table_privilege('service_role','r13_review_preview.events','INSERT') as service_can_forge_events,
        has_table_privilege('service_role','r13_review_preview.requests','UPDATE') as service_can_update_requests,
        has_function_privilege('authenticated',
          'r13_review_preview.review_request(uuid,uuid,integer,text)','EXECUTE') as member_can_review,
        has_function_privilege('anon',
          'r13_review_preview.submit_request(uuid,uuid,integer)','EXECUTE') as anon_can_submit
    `);
    const m=matrix.rows[0];
    assert.equal(Number(m.rls_count),3);
    for(const key of ['anon_schema','member_schema','member_select','anon_events',
      'service_can_forge_events','member_can_review','anon_can_submit']){
      assert.equal(m[key],false, key+' must be blocked');
    }
    assert.equal(m.service_can_update_requests,true);

    // Every local transaction is synthetic. No real SaaS organization exists.
    const author='00000000-0000-4000-8000-000000001301';
    const reviewerA='00000000-0000-4000-8000-000000001302';
    const reviewerB='00000000-0000-4000-8000-000000001303';
    const digest=createHash('sha256').update(JSON.stringify(proposal)).digest('hex');
    const sample={
      quote:'Free/Basic/Growth/Pro proposed, never published',
      approvalsRequired:true,
      pricingProposalVersion:proposal.schema_version,
    };

    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE service_role');
    const create=await db.query(String.raw`
      insert into r13_review_preview.requests
        (author_user_id,last_actor_user_id,snapshot,snapshot_sha256,rationale)
      values ($1,$1,$2::jsonb,$3,$4) returning id,revision,status
    `,[author,JSON.stringify(sample),digest,'SalsysOS four-tier design-only price review']);
    const requestId=create.rows[0].id;
    assert.equal(create.rows[0].status,'draft');
    assert.equal(create.rows[0].revision,1);
    const eventOne=await db.query(
      'select action,revision from r13_review_preview.events where request_id=$1',
      [requestId]);
    assert.deepEqual(eventOne.rows,[{action:'created',revision:1}]);

    // Fewer than four entries: submit must fail atomically.
    await expectBlocked(db,'select r13_review_preview.submit_request($1,$2,1)',
      [requestId,author],/all four tier prices are required/);
    // Ensure failed submit leaves no state changes or audit.
    const stillDraft=await db.query(
      'select status,revision from r13_review_preview.requests where id=$1',
      [requestId]);
    assert.deepEqual(stillDraft.rows[0],{status:'draft',revision:1});

    // Insert the approved-for-review prices only into disposable proposal tables.
    for(const tier of proposal.tiers){
      await db.query(String.raw`
        insert into r13_review_preview.price_versions
        (request_id,tier_code,currency,billing_period,amount_minor,
         setup_min_minor,setup_max_minor,setup_optional)
        values ($1,$2,'INR','month',$3,$4,$5,$6)
      `,[requestId,tier.code,tier.monthly_inr*100,
        tier.setup_fee_inr.minimum*100,tier.setup_fee_inr.maximum*100,
        tier.setup_fee_inr.optional]);
    }
    const priceSum=await db.query(
      'select tier_code,amount_minor from r13_review_preview.price_versions where request_id=$1 order by amount_minor',
      [requestId]);
    assert.deepEqual(priceSum.rows.map(r=>[r.tier_code,Number(r.amount_minor)]),[
      ['free',0],['basic',149900],['growth',349900],['pro',699900]]);
    // Service role has no UPDATE grant. Fail at ACL before reaching trigger.
    await expectBlocked(db,
      'update r13_review_preview.price_versions set amount_minor=1 where request_id=$1',
      [requestId],/permission denied/);
    await expectBlocked(db,
      'update r13_review_preview.requests set snapshot=$2 where id=$1',
      [requestId,JSON.stringify({corrupted:true})],/proposal snapshot and authorship are immutable/);
    const submitted=await db.query(
      'select r13_review_preview.submit_request($1,$2,1) as ok',
      [requestId,author]);
    assert.equal(submitted.rows[0].ok,true);
    assert.equal((await db.query(
      'select r13_review_preview.submit_request($1,$2,1) as ok',
      [requestId,author])).rows[0].ok,false,'stale submission must fail closed');
    assert.equal((await db.query(
      'select r13_review_preview.review_request($1,$2,2,$3) as ok',
      [requestId,author,'approve'])).rows[0].ok,false,'author self-review denied');

    // No additional prices after submitting for review.
    await expectBlocked(db,String.raw`
      insert into r13_review_preview.price_versions
      (request_id,tier_code,currency,billing_period,amount_minor,
       setup_min_minor,setup_max_minor,setup_optional)
      values ($1,'free','INR','month',0,0,0,true)
    `,[requestId],/prices can only be proposed for a draft/);

    const prepared=await db.query(
      'select status,revision,reviewer_user_id from r13_review_preview.requests where id=$1',
      [requestId]);
    assert.deepEqual(prepared.rows[0],{
      status:'under_review',revision:2,reviewer_user_id:null,
    });
    await db.query('COMMIT');

    // TWO independent PostgreSQL sessions concurrently attempt same revision.
    // Exactly one can win. The other must return false rather than double-audit.
    db2=new pg.Client({connectionString:dbUri.href});
    await db2.connect();
    await db.query('SET ROLE service_role');
    await db2.query('SET ROLE service_role');
    const result=await Promise.all([
      db.query('select r13_review_preview.review_request($1,$2,2,$3) as ok',
        [requestId,reviewerA,'approve']),
      db2.query('select r13_review_preview.review_request($1,$2,2,$3) as ok',
        [requestId,reviewerB,'reject']),
    ]);
    assert.deepEqual(result.map(x=>x.rows[0].ok).sort(),[false,true]);
    const finalRow=await db.query(
      'select status,revision,reviewer_user_id from r13_review_preview.requests where id=$1',
      [requestId]);
    assert.equal(finalRow.rows[0].revision,3);
    assert.ok(['reviewed_for_design','rejected'].includes(finalRow.rows[0].status));
    assert.ok([reviewerA,reviewerB].includes(finalRow.rows[0].reviewer_user_id));
    const allEvents=await db.query(
      'select action,revision,actor_user_id from r13_review_preview.events where request_id=$1 order by revision',
      [requestId]);
    assert.equal(allEvents.rowCount,3);
    assert.deepEqual(allEvents.rows.map(x=>x.revision),[1,2,3]);
    assert.deepEqual(allEvents.rows.slice(0,2).map(x=>x.action),['created','submitted']);
    assert.equal(allEvents.rows[2].action,finalRow.rows[0].status);
    assert.equal(allEvents.rows[2].actor_user_id,finalRow.rows[0].reviewer_user_id);
    assert.equal((await db.query(
      'select r13_review_preview.review_request($1,$2,3,$3) as ok',
      [requestId,reviewerA,'approve'])).rows[0].ok,false);

    // Service role can see evidence, but never rewrite or forge audit.
    await db.query('BEGIN');
    await expectBlocked(db,
      "update r13_review_preview.events set action='rejected' where request_id=$1",
      [requestId],/permission denied/);
    await expectBlocked(db,
      "insert into r13_review_preview.events(request_id,revision,action,actor_user_id,snapshot_sha256) values($1,99,'created',$2,$3)",
      [requestId,reviewerA,digest],/permission denied/);
    await db.query('ROLLBACK');

    await db.query('RESET ROLE'); // Restore disposable database owner.
    await db.query('BEGIN');
    await expectBlocked(db,
      'delete from r13_review_preview.events where request_id=$1',
      [requestId],/review evidence is append-only/);
    await expectBlocked(db,
      'truncate r13_review_preview.events',[],/review evidence is append-only/);
    await db.query('ROLLBACK');

    // Even an authenticated session cannot read the unpublished proposals.
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE authenticated');
    await expectBlocked(db,'select * from r13_review_preview.requests',[],
      /permission denied/);
    await db.query('ROLLBACK');
  } finally {
    if(db2)await db2.end().catch(()=>{});
    if(db)await db.end().catch(()=>{});
    if(created)await admin.query('DROP DATABASE "'+fixtureName+'" WITH (FORCE)');
    for(const role of newRoles.reverse())await admin.query('DROP ROLE IF EXISTS '+role);
    await admin.end();
  }
});
