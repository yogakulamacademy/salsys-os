#!/usr/bin/env node
/**
 * Prepare a LOCAL, staging-only SQL working copy with inert scheduled jobs.
 * Never modifies source migration files or executes SQL/network/provider calls.
 * Exact allowlisted source literals are replaced once each; drift fails closed.
 * A safe transform is NOT permission to deploy or proof of complete isolation.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './r2-staging-migration-manifest.mjs';
import { auditStagedMigrationFiles } from './r2-staging-sql-external-effects-audit.mjs';

const scheduler = '20261017091453_automation_runtime_scheduler_foundation_v1.sql';
const websiteFoundation = '007_tenant_schema_foundation.sql';
const websiteEnvironment = '20261022094445_multitenant_tracking_site_binding_v2.sql';
const replacements = [
  [websiteFoundation, "('yogakulam.com'::text)", "('r2-yogakulam.invalid'::text)"],
  [websiteFoundation, "('www.yogakulam.com'::text)", "('www.r2-yogakulam.invalid'::text)"],
  // The original later migration classifies existing websites as production.
  // Only the isolated staging-copy migration must default them to staging.
  [websiteEnvironment, "environment text not null default 'production'", "environment text not null default 'staging'"],
  [scheduler, "'select public.invoke_automation_runtime_scheduler_v1();'", "'select 1;'"],
  [scheduler, "'https://salsysos.com/api/automation/runtime-scheduler'", "'https://staging.invalid/api/automation/runtime-scheduler'"],
  ['20261026143100_closed_won_pipeline_and_auto_archive_v1.sql', "'select public.archive_closed_won_leads_v1(500);'", "'select 1;'"],
  ['20261027094000_schedule_instagram_dm_recovery_v1.sql', '$$select public.retry_instagram_dm_events_v1(10);$$', '$$select 1;$$'],
  ['20261028023743_ensure_instagram_dm_retry_schedule_v1.sql', "'select public.retry_instagram_dm_events_v1(10);'", "'select 1;'"],
  ['20261101164458_r10_outcome_learning_runner_v1.sql', "$cron$select public.sweep_system_intelligence_recommendation_outcomes_v1(null,50,'cron');$cron$", '$cron$select 1;$cron$'],
  ['20261104171500_instagram_outbound_echo_recovery_v1.sql', "'select public.retry_instagram_outbound_echoes_v1(10);'", "'select 1;'", 2],
];
const jobFiles = [...new Set(replacements.filter(x => x[1].includes('select public.')).map(x => x[0]).concat('20261027094000_schedule_instagram_dm_recovery_v1.sql'))].sort();
const changedFiles = [...new Set(replacements.map(x => x[0]))].sort();
const fail = (reason) => {throw Error('BLOCKED_' + reason);};

export function prepareStagingOnlySql({sourceFolder, outputFolder, expectedSourceSha256}) {
  if (!/^[a-f0-9]{64}$/.test(expectedSourceSha256??'')) fail('EXPECTED_SHA_REQUIRED');
  const src=path.resolve(sourceFolder),dst=path.resolve(outputFolder);
  if (src===dst || dst.startsWith(src+path.sep) || src.startsWith(dst+path.sep)) fail('PATH_OVERLAP');
  if (fs.existsSync(dst)) fail('OUTPUT_ALREADY_EXISTS');
  const original=buildManifest(src);
  if(original.manifestSha256!==expectedSourceSha256) fail('SOURCE_MANIFEST_SHA_MISMATCH');
  const before=auditStagedMigrationFiles(src);
  const actualCron=before.candidates.filter(x=>x.kind==='cron_schedule').map(x=>x.file).sort();
  if(JSON.stringify(actualCron)!==JSON.stringify(jobFiles)) fail('UNEXPECTED_CRON_SCHEDULE_FILES');
  if(before.categories.http_execution!==1 || before.categories.extension_network!==1) fail('UNEXPECTED_NETWORK_SQL_SHAPE');
  const changes=[];
  const parts=new Map();
  for (const file of original.files) {
    let s=fs.readFileSync(path.join(src,file.name),'utf8');
    const changesForFile=replacements.filter(x=>x[0]===file.name);
    for (const [,from,to,expectedCount=1] of changesForFile) {
      if (s.split(from).length-1!==expectedCount || s.includes(to)) fail('EXPECTED_SOURCE_LITERAL_DRIFT');
      s=s.split(from).join(to);
    }
    if(changesForFile.length) changes.push({file:file.name,replacements:changesForFile.reduce((n,r)=>n+(r[3]??1),0)});
    parts.set(file.name,s);
  }
  if(changes.length!==changedFiles.length || changes.reduce((n,x)=>n+x.replacements,0)!==replacements.reduce((n,r)=>n+(r[3]??1),0)) fail('REPLACEMENT_COUNT_MISMATCH');
  const candidates=[...parts.entries()].filter(([name,sql])=>/\bcron\s*\.\s*schedule\s*\(/i.test(sql)).map(([name])=>name).sort();
  if(JSON.stringify(candidates)!==JSON.stringify(jobFiles)) fail('POST_TRANSFORM_CRON_INVENTORY_DRIFT');
  // Every literal job command used by cron.schedule() in this exact reviewed
  // historical corpus was explicitly changed to an inert SELECT 1.
  for (const [name,from] of replacements) if(parts.get(name)?.includes(from)) fail('UNREPLACED_ORIGINAL_LITERAL');
  const configuredEndpoint=parts.get(scheduler).match(/\bendpoint_url\s+text\s+not\s+null\s+default\s+'([^']+)'/i);
  if (!configuredEndpoint) fail('STAGING_SCHEDULER_ENDPOINT_MISSING');
  let url;
  try { url=new URL(configuredEndpoint[1]); } catch { fail('STAGING_SCHEDULER_ENDPOINT_INVALID'); }
  if (url.protocol!=='https:' || url.hostname!=='staging.invalid' || url.pathname!=='/api/automation/runtime-scheduler' || url.port || url.username || url.password || url.search || url.hash) fail('STAGING_SCHEDULER_ENDPOINT_NOT_ISOLATED');
  const siteBlock = parts.get(websiteFoundation)?.match(/insert\s+into\s+public\.organization_sites\s*\([\s\S]*?on\s+conflict\s*\(hostname\)[\s\S]*?status\s*=\s*'active';/i)?.[0];
  if (!siteBlock) fail('STAGING_SITE_HOSTS_MISSING');
  // Compare complete SQL hostname values; never use substring URL/domain checks.
  const siteNames = [...siteBlock.matchAll(/\('([^']+)'::text\)/g)].map(match => match[1]).sort();
  if (JSON.stringify(siteNames) !== JSON.stringify(['r2-yogakulam.invalid','www.r2-yogakulam.invalid'])) {
    fail('STAGING_SITE_HOSTS_MISMATCH');
  }
  if (!/\benvironment\s+text\s+not\s+null\s+default\s+'staging'/i.test(parts.get(websiteEnvironment)??'')) fail('STAGING_SITE_ENVIRONMENT_NOT_ISOLATED');
  // Publish the staging-only copy only after all input checks have succeeded.
  fs.mkdirSync(dst,{recursive:false,mode:0o700});
  try {
    for(const [name,sql] of parts) fs.writeFileSync(path.join(dst,name),sql,{flag:'wx',mode:0o600});
    const next=buildManifest(dst);
    const evidence={report:'r2_staging_inert_scheduler_sql_copy_v1',
      sourceManifestSha256:original.manifestSha256,stagingManifestSha256:next.manifestSha256,
      fileCount:next.fileCount,neutralizedJobFiles:jobFiles,isolatedSiteHostnameCount:2,
      isolatedSiteEnvironmentDefault:'staging',sourceChanges:changes,
      productionFilesModified:false,providerAccess:false,databaseWrites:false,
      authorizedToInstall:false,networkIsolationVerified:false};
    return evidence;
  } catch(e) {fs.rmSync(dst,{recursive:true,force:true}); throw e;}
}

function parseCli(args) {
  if(args.length!==6||args[0]!=='--source'||args[2]!=='--output'||args[4]!=='--expected-source-manifest-sha256') fail('CLI_ARGUMENTS');
  return {sourceFolder:args[1],outputFolder:args[3],expectedSourceSha256:args[5]};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {console.log(JSON.stringify(prepareStagingOnlySql(parseCli(process.argv.slice(2))),null,2));}
  catch(e) {const m=String(e.message);console.error(m.startsWith('BLOCKED_')?m:'BLOCKED_UNVERIFIED_ENVIRONMENT');process.exitCode=2;}
}
