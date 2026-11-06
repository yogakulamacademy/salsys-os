import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const foundation = readFileSync(new URL('./knowledge-discovery.foundation.sql', import.meta.url),'utf8');
const draft = readFileSync(new URL('../../docs/sql/KB-01B-discovery-schema-DRAFT.sql',import.meta.url),'utf8');
const ORG='10000000-0000-4000-8000-000000000001';
const USER='20000000-0000-4000-8000-000000000001';
const ROOT='https://fixture.example.com/';

function requireLocalPostgres() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1');
  const uri=new URL(process.env.SALSYS_TEST_DATABASE_URL ?? '');
  assert.equal(uri.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(uri.hostname),'No remote PostgreSQL');
  assert.equal(uri.pathname,'/postgres','Never use an application DB');
  assert.equal(uri.username,'postgres');
  return uri;
}

async function loadProductionCore() {
  const dir=await mkdtemp(join(tmpdir(),'salsys-discovery-e2e-'));
  const base=resolve('lib/knowledge-discovery');
  const policy=join(dir,'url-policy.ts');
  const fetcher=join(dir,'public-fetch.ts');
  const core=join(dir,'run-core.ts');
  await writeFile(policy,await readFile(join(base,'url-policy.ts'),'utf8'),'utf8');
  let publicSource=await readFile(join(base,'public-fetch.ts'),'utf8');
  publicSource=publicSource.replace("from './url-policy'","from './url-policy.ts'");
  await writeFile(fetcher,publicSource,'utf8');
  let coreSource=await readFile(join(base,'run-core.ts'),'utf8');
  coreSource=coreSource.replace("from './url-policy'","from './url-policy.ts'")
    .replace("from './public-fetch'","from './public-fetch.ts'");
  await writeFile(core,coreSource,'utf8');
  const [{runDiscoveryPageCore},{fetchPublicWeb}] = await Promise.all([
    import(pathToFileURL(core).href),import(pathToFileURL(fetcher).href),
  ]);
  return {dir,runDiscoveryPageCore,fetchPublicWeb};
}

async function serviceContext(db) {
  await db.query('begin');
  await db.query("set local statement_timeout='15s'");
  await db.query("set local role service_role");
  await db.query("select set_config('request.jwt.claims',$1,true)",[
    JSON.stringify({role:'service_role',sub:USER}),
  ]);
}

