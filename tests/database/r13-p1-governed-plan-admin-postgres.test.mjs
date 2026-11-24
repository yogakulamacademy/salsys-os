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
      create schema auth;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false);
      create function auth.role() returns text language sql stable as 'select current_setting(''request.jwt.claim.role'',true)';
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table public.organizations(id uuid primary key,name text not null,slug text unique not null,status text not null);
      create table public.profiles(id uuid primary key,active boolean not null);
      create table public.organization_members(organization_id uuid references public.organizations(id),user_id uuid references public.profiles(id),role text not null,active boolean not null,primary key(organization_id,user_id));
      create function public.get_current_workspace_context_v1() returns jsonb language sql as $ctx$
        select jsonb_build_object('organization_id',m.organization_id,'role',m.role)
        from public.organization_members m where m.user_id=auth.uid() and m.active limit 1;
      $ctx$;
      create table public.workspace_catalog(code text primary key,status text not null);
      insert into public.workspace_catalog values('admin','active'),('sales','active'),('retired','inactive');
      create table public.capability_catalog(code text primary key,name text not null);
      create table public.organization_capabilities(organization_id uuid references public.organizations(id),capability_code text references public.capability_catalog(code),enabled boolean not null,primary key(organization_id,capability_code));
      create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
    `);
    await db.query(readFileSync('supabase/migrations/20261108120000_r13_commercial_state_foundation_v1.sql','utf8'));
    await db.query(readFileSync('supabase/drafts/r13_governed_plan_admin.sql','utf8'));
    await db.query(readFileSync('supabase/drafts/r13_subscription_change_requests.sql','utf8'));
    await db.query(readFileSync('supabase/drafts/r13_subscription_contract_quotes.sql','utf8'));
    await db.query(readFileSync('supabase/drafts/r13_saas_payment_evidence.sql','utf8'));
    const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
    for(const table of ['operators','plan_requests','price_proposals','review_events','publication_authorizations','published_plan_versions']){
      assert.equal(await scalar("select relrowsecurity as value from pg_class where oid=$1::regclass",['saas_governance.'+table]),true);
      for(const role of ['anon','authenticated','service_role']){
        for(const right of ['INSERT','UPDATE','DELETE','TRUNCATE']){
          assert.equal(await scalar("select has_table_privilege($1,$2,$3) as value",[role,'saas_governance.'+table,right]),false);
        }
        if(role!=='service_role'||['operators','publication_authorizations'].includes(table)) assert.equal(await scalar("select has_table_privilege($1,$2,'SELECT') as value",[role,'saas_governance.'+table]),false);
      }
      assert.equal(await scalar('select count(*)::int as value from saas_governance.'+table),0);
    }
    for(const role of ['anon','authenticated']){
      assert.equal(await scalar("select has_schema_privilege($1,'saas_governance','USAGE') as value",[role]),false);
      assert.equal(await scalar("select has_function_privilege($1,'saas_governance.create_plan_request(uuid,text,integer,jsonb,text)','EXECUTE') as value",[role]),false);
    }
    const platform=randomUUID(),tenant=randomUUID(),author=randomUUID(),reviewer=randomUUID(),reviewer2=randomUUID(),publisher=randomUUID(),outsider=randomUUID();
    await db.query("insert into public.organizations values($1,'Platform','salsysos','active'),($2,'Tenant','tenant','active')",[platform,tenant]);
    for(const user of [author,reviewer,reviewer2,publisher,outsider]){
      await db.query("insert into public.profiles values($1,true)",[user]);
      await db.query("insert into public.organization_members values($1,$2,'owner',true)",[user===outsider?tenant:platform,user]);
      await db.query("insert into saas_governance.operators(user_id,platform_organization_id,may_author,may_review,may_publish,active) values($1,$2,true,true,$3,true)",[user,platform,user===publisher||user===author||user===reviewer]);
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
    const publish=(actor,id,digest,rev=3)=>scalar("select public.commercial_publish_initial_plan_v1($1,$2,$3,$4) as value",[actor,id,rev,digest]);
    const pubId=await create(author,'basic',0,{...snapshot,display_name:'Synthetic Basic',amount_minor:12300});
    const pubHash=await scalar("select snapshot_sha256 as value from saas_governance.plan_requests where id=$1",[pubId]);
    assert.equal(await transition(author,pubId,1,pubHash,'submit'),true);
    assert.equal(await transition(reviewer,pubId,2,pubHash,'review'),true);
    await assert.rejects(publish(publisher,pubId,pubHash),/publication authorization required/);
    await assert.rejects(publish(author,pubId,pubHash),/Independent reviewed proposal/);
    await assert.rejects(publish(reviewer,pubId,pubHash),/Independent reviewed proposal/);
    await assert.rejects(publish(reviewer2,pubId,pubHash),/Publication permission required/);
    await assert.rejects(db.query("insert into saas_governance.publication_authorizations(request_id,snapshot_sha256,authorized_publisher,commercial_approval_ref,release_approval_ref,expires_at) values($1,$2,$3,'synthetic commercial approval','synthetic release approval',clock_timestamp()+interval '1 hour')",[pubId,pubHash,publisher]),/permission denied/);
    await db.query('reset role');
    await db.query("insert into saas_governance.publication_authorizations(request_id,snapshot_sha256,authorized_publisher,commercial_approval_ref,release_approval_ref,expires_at) values($1,$2,$3,'synthetic commercial approval','synthetic release approval',clock_timestamp()+interval '1 hour')",[pubId,pubHash,publisher]);
    await db.query('set role service_role');
    await assert.rejects(publish(publisher,pubId,'0'.repeat(64)),/Independent reviewed proposal/);
    const planId=await publish(publisher,pubId,pubHash);
    assert.equal(await publish(publisher,pubId,pubHash),planId);
    assert.equal(await scalar("select count(*)::int as value from saas_governance.published_plan_versions where request_id=$1",[pubId]),1);
    assert.equal(await scalar("select amount_minor::int as value from saas_governance.published_plan_versions where request_id=$1",[pubId]),12300);
    assert.equal(await scalar("select status as value from public.saas_plans where id=$1",[planId]),'active');
    await assert.rejects(db.query("update saas_governance.published_plan_versions set amount_minor=1 where request_id=$1",[pubId]),/permission denied/);
    const nextId=await create(author,'basic',1,{...snapshot,display_name:'Synthetic Basic v2',amount_minor:45600});
    const nextHash=await scalar("select snapshot_sha256 as value from saas_governance.plan_requests where id=$1",[nextId]);
    assert.equal(await transition(author,nextId,1,nextHash,'submit'),true);
    assert.equal(await transition(reviewer,nextId,2,nextHash,'review'),true);
    await db.query('reset role');
    await db.query("insert into saas_governance.publication_authorizations(request_id,snapshot_sha256,authorized_publisher,commercial_approval_ref,release_approval_ref,expires_at) values($1,$2,$3,'synthetic commercial approval','synthetic release approval',clock_timestamp()+interval '1 hour')",[nextId,nextHash,publisher]);
    await assert.rejects(db.query("delete from saas_governance.published_plan_versions where request_id=$1",[pubId]),/immutable/);
    await db.query('set role service_role');
    await assert.rejects(publish(publisher,nextId,nextHash),/Existing plan version changes/);
    assert.equal(await scalar("select version as value from public.saas_plans where id=$1",[planId]),1);
    const stale=await create();
    const staleHash=await scalar("select snapshot_sha256 as value from saas_governance.plan_requests where id=$1",[stale]);
    await db.query('reset role');
    await assert.rejects(db.query("update saas_governance.price_proposals set amount_minor=1 where request_id=$1",[id]),/immutable/);
    await assert.rejects(db.query("delete from saas_governance.review_events where request_id=$1",[id]),/immutable/);
    assert.equal(await scalar("select count(*)::int as value from public.saas_plans"),1);
    assert.equal(await scalar("select count(*)::int as value from public.saas_plan_entitlements"),0);
    assert.equal(await scalar("select count(*)::int as value from public.saas_organization_subscriptions"),0);
    await db.query("insert into public.saas_plans(code,display_name,version) values('free','Synthetic version conflict',1)");
    await db.query('set role service_role');
    await assert.rejects(transition(author,stale,1,staleHash,'submit'),/version changed/);
    assert.equal(await scalar("select revision as value from saas_governance.plan_requests where id=$1",[stale]),1);
    await db.query('reset role');
    const free=await scalar("select id as value from public.saas_plans where code='free'");
    const customer=outsider;
    await db.query("insert into auth.users values($1,now(),false),($2,now(),false)",[customer,author]);
    await db.query("insert into public.saas_organization_subscriptions(organization_id,plan_id,status) values($1,$2,'active'),($3,$2,'active')",[tenant,free,platform]);
    const before=await scalar("select count(*)::int as value from public.saas_subscription_events");
    await db.query("select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",[customer]);
    await db.query('set role authenticated');
    const options=()=>scalar("select public.get_current_plan_change_options_v1() as value");
    const request=(key,version,digest,revision)=>scalar("select public.request_current_plan_change_v1($1,$2,$3,$4,$5) as value",[key,planId,version,digest,revision]);
    assert.equal((await options()).state,'unavailable');
    await db.query('reset role');
    await db.query("insert into saas_governance.change_request_access values($1,true,'synthetic approval only'),($2,true,'synthetic approval only')",[tenant,platform]);
    await db.query('set role authenticated');
    const offer=await options();
    assert.equal(offer.state,'available');
    assert.equal(offer.offers.length,1);
    assert.equal(offer.offers[0].amount_minor,12300);
    const key=randomUUID();
    await assert.rejects(request(key,1,'0'.repeat(64),offer.subscription_revision),/Offer changed/);
    await assert.rejects(request(key,1,pubHash,'2000-01-01T00:00:00Z'),/Subscription changed/);
    const change=await request(key,1,pubHash,offer.subscription_revision);
    assert.equal(await request(key,1,pubHash,offer.subscription_revision),change);
    await assert.rejects(request(key,2,pubHash,offer.subscription_revision),/Request key already used/);
    await assert.rejects(request(randomUUID(),1,pubHash,offer.subscription_revision),/subscription_one_pending_change_v1/);
    assert.equal((await options()).requests[0].id,change);
    await db.query('reset role');
    await db.query("update saas_governance.operators set may_quote=true where user_id=$1",[publisher]);
    await db.query('set role service_role');
    const quote=(actor,setup=0,tax=200)=>scalar("select public.commercial_prepare_contract_quote_v1($1,$2,$3,$4,'Synthetic quote review') as value",[actor,change,setup,tax]);
    await assert.rejects(quote(author),/Quote permission required/);
    await assert.rejects(quote(publisher,1),/Setup charge outside approved range/);
    const quoteId=await quote(publisher);
    assert.equal(await quote(publisher),quoteId);
    await assert.rejects(quote(publisher,0,201),/Existing quote differs/);
    await db.query('reset role');
    const quoted=(await db.query("select terms::text as serialized,terms_digest,first_period_total_minor::int from saas_governance.subscription_contract_quotes where id=$1",[quoteId])).rows[0];
    assert.equal(quoted.terms_digest,createHash('sha256').update(quoted.serialized).digest('hex'));
    assert.equal(quoted.first_period_total_minor,12500);
    await assert.rejects(db.query("update saas_governance.subscription_contract_quotes set tax_minor=0 where id=$1",[quoteId]),/immutable/);
    await db.query('set role authenticated');
    const quotes=()=>scalar("select public.get_current_contract_quotes_v1() as value");
    const accept=(digest)=>scalar("select public.accept_current_contract_quote_v1($1,$2) as value",[quoteId,digest]);
    assert.equal((await quotes())[0].state,'awaiting_acceptance');
    assert.equal((await quotes())[0].first_period_total_minor,12500);
    assert.equal(await accept('0'.repeat(64)),false);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[author]);
    assert.deepEqual(await quotes(),[]);
    assert.equal(await accept(quoted.terms_digest),false);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[customer]);
    assert.equal(await accept(quoted.terms_digest),true);
    assert.equal(await accept(quoted.terms_digest),true);
    assert.equal((await quotes())[0].state,'accepted_not_activated');
    // No payment intent or settlement API is exposed in this candidate.
    await db.query('reset role');
    const merchant=randomUUID(),otherMerchant=randomUUID();
    await db.query("insert into saas_governance.saas_payment_merchants(id,provider_code,merchant_ref,environment,enabled,approval_ref) values($1,'fixture','synthetic-merchant','test',true,'synthetic approval only'),($2,'fixture','other-merchant','test',true,'synthetic approval only')",[merchant,otherMerchant]);
    for(const role of ['anon','authenticated','service_role']){
      for(const fn of ['prepare_payment_intent(uuid,text,uuid)','record_verified_settlement(uuid)']){
        assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE') as value",[role,'saas_governance.'+fn]),false);
      }
      for(const table of ['saas_payment_merchants','saas_payment_intents','saas_payment_orders','saas_payment_attestations','saas_payment_settlements']){
        for(const right of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
          assert.equal(await scalar("select has_table_privilege($1,$2,$3) as value",[role,'saas_governance.'+table,right]),false);
        }
        assert.equal(await scalar("select relrowsecurity as value from pg_class where oid=$1::regclass",['saas_governance.'+table]),true);
      }
    }
    const prepare=(digest=quoted.terms_digest,m=merchant)=>scalar("select saas_governance.prepare_payment_intent($1,$2,$3) as value",[quoteId,digest,m]);
    await assert.rejects(prepare('0'.repeat(64)),/Payable quote unavailable/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[author]);
    await assert.rejects(prepare(),/Payable quote unavailable/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[customer]);
    const paymentIntent=await prepare();
    assert.equal(await prepare(),paymentIntent);
    await assert.rejects(prepare(quoted.terms_digest,otherMerchant),/different consent/);
    assert.equal(await scalar("select amount_minor::int as value from saas_governance.saas_payment_intents where id=$1",[paymentIntent]),12500);
    await db.query("insert into saas_governance.saas_payment_orders(intent_id,merchant_id,provider_order_ref) values($1,$2,'synthetic-order')",[paymentIntent,merchant]);
    const attest=async ({m=merchant,order='synthetic-order',payment='synthetic-payment',digest=quoted.terms_digest,amount=12500,status='settled',late=false}={})=>scalar(
      "insert into saas_governance.saas_payment_attestations(intent_id,merchant_id,provider_order_ref,provider_payment_ref,provider_event_ref,terms_digest,currency,amount_minor,provider_status,provider_observed_at,evidence_sha256,verification_ref) values($1,$2,$3,$4,$5,$6,'INR',$7,$8,case when $9 then (select expires_at+interval '1 second' from saas_governance.saas_payment_intents where id=$1) else clock_timestamp() end,$10,'synthetic provider fixture') returning id as value",
      [paymentIntent,m,order,payment,randomUUID(),digest,amount,status,late,'a'.repeat(64)]);
    const settle=(id)=>scalar("select saas_governance.record_verified_settlement($1) as value",[id]);
    await assert.rejects(settle(randomUUID()),/Verified evidence unavailable/);
    for(const wrong of [{amount:12499},{amount:12501},{m:otherMerchant},{order:'other-order'},{digest:'b'.repeat(64)},{status:'failed'},{late:true}]){
      await assert.rejects(settle(await attest(wrong)),/Settlement evidence mismatch/);
    }
    assert.equal(await scalar("select count(*)::int as value from saas_governance.saas_payment_settlements"),0);
    const valid=await attest();
    assert.equal(await settle(valid),paymentIntent);
    assert.equal(await settle(valid),paymentIntent);
    assert.equal(await settle(await attest()),paymentIntent);
    await assert.rejects(settle(await attest({payment:'duplicate-charge'})),/Different payment already recorded/);
    await attest({status:'refunded'});
    await assert.rejects(settle(valid),/adverse-event reconciliation/);
    assert.equal(await scalar("select count(*)::int as value from saas_governance.saas_payment_settlements"),1);
    await assert.rejects(db.query("delete from saas_governance.saas_payment_attestations where id=$1",[valid]),/immutable/);
    await assert.rejects(db.query("update saas_governance.saas_payment_intents set amount_minor=1 where id=$1",[paymentIntent]),/immutable/);
    await db.query('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[author]);
    assert.deepEqual((await options()).requests,[]);
    assert.equal(await scalar("select public.withdraw_current_plan_change_v1($1) as value",[change]),false);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[customer]);
    await db.query('reset role');
    await db.query("update saas_governance.change_request_access set enabled=false where organization_id=$1",[tenant]);
    await db.query('set role authenticated');
    assert.equal(await scalar("select public.withdraw_current_plan_change_v1($1) as value",[change]),true);
    assert.equal(await scalar("select public.withdraw_current_plan_change_v1($1) as value",[change]),false);
    assert.equal((await options()).requests[0].status,'withdrawn');
    assert.equal((await quotes())[0].state,'withdrawn');
    assert.equal(await accept(quoted.terms_digest),false);
    await db.query('reset role');
    await assert.rejects(prepare(),/Plan changes unavailable|Subscription changed/);
    assert.equal(await scalar("select plan_id as value from public.saas_organization_subscriptions where organization_id=$1",[tenant]),free);
    assert.equal(await scalar("select count(*)::int as value from public.saas_subscription_events"),before);
    assert.equal(await scalar("select count(*)::int as value from saas_governance.subscription_change_events where request_id=$1",[change]),2);
    assert.equal(await scalar("select count(*)::int as value from saas_governance.subscription_contract_acceptances where quote_id=$1",[quoteId]),1);
    await assert.rejects(db.query("delete from saas_governance.subscription_contract_acceptances where quote_id=$1",[quoteId]),/immutable/);
    await assert.rejects(db.query("delete from saas_governance.subscription_change_events where request_id=$1",[change]),/immutable/);
    for(const role of ['anon','service_role']){
      assert.equal(await scalar("select has_function_privilege($1,'public.request_current_plan_change_v1(uuid,uuid,integer,text,timestamptz)','EXECUTE') as value",[role]),false);
    }
  } finally {
    if(peer)await peer.end().catch(()=>{});
    if(db)await db.end().catch(()=>{});
    if(created)await admin.query('drop database "'+database+'" with (force)');
    for(const role of roles.reverse())await admin.query('drop role if exists '+role);
    await admin.end();
  }
});
