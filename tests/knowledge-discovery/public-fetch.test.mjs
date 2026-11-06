import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = resolve('lib/knowledge-discovery/public-fetch.ts');
const policyPath = pathToFileURL(resolve('lib/knowledge-discovery/url-policy.ts')).href;
const dir = await mkdtemp(join(tmpdir(), 'salsys-kb-fetch-'));
let source = await readFile(sourcePath, 'utf8');
assert.ok(source.includes("from './url-policy'"), 'Source import moved; review test harness.');
source = source.replace("from './url-policy'", "from '" + policyPath + "'");
const tempFile = join(dir, 'public-fetch.ts');
await writeFile(tempFile, source, 'utf8');
const { fetchPublicWeb, evaluateRobots, discoverHtmlLinks, discoverSitemapLinks, readHtmlTitle } =
  await import(pathToFileURL(tempFile).href);
test.after(async () => { await rm(dir, { recursive: true, force: true }); });

test('robots rules respect longest matching allow and specific bot groups', () => {
  const robots = [
    'User-agent: *', 'Disallow: /private', 'Allow: /private/public',
    '', 'User-agent: SalsysOSKnowledgeBot', 'Disallow: /staff',
    'Allow: /staff/public', 'Crawl-delay: 3',
  ].join('\n');
  assert.deepEqual(evaluateRobots(robots, '/staff/list'), { allowed: false, delaySeconds: 3 });
  assert.deepEqual(evaluateRobots(robots, '/staff/public/help'), { allowed: true, delaySeconds: 3 });
  assert.deepEqual(evaluateRobots(robots, '/private', 'otherbot'), { allowed: false, delaySeconds: 0 });
  assert.deepEqual(evaluateRobots(robots, '/private/public', 'otherbot'), { allowed: true, delaySeconds: 0 });
});

test('discovered links stay on domain and remove query tracking', () => {
  const seed = new URL('https://yogakulam.com/');
  const page = new URL('https://yogakulam.com/courses/');
  const html = '<title>Sample</title>'
    + '<a href="/about?utm_source=abc">About</a>'
    + '<a href="https://evil-yogakulam.com/">Bad</a>'
    + '<a href="javascript:alert(1)">Unsafe</a>'
    + '<a href="/about#section">Duplicate</a>'
    + '<a href="/guide.pdf">PDF</a>';
  assert.deepEqual(discoverHtmlLinks(seed, page, html), ['https://yogakulam.com/about']);
  assert.equal(readHtmlTitle('<title>  Courses  &amp;  Teachers </title>'), 'Courses &amp; Teachers');
});

test('sitemap extracts same-site locations and ignores nested XML', () => {
  const seed = new URL('https://yogakulam.com/');
  const sitemap = '<urlset><url><loc>https://yogakulam.com/a?a=2</loc></url>'
    + '<url><loc>https://other.site/b</loc></url>'
    + '<loc>https://yogakulam.com/extra.xml</loc></urlset>';
  assert.deepEqual(discoverSitemapLinks(seed, seed, sitemap), ['https://yogakulam.com/a']);
});

test('revalidates each redirect and pins the verified address per hop', async () => {
  const seed=new URL('https://yogakulam.com/');
  const resolved=[];
  const requested=[];
  const resolver=async host=>{resolved.push(host);return [{address:'8.8.8.8',family:4}];};
  const transport=async (url,address,family,limit)=> {
    requested.push([url.href,address,family,limit]);
    if(url.pathname==='/')return {status:302,location:'/about',contentType:'text/html',body:''};
    return {status:200,location:null,contentType:'text/html; charset=utf-8',body:'<title>About</title>'};
  };
  const checked=[];
  const result=await fetchPublicWeb(seed,seed,'html',resolver,transport,async next=>{
    checked.push(next.pathname);
  });
  assert.deepEqual(checked,['/about']);
  assert.equal(result.url,'https://yogakulam.com/about');
  assert.equal(result.body,'<title>About</title>');
  assert.deepEqual(resolved,['yogakulam.com','yogakulam.com']);
  assert.equal(requested.length,2);
  assert.ok(requested.every(item=>item[1]==='8.8.8.8' && item[2]===4 && item[3]===512*1024));
});

