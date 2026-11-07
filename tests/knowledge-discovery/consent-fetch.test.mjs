import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const dir=await mkdtemp(join(tmpdir(),'salsys-kb06a-consent-fetch-'));
const policyUrl=pathToFileURL(resolve('lib/knowledge-discovery/url-policy.ts')).href;
let fetchSource=await readFile(resolve('lib/knowledge-discovery/public-fetch.ts'),'utf8');
assert.ok(fetchSource.includes("from './url-policy'"));
fetchSource=fetchSource.replace("from './url-policy'","from '"+policyUrl+"'");
const publicPath=join(dir,'public-fetch.ts');
await writeFile(publicPath,fetchSource,'utf8');
let source=await readFile(resolve('lib/knowledge-discovery/consent-fetch.ts'),'utf8');
assert.ok(source.includes("from './public-fetch'"));
source=source.replace("from './public-fetch'","from '"+pathToFileURL(publicPath).href+"'");
const file=join(dir,'consent-fetch.ts');
await writeFile(file,source,'utf8');
const {withDiscoveryConsent}=await import(pathToFileURL(file).href);
test.after(async()=>{await rm(dir,{recursive:true,force:true});});

const seed=new URL('https://fixture.example.com/');
test('missing or withdrawn consent denies all outbound calls before the transport',async()=>{
  let calls=0,checks=0;
  let current=false;
  const wrapped=withDiscoveryConsent(async()=>{calls++;return {status:200};},
    async hostname=>{checks++;assert.equal(hostname,seed.hostname);return current;});
  await assert.rejects(wrapped(seed,seed,'robots'),e=>e.code==='consent_not_active');
  assert.equal(calls,0);assert.equal(checks,1);
  current=true;
  await wrapped(seed,seed,'robots');
  assert.equal(calls,1);assert.equal(checks,2);
  current=false;
  await assert.rejects(wrapped(seed,seed,'html'),e=>e.code==='consent_not_active');
  assert.equal(calls,1);
});
test('consent withdrawn after initial fetch denies redirect and never authorizes next hop',async()=>{
  let checks=0,redirectFollowed=0;
  const wrapped=withDiscoveryConsent(async(_seed,_page,_kind,authorizeRedirect)=>{
    await authorizeRedirect(new URL('/redirect',seed));
    redirectFollowed++;
    return {status:200};
  },async()=>++checks===1);
  await assert.rejects(wrapped(seed,seed,'html',async()=>{
    throw Error('must_never_reach_redirect_authorization');
  }),e=>e.code==='consent_not_active');
  assert.equal(checks,2);
  assert.equal(redirectFollowed,0);
});
test('fresh consent is checked before request and redirect; existing robots guard is preserved',async()=>{
  const events=[];
  const wrapped=withDiscoveryConsent(async(_seed,_page,_kind,authorizeRedirect)=>{
    events.push('fetch');
    await authorizeRedirect(new URL('/ok',seed));
    return {status:200};
  },async()=>{events.push('consent');return true;});
  await wrapped(seed,seed,'html',async next=>{
    events.push('robots:'+next.pathname);
  });
  assert.deepEqual(events,['consent','fetch','consent','robots:/ok']);
});
