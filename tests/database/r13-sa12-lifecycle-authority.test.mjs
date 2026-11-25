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
    await db.query(readFileSync('supabase/drafts/r13_sa12_lifecycle_transitions.sql','utf8'));
    await db.query(readFileSync('supabase/drafts/r13_sa12_lifecycle_work_revision.sql','utf8'));
    const bind=async(id,revision,channel='instagram',org=target)=>(await db.query('select saas_lifecycle.bind_new_work($1,$2,$3,$4) as value',[org,channel,id,revision])).rows[0].value;
    const allowed=async(id,channel='instagram',org=target)=>(await db.query('select saas_lifecycle.work_revision_allowed($1,$2,$3) as value',[org,channel,id])).rows[0].value;
    const oldWork=randomUUID(),oldBroadcast=randomUUID(),freshWork=randomUUID(),freshBroadcast=randomUUID();
    assert.equal(await allowed(oldWork),false);
    assert.equal(await bind(oldWork,0),true);
    assert.equal(await bind(oldBroadcast,0,'whatsapp'),true);
    assert.equal(await allowed(oldWork),true);
    assert.equal(await allowed(oldBroadcast,'whatsapp'),true);
    // Synthetic stand-ins for the real claim/prepare RPCs: verify delegation,
    // denial and preserved return values, not provider policy implementation.
    await db.query(`
      create table public.automation_provider_send_audits(id uuid primary key,organization_id uuid,broadcast_campaign_id uuid,broadcast_recipient_id uuid);
      create table public.test_worker_calls(kind text,organization_id uuid,work_id uuid);
      create function public.claim_instagram_automation_run_v1(p_org uuid,p_run uuid,p_now timestamptz) returns jsonb language plpgsql as $stub$begin
        insert into public.test_worker_calls values('instagram',p_org,p_run);
        return jsonb_build_object('ok',true,'claimed',false,'reason','synthetic_policy_denied');
      end;$stub$;
      create function public.prepare_whatsapp_broadcast_provider_send_v1(p_org uuid,p_campaign uuid,p_recipient uuid,p_now timestamptz) returns jsonb language plpgsql as $stub$begin
        insert into public.test_worker_calls values('prepare',p_org,p_campaign);
        return jsonb_build_object('ok',true,'prepared',true,'provider_call_allowed',true);
      end;$stub$;
      create function public.claim_whatsapp_broadcast_provider_send_v1(p_org uuid,p_audit uuid,p_now timestamptz) returns jsonb language plpgsql as $stub$begin
        insert into public.test_worker_calls values('claim',p_org,p_audit);
        return jsonb_build_object('ok',true,'claimed',false,'reason','synthetic_policy_denied');
      end;$stub$;
    `);
    await db.query(readFileSync('supabase/drafts/r13_sa12_lifecycle_claim_adapters.sql','utf8'));
    const oldAudit=randomUUID(),freshAudit=randomUUID(),recipient=randomUUID();
    await db.query("insert into public.automation_provider_send_audits values($1,$2,$3,$4),($5,$2,$6,$4)",[oldAudit,target,oldBroadcast,recipient,freshAudit,freshBroadcast]);
    const igClaim=async(id,org=target)=>(await db.query("select saas_lifecycle.claim_instagram_work_preview($1,$2,now()) as value",[org,id])).rows[0].value;
    const waPrepare=async(id,org=target)=>(await db.query("select saas_lifecycle.prepare_whatsapp_broadcast_preview($1,$2,$3,now()) as value",[org,id,recipient])).rows[0].value;
    const waClaim=async(id,org=target)=>(await db.query("select saas_lifecycle.claim_whatsapp_broadcast_preview($1,$2,now()) as value",[org,id])).rows[0].value;
    const calls=async()=>(await db.query("select count(*)::int as value from public.test_worker_calls")).rows[0].value;
    assert.equal((await igClaim(oldWork)).reason,'synthetic_policy_denied');
    assert.equal((await waPrepare(oldBroadcast)).prepared,true);
    assert.equal((await waClaim(oldAudit)).reason,'synthetic_policy_denied');
    assert.equal(await calls(),3);
    assert.equal((await waClaim(oldAudit,other)).reason,'lifecycle_work_revision_blocked');
    assert.equal((await igClaim(randomUUID())).reason,'lifecycle_work_revision_blocked');
    assert.equal(await calls(),3);
    for(const role of ['anon','authenticated','service_role']){
      for(const sig of ['claim_instagram_work_preview(uuid,uuid,timestamptz)','prepare_whatsapp_broadcast_preview(uuid,uuid,uuid,timestamptz)','claim_whatsapp_broadcast_preview(uuid,uuid,timestamptz)']){
        assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as value",[role,'saas_lifecycle.'+sig])).rows[0].value,false);
      }
    }
    assert.equal(await allowed(oldWork,'whatsapp'),false);
    assert.equal(await allowed(oldWork,'instagram',randomUUID()),false);
    assert.equal(await bind(oldWork,0),false);
    assert.equal(await bind(randomUUID(),1),false);
    assert.equal(await bind(randomUUID(),0,'instagram',platform),false);
    assert.equal(await bind(randomUUID(),0,'instagram',other),false);
    for(const role of ['anon','authenticated','service_role']){
      for(const signature of ['active_work_revision(uuid)','bind_new_work(uuid,text,uuid,bigint)','work_revision_allowed(uuid,text,uuid)']){
        assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as value",[role,'saas_lifecycle.'+signature])).rows[0].value,false);
      }
      assert.equal((await db.query("select has_table_privilege($1,'saas_lifecycle.work_revision_bindings','INSERT,UPDATE,DELETE,SELECT,TRUNCATE') as value",[role])).rows[0].value,false);
    }
    await db.query('update saas_lifecycle.operators set active=true');
    const reason='Synthetic lifecycle test only';
    const change=async(client,action,revision,request,why=reason,confirmation=action+':'+target)=>
      (await client.query('select saas_lifecycle.transition($1,$2,$3,$4,$5,$6,$7,$8) as result',
        [platform,target,action,action==='suspend'?'active':'suspended',revision,request,why,confirmation])).rows[0].result;
    const state=async()=> (await db.query('select status from public.organizations where id=$1',[target])).rows[0].status;
    const count=async()=> (await db.query('select count(*)::int as n from saas_lifecycle.events')).rows[0].n;
    for(const role of ['anon','authenticated','service_role']){
      const row=(await db.query("select has_function_privilege($1,'saas_lifecycle.transition(uuid,uuid,text,text,bigint,uuid,text,text)','EXECUTE') as execute,has_table_privilege($1,'saas_lifecycle.events','INSERT') as insert",[role])).rows[0];
      assert.deepEqual(row,{execute:false,insert:false});
    }
    await assert.rejects(change(db,'suspend',0,randomUUID(),reason,'wrong'),e=>e.code==='22023');
    await assert.rejects(change(db,'suspend',1,randomUUID()),e=>e.code==='40001');
    assert.equal(await count(),0);
    const request=randomUUID();
    const first=await change(db,'suspend',0,request);
    assert.equal(first.new_status,'suspended');assert.equal(first.revision,1);
    assert.equal(await state(),'suspended');assert.equal(await count(),1);
    assert.equal(await allowed(oldWork),false);
    assert.equal(await allowed(oldBroadcast,'whatsapp'),false);
    assert.equal(await bind(freshWork,1),false);
    assert.equal((await igClaim(oldWork)).reason,'lifecycle_work_revision_blocked');
    assert.equal((await waPrepare(oldBroadcast)).provider_call_allowed,false);
    assert.equal((await waClaim(oldAudit)).provider_call_allowed,false);
    assert.equal(await calls(),3);
    assert.equal((await change(db,'suspend',0,request)).replayed,true);
    await assert.rejects(change(db,'suspend',0,request,'Different synthetic reason'),e=>e.code==='23505');
    await assert.rejects(change(db,'suspend',0,randomUUID()),e=>e.code==='40001');
    assert.equal(await count(),1);
    const restore=await change(db,'restore',1,randomUUID());
    assert.equal(restore.revision,2);assert.equal(await state(),'active');
    assert.equal(await allowed(oldWork),false);
    assert.equal(await allowed(oldBroadcast,'whatsapp'),false);
    assert.equal(await bind(oldWork,2),false);
    assert.equal(await bind(oldBroadcast,2,'whatsapp'),false);
    assert.equal(await bind(freshWork,0),false);
    assert.equal(await bind(freshWork,2),true);
    assert.equal(await bind(freshBroadcast,2,'whatsapp'),true);
    assert.equal(await allowed(freshWork),true);
    assert.equal(await allowed(freshBroadcast,'whatsapp'),true);
    assert.equal((await igClaim(oldWork)).reason,'lifecycle_work_revision_blocked');
    assert.equal((await waPrepare(oldBroadcast)).provider_call_allowed,false);
    assert.equal((await waClaim(oldAudit)).provider_call_allowed,false);
    assert.equal(await calls(),3);
    assert.equal((await igClaim(freshWork)).reason,'synthetic_policy_denied');
    assert.equal((await waPrepare(freshBroadcast)).prepared,true);
    assert.equal((await waClaim(freshAudit)).reason,'synthetic_policy_denied');
    assert.equal(await calls(),6);
    for(const statement of ["update saas_lifecycle.work_revision_bindings set lifecycle_revision=2","delete from saas_lifecycle.work_revision_bindings","truncate saas_lifecycle.work_revision_bindings"]){
      await assert.rejects(db.query(statement),e=>e.code==='55000');
    }
    for(const statement of ["update saas_lifecycle.events set reason='Changed reason'","delete from saas_lifecycle.events","truncate saas_lifecycle.events"]){
      await assert.rejects(db.query(statement),e=>e.code==='55000');
    }
    // Inject an audit failure: the state change must roll back as one statement.
    await db.query(`create function saas_lifecycle.test_reject_insert() returns trigger language plpgsql as $audit$begin raise exception 'synthetic audit failure';end;$audit$;
      create trigger test_reject_insert before insert on saas_lifecycle.events for each row execute function saas_lifecycle.test_reject_insert();`);
    await assert.rejects(change(db,'suspend',2,randomUUID()),/synthetic audit failure/);
    assert.equal(await state(),'active');assert.equal(await count(),2);
    await db.query('drop trigger test_reject_insert on saas_lifecycle.events');
    // Two independent connections compete at one expected revision.
    const peer=new pg.Client({connectionString:url.href});
    await peer.connect();
    try{
      await peer.query("select set_config('test.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:actor,session_id:session})]);
      const outcomes=await Promise.allSettled([change(db,'suspend',2,randomUUID()),change(peer,'suspend',2,randomUUID())]);
      assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
      assert.equal(outcomes.filter(x=>x.status==='rejected'&&x.reason.code==='40001').length,1);
      assert.equal(await state(),'suspended');assert.equal(await count(),3);
      await change(db,'restore',3,randomUUID());
      assert.equal(await state(),'active');assert.equal(await count(),4);
      assert.equal(await allowed(freshWork),false);
      assert.equal(await allowed(freshBroadcast,'whatsapp'),false);
      // A concurrent permission revocation must not be bypassed by a stale snapshot.
      await peer.query('begin');
      try{
        await peer.query('update saas_lifecycle.operators set active=false');
        await db.query("set lock_timeout='200ms'");
        await assert.rejects(change(db,'suspend',4,randomUUID()),e=>e.code==='55P03');
        assert.equal(await state(),'active');assert.equal(await count(),4);
        await peer.query('commit');
        await assert.rejects(change(db,'suspend',4,randomUUID()),e=>e.code==='42501');
      }finally{
        await peer.query('rollback');
        await db.query("set lock_timeout=0");
      }
    }finally{await peer.end();}

  }finally{
    if(db)await db.end();
    if(created)await admin.query('drop database "'+dbName+'"');
    for(const role of roles.reverse())await admin.query('drop role '+role);
    await admin.end();
  }
});