test('blocks off-site redirects before any unsafe network connection', async () => {
  const seed=new URL('https://yogakulam.com/');
  let attempts=0;
  const resolver=async()=>[{address:'8.8.8.8',family:4}];
  const transport=async()=>{
    attempts++;
    return {status:302,location:'http://169.254.169.254/latest/meta-data',
      contentType:'text/html',body:''};
  };
  await assert.rejects(fetchPublicWeb(seed,seed,'html',resolver,transport),/redirect_out_of_scope/);
  assert.equal(attempts,1);
});

test('rejects DNS rebinding-style mixed public/private records before fetch', async () => {
  const seed=new URL('https://yogakulam.com/');
  let attempts=0;
  const resolver=async()=>[{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}];
  const transport=async()=>{attempts++;return {status:200,location:null,contentType:'text/html',body:'ok'};};
  await assert.rejects(fetchPublicWeb(seed,seed,'html',resolver,transport),/exclusively.*public/);
  assert.equal(attempts,0);
});

test('unsupported content types never count as fetched HTML', async () => {
  const seed=new URL('https://yogakulam.com/');
  const resolver=async()=>[{address:'8.8.8.8',family:4}];
  const transport=async()=>({status:200,location:null,contentType:'application/pdf',body:'not html'});
  await assert.rejects(fetchPublicWeb(seed,seed,'html',resolver,transport),/unsupported_content_type/);
});


test('redirecting HTML or sitemap without rechecking robots fails closed', async () => {
  const seed=new URL('https://yogakulam.com/');
  const resolver=async()=>[{address:'8.8.8.8',family:4}];
  let attempts=0;
  const transport=async()=>{
    attempts++;
    return {status:302,location:'/private',contentType:'text/html',body:''};
  };
  for(const kind of ['html','sitemap']){
    await assert.rejects(fetchPublicWeb(seed,seed,kind,resolver,transport),/redirect_robots_required/);
  }
  assert.equal(attempts,2,'Never fetched either redirect destination');
});


test('ownership proof refuses forwarding redirects or non-plaintext responses',async()=>{
  const seed=new URL('https://yogakulam.com/');
  const url=new URL('/.well-known/salsysos-verification.txt',seed);
  const resolver=async()=>[{address:'8.8.8.8',family:4}];
  let requests=0;
  const redirect=async()=>{
    requests++;
    return {status:302,location:'https://www.yogakulam.com/proof',
      contentType:'text/plain',body:''};
  };
  await assert.rejects(fetchPublicWeb(seed,url,'verification',resolver,redirect),
    /verification_redirect_not_allowed/);
  assert.equal(requests,1);
  const html=async()=>({status:200,location:null,contentType:'text/html',body:'<html>bad</html>'});
  await assert.rejects(fetchPublicWeb(seed,url,'verification',resolver,html),
    /unsupported_content_type/);
});


test('KB-06A robots redirect rechecks supplied consent guard before another HTTP request',async()=>{
  const seed=new URL('https://fixture.example.com/');
  const robots=new URL('/robots.txt',seed);
  let requests=0,guards=0;
  const resolver=async()=>[{address:'8.8.8.8',family:4}];
  const transport=async()=>{
    requests++;
    return {status:302,location:'/robots-next.txt',
      contentType:'text/plain',body:''};
  };
  await assert.rejects(
    fetchPublicWeb(seed,robots,'robots',resolver,transport,async()=>{
      guards++;
      throw Error('consent_withdrawn_during_redirect');
    }),
    /consent_withdrawn_during_redirect/,
  );
  assert.equal(requests,1);
  assert.equal(guards,1);
});
