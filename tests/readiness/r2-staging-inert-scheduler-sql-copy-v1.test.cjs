const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const script=path.resolve(__dirname,'../../scripts/r2-staging-inert-scheduler-sql-copy.mjs');
const samples={
 '007_tenant_schema_foundation.sql':
  "insert into public.organization_sites (organization_id,hostname,status) select o.id, x.hostname, 'active' from public.organizations o cross join (values ('yogakulam.com'::text), ('www.yogakulam.com'::text)) as x(hostname) where o.slug='yogakulam-academy' on conflict (hostname) do update set organization_id=excluded.organization_id,status = 'active';",
 '20261022094445_multitenant_tracking_site_binding_v2.sql':
  "alter table public.organization_sites add column if not exists environment text not null default 'production', add column if not exists settings jsonb not null default '{}'::jsonb;",
 '20261017091453_automation_runtime_scheduler_foundation_v1.sql':
  "create extension if not exists pg_net; create or replace function public.invoke_automation_runtime_scheduler_v1() returns bigint language plpgsql security definer set search_path = public, vault, net, pg_catalog as $$\\nbegin\\n  perform (select count(*) from vault.decrypted_secrets);\\n  perform net.http_get('https://example.invalid');\\n  return null;\\nend;\\n$$; create table public.automation_scheduler_settings (endpoint_url text not null default 'https://salsysos.com/api/automation/runtime-scheduler'); do $ begin perform cron.schedule('scheduler','* * * * *','select public.invoke_automation_runtime_scheduler_v1();'); end $;",
 '20261026143100_closed_won_pipeline_and_auto_archive_v1.sql':
  "do $$ begin perform cron.schedule('archive','7 * * * *','select public.archive_closed_won_leads_v1(500);'); end $$;",
 '20261027094000_schedule_instagram_dm_recovery_v1.sql':
  "select cron.schedule('instagram','* * * * *',$$select public.retry_instagram_dm_events_v1(10);$$);",
 '20261028023743_ensure_instagram_dm_retry_schedule_v1.sql':
  "do $$ begin perform cron.schedule('instagram','* * * * *','select public.retry_instagram_dm_events_v1(10);'); end $$;",
 '20261101164458_r10_outcome_learning_runner_v1.sql':
  "do $$ begin perform cron.schedule('outcomes','*/15 * * * *',$cron$select public.sweep_system_intelligence_recommendation_outcomes_v1(null,50,'cron');$cron$); end $$;",
 '20261104171500_instagram_outbound_echo_recovery_v1.sql':
  "do $ begin perform cron.schedule('echo','*/2 * * * *','select public.retry_instagram_outbound_echoes_v1(10);'); perform cron.alter_job(job_id:=1, active:=false); if exists(select 1 from cron.job where command = 'select public.retry_instagram_outbound_echoes_v1(10);') then null; end if; end $;"
};
async function fixture(cb,overrides={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r2-stage-inert-'));
 const src=path.join(dir,'original'),dst=path.join(dir,'isolated');
 fs.mkdirSync(src);
 for(const [name,sql] of Object.entries({...samples,...overrides}))fs.writeFileSync(path.join(src,name),sql);
 const helper=await import('../../scripts/r2-staging-inert-scheduler-sql-copy.mjs');
 const manifest=await import('../../scripts/r2-staging-migration-manifest.mjs');
 const digest=manifest.buildManifest(src).manifestSha256;
 try{return await cb({dir,src,dst,helper,manifest,digest});}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('stage-only copy replaces all six jobs with inert commands and rewrites only the endpoint',async()=>{
 await fixture(({src,dst,helper,manifest,digest})=>{
  const original=Object.fromEntries(Object.keys(samples).map(k=>[k,fs.readFileSync(path.join(src,k),'utf8')]));
  const out=helper.prepareStagingOnlySql({sourceFolder:src,outputFolder:dst,expectedSourceSha256:digest});
  assert.equal(out.fileCount,8);
  assert.equal(out.isolatedSiteEnvironmentDefault,'staging');
  assert.equal(out.schedulerFunctionInert,true);
  assert.equal(out.isolatedSiteHostnameCount,2);
  assert.equal(out.sourceManifestSha256,digest);
  assert.notEqual(out.stagingManifestSha256,digest);
  assert.equal(out.authorizedToInstall,false);
  assert.equal(out.providerAccess,false);
  for(const name of Object.keys(samples)){
   assert.equal(fs.readFileSync(path.join(src,name),'utf8'),original[name]);
   const changed=fs.readFileSync(path.join(dst,name),'utf8');
   if(name==='007_tenant_schema_foundation.sql') {
    const actualHosts=[...changed.matchAll(/\('([^']+)'::text\)/g)].map(x=>x[1]).sort();
    assert.deepEqual(actualHosts,['r2-yogakulam.invalid','www.r2-yogakulam.invalid']);
   } else if(name==='20261022094445_multitenant_tracking_site_binding_v2.sql') {
    assert.match(changed,/environment text not null default 'staging'/);
    assert.doesNotMatch(changed,/environment text not null default 'production'/);
   } else {
    assert.match(changed,/cron\.schedule/);
    assert.ok(changed.includes('select 1;'));
    assert.doesNotMatch(changed,/select public\.(?:invoke_automation_runtime_scheduler_v1|archive_closed_won_leads_v1|retry_instagram_dm_events_v1|sweep_system_intelligence_recommendation_outcomes_v1|retry_instagram_outbound_echoes_v1)\(/);
   }
  }
  assert.match(fs.readFileSync(path.join(dst,'20261017091453_automation_runtime_scheduler_foundation_v1.sql'),'utf8'),/https:\/\/staging\.invalid\/api\/automation\/runtime-scheduler/);
  const stagedScheduler=fs.readFileSync(path.join(dst,'20261017091453_automation_runtime_scheduler_foundation_v1.sql'),'utf8');
  assert.match(stagedScheduler,/create or replace function public\\.invoke_automation_runtime_scheduler_v1\\(\\)/);
  assert.match(stagedScheduler,/begin\\s*-- Staging-only: no pg_net calls and no reads from Vault, regardless of settings\\.\\s*return null;\\s*end;/);
  assert.doesNotMatch(stagedScheduler,/net\\.http_get\\s*\\(/);
  assert.doesNotMatch(stagedScheduler,/vault\\.decrypted_secrets/);
  assert.equal(manifest.buildManifest(dst).manifestSha256,out.stagingManifestSha256);
 });
});

test('unexpected live-site hostname source drift is rejected before output',async()=>{
 await fixture(({dst,src,helper,digest})=>{
  const srcSite=fs.readFileSync(path.join(src,'007_tenant_schema_foundation.sql'),'utf8');
  fs.writeFileSync(path.join(src,'007_tenant_schema_foundation.sql'),srcSite.replace("('www.yogakulam.com'::text)","('www.other-live-domain.com'::text)"));
  assert.throws(()=>helper.prepareStagingOnlySql({sourceFolder:src,outputFolder:dst,expectedSourceSha256:digest}),/BLOCKED_/);
  assert.equal(fs.existsSync(dst),false);
 });
});

test('changed source website environment definition fails closed even with updated source digest',async()=>{
 await fixture(({src,dst,helper,manifest})=>{
  const file='20261022094445_multitenant_tracking_site_binding_v2.sql';
  const value=fs.readFileSync(path.join(src,file),'utf8');
  fs.writeFileSync(path.join(src,file),value.replace("default 'production'","default 'development'"));
  const updatedDigest=manifest.buildManifest(src).manifestSha256;
  assert.throws(()=>helper.prepareStagingOnlySql({sourceFolder:src,outputFolder:dst,expectedSourceSha256:updatedDigest}),/BLOCKED_EXPECTED_SOURCE_LITERAL_DRIFT/);
  assert.equal(fs.existsSync(dst),false);
 });
});

test('network-capable scheduler source drift is blocked even when manifest is recomputed',async()=>{
 await fixture(({src,dst,helper,manifest})=>{
  const file='20261017091453_automation_runtime_scheduler_foundation_v1.sql';
  const original=fs.readFileSync(path.join(src,file),'utf8');
  fs.writeFileSync(path.join(src,file),original.replace('vault.decrypted_secrets','vault.other_secrets'));
  const sourceDigest=manifest.buildManifest(src).manifestSha256;
  assert.throws(()=>helper.prepareStagingOnlySql({sourceFolder:src,outputFolder:dst,expectedSourceSha256:sourceDigest}),/BLOCKED_UNEXPECTED_SCHEDULER_FUNCTION_SHAPE/);
  assert.equal(fs.existsSync(dst),false);
 });
});

test('unknown cron schedule fails and leaves destination absent',async()=>{
 await fixture(({src,dst,helper,digest})=>{
  assert.throws(()=>helper.prepareStagingOnlySql({sourceFolder:src,outputFolder:dst,expectedSourceSha256:digest}),/BLOCKED_/);
  assert.equal(fs.existsSync(dst),false);
 },{'20261109999999_unapproved_cron.sql':"select cron.schedule('oops','* * * * *','select another_unsafe_func();');"});
});

test('source digest mismatch and missing file fail closed',async()=>{
 await fixture(({src,dst,helper,digest})=>{
  assert.throws(()=>helper.prepareStagingOnlySql({sourceFolder:src,outputFolder:dst,expectedSourceSha256:'0'.repeat(64)}),/BLOCKED_/);
  fs.rmSync(path.join(src,'20261027094000_schedule_instagram_dm_recovery_v1.sql'));
  assert.throws(()=>helper.prepareStagingOnlySql({sourceFolder:src,outputFolder:dst,expectedSourceSha256:digest}),/BLOCKED_/);
  assert.equal(fs.existsSync(dst),false);
 });
});

test('target cannot overwrite an existing directory or contain the source',async()=>{
 await fixture(({src,dst,helper,digest})=>{
  fs.mkdirSync(dst);
  assert.throws(()=>helper.prepareStagingOnlySql({sourceFolder:src,outputFolder:dst,expectedSourceSha256:digest}),/BLOCKED_/);
  assert.throws(()=>helper.prepareStagingOnlySql({sourceFolder:src,outputFolder:path.join(src,'inside'),expectedSourceSha256:digest}),/BLOCKED_/);
 });
});

test('CLI fails closed without complete arguments and never invokes provider',()=>{
 const r=spawnSync(process.execPath,[script],{encoding:'utf8'});
 assert.equal(r.status,2);assert.match(r.stderr,/BLOCKED_CLI_ARGUMENTS/);
 const code=fs.readFileSync(script,'utf8');
 assert.doesNotMatch(code,/\b(?:fetch\(|supabase db push|apply_migration\(|create_project\()/);
});