test('full synthetic discovery tick loop produces truthful partial coverage with no public traffic',async()=>{
  const base=requireLocalPostgres();
  const name='salsys_kb01d_'+randomUUID().replaceAll('-','').slice(0,20);
  const target=new URL(base);target.pathname='/'+name;
  const admin=new Client({connectionString:base.toString()});
  const sessions=[];let created=false;
  const modules=await loadProductionCore();
  await admin.connect();
  try {
    await admin.query('create database "'+name+'"');
    created=true;
    const db=new Client({connectionString:target.toString()});
    sessions.push(db);await db.connect();
    assert.equal((await db.query("select to_regclass('public.organizations') as relation")).rows[0].relation,null);
    await db.query(foundation);
    await db.query(draft);
    await db.query('insert into public.organizations(id) values($1)',[ORG]);
    await db.query('insert into public.test_knowledge_admins(organization_id,user_id) values($1,$2)',[ORG,USER]);
    const createdJob=await db.query(
      'insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url,max_pages) values($1,$2,$3,8) returning id',
      [ORG,USER,ROOT]);
    const jobId=createdJob.rows[0].id;
    await db.query(
      'insert into public.knowledge_discovery_pages(organization_id,job_id,url,depth) values($1,$2,$3,0)',
      [ORG,jobId,ROOT]);

    const hits=[];
    const resolveFixture=async hostname=>{
      assert.equal(hostname,'fixture.example.com');
      return [{address:'1.1.1.1',family:4}];
    };
    const fixtureTransport=async(url,pinnedAddress,family,limit)=>{
      assert.equal(pinnedAddress,'1.1.1.1');
      assert.equal(family,4);
      assert.ok(limit<=512*1024);
      hits.push(url.pathname);
      const bodyResponse=(body,contentType='text/html')=>({
        status:200,location:null,contentType,body,
      });
      switch(url.pathname){
        case '/robots.txt':
          return bodyResponse('User-agent: SalsysOSKnowledgeBot\nDisallow: /private\nCrawl-delay: 2\n','text/plain');
        case '/sitemap.xml':
          return bodyResponse('<urlset><url><loc>https://fixture.example.com/sitemap-only</loc></url></urlset>','text/xml');
        case '/':
          return bodyResponse('<title>Synthetic home</title>'
          +'<a href="/about">About</a><a href="/private">Private</a>'
          +'<a href="/broken">Bad</a><a href="/redirect">Redirect</a><a href="/redirect-private">Private redirect</a>'
          +'<a href="/not-html">PDF</a>'
          +'<a href="http://169.254.169.254/latest/meta-data">Invalid</a>');
        case '/about':return bodyResponse('<title>Synthetic about</title>');
        case '/sitemap-only':return bodyResponse('<title>Via sitemap</title>');
        case '/redirect':return {status:302,location:'/about',contentType:'text/html',body:''};
        case '/redirect-private':return {status:302,location:'/private',contentType:'text/html',body:''};
        case '/broken':return {status:503,location:null,contentType:'text/html',body:'Bad gateway'};
        case '/not-html':return bodyResponse('%PDF-1.7','application/pdf');
        case '/private':throw new Error('Robots blocked page was requested');
        default:throw new Error('Unexpected synthetic URL: '+url.href);
      }
    };
    const fetchSite=(seed,url,kind,authorizeRedirect)=>modules.fetchPublicWeb(
      seed,url,kind,resolveFixture,fixtureTransport,authorizeRedirect);

    const store={
      async pending(claim){
        const rows=await db.query(
          "select id,url,depth,status from public.knowledge_discovery_pages"+
          " where organization_id=$1 and job_id=$2 and status='discovered' order by depth,discovered_at limit 1",
          [claim.organization_id,claim.job_id]);
        return rows.rows[0]??null;
      },
      async commit(args) {
        await serviceContext(db);
        try {
          const result=await db.query(
            "select public.commit_knowledge_discovery_page_v1("+
            "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) as result",[
              args.p_organization_id,args.p_job_id,args.p_page_id,args.p_lease_token,
              args.p_page_status,args.p_http_status,args.p_content_type,args.p_page_title,
              args.p_failure_code,JSON.stringify(args.p_links),args.p_delay_seconds,
            ]);
          await db.query('commit');
          return result.rows[0].result;
        }catch(error){await db.query('rollback');throw error;}
      },
    };
    const results=[];
    for(let i=0;i<12;i++){
      // A deterministic fixture ticks the scheduler without wall clock waiting.
      await db.query(
        "update public.knowledge_discovery_jobs set next_allowed_at=now()-interval '1 second'"+
        " where id=$1 and status='queued'",[jobId]);
      await serviceContext(db);
      const claimed=await db.query('select * from public.claim_knowledge_discovery_job_v1()');
      await db.query('commit');
      if(claimed.rowCount===0)break;
      assert.equal(claimed.rowCount,1);
      assert.equal(claimed.rows[0].job_id,jobId);
      const progress=await modules.runDiscoveryPageCore(claimed.rows[0],store,fetchSite);
      results.push(progress);
      assert.equal(progress.ok,true);
    }
    assert.equal(results.length,8);
    const state=(await db.query(
      'select status,pages_discovered,pages_fetched,pages_blocked,pages_failed,pages_skipped from public.knowledge_discovery_jobs where id=$1',[jobId])).rows[0];
    assert.deepEqual(state,{
      status:'partial',pages_discovered:8,pages_fetched:4,
      pages_blocked:2,pages_failed:2,pages_skipped:0,
    });
    const pages=(await db.query(
      'select url,status,page_title,failure_code from public.knowledge_discovery_pages where job_id=$1',[jobId])).rows;
    const byPath=Object.fromEntries(pages.map(x=>[new URL(x.url).pathname,x]));
    assert.equal(byPath['/'].page_title,'Synthetic home');
    assert.equal(byPath['/private'].status,'blocked');
    assert.equal(byPath['/private'].failure_code,'robots_disallow');
    assert.equal(byPath['/redirect-private'].status,'blocked');
    assert.equal(byPath['/redirect-private'].failure_code,'robots_disallow');
    assert.equal(byPath['/broken'].status,'failed');
    assert.equal(byPath['/broken'].failure_code,'remote_temporarily_unavailable');
    assert.equal(byPath['/not-html'].status,'failed');
    assert.equal(byPath['/not-html'].failure_code,'unsupported_content_type');
    assert.equal(byPath['/sitemap-only'].status,'fetched');
    assert.equal(byPath['/redirect'].status,'fetched');
    assert.equal(hits.includes('/private'),false,'Never fetch robots-disallowed page body');
    assert.equal(hits.includes('/latest/meta-data'),false,'Never follow an internal link');
    assert.equal((await db.query("select to_regclass('public.knowledge_documents') as relation")).rows[0].relation,null,
      'The worker has no AI knowledge publication tables or side effects');
    assert.equal((await db.query(
      "select count(*)::int as n from public.knowledge_discovery_pages where job_id=$1",[jobId])).rows[0].n,8);

    // A separate synthetic scan with a two-page cap may discover more links,
    // but cannot enqueue or fetch an unbounded number of pages.
    // Simulate cooldown elapsed before creating the second synthetic job.
    await db.query(
      "update public.knowledge_discovery_jobs set created_at=now()-interval '16 minutes' where id=$1",
      [jobId]);
    const capRow=await db.query(
      'insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url,max_pages) values($1,$2,$3,2) returning id',
      [ORG,USER,ROOT]);
    const capId=capRow.rows[0].id;
    await db.query(
      'insert into public.knowledge_discovery_pages(organization_id,job_id,url,depth) values($1,$2,$3,0)',
      [ORG,capId,ROOT]);
    const capStatuses=[];
    for(let tick=0;tick<4;tick++){
      await db.query(
        "update public.knowledge_discovery_jobs set next_allowed_at=now()-interval '1 second'"+
        " where id=$1 and status='queued'",[capId]);
      await serviceContext(db);
      const taken=await db.query('select * from public.claim_knowledge_discovery_job_v1()');
      await db.query('commit');
      if(taken.rowCount===0)break;
      assert.equal(taken.rowCount,1);
      assert.equal(taken.rows[0].job_id,capId);
      const outcome=await modules.runDiscoveryPageCore(taken.rows[0],store,fetchSite);
      assert.equal(outcome.ok,true);
      capStatuses.push(outcome.job.status);
    }
    assert.equal(capStatuses.length,2,'Strict two-page crawl cap');
    const capped=await db.query(
      'select status,pages_discovered,max_pages from public.knowledge_discovery_jobs where id=$1',[capId]);
    assert.equal(capped.rows[0].pages_discovered,2);
    assert.equal(capped.rows[0].max_pages,2);
    assert.ok(['completed','partial'].includes(capped.rows[0].status));
    assert.equal((await db.query(
      'select count(*)::int as n from public.knowledge_discovery_pages where job_id=$1',
      [capId])).rows[0].n,2);

  }finally{
    await Promise.allSettled(sessions.map(s=>s.end()));
    try{if(created)await admin.query('drop database "'+name+'" with (force)');}
    finally{await admin.end();await rm(modules.dir,{recursive:true,force:true});}
  }
});
