import test from 'node:test';
import assert from 'node:assert/strict';
import {FIXTURE_API_ORIGIN,validateFixtureStatus,fixtureApiUrl,createFixtureFetch} from './knowledge-import-provider-transport.mjs';
test('status is pinned to expected local ports, DB and scheme',()=>{
 const valid={API_URL:'http://localhost:54321',DB_URL:'postgresql://postgres:fixture@localhost:54322/postgres'};
 assert.equal(validateFixtureStatus(valid).hostname,'127.0.0.1');
 for(const API_URL of ['https://example.com','http://127.0.0.1:1234','http://user:pass@127.0.0.1:54321','http://127.0.0.1:54321/other','http://127.0.0.1:54321?x=1'])assert.throws(()=>validateFixtureStatus({...valid,API_URL}),/destination rejected/);
 for(const DB_URL of ['postgresql://postgres:fixture@127.0.0.1:54323/postgres','postgresql://postgres:fixture@127.0.0.1:54322/other','postgresql://postgres:fixture@127.0.0.1:54322/postgres?host=example.com'])assert.throws(()=>validateFixtureStatus({...valid,DB_URL}),/destination rejected/);
});
test('raw and SDK request guard rejects external URLs, alternate ports and authority overrides before transport',async()=>{
 let calls=0;const guard=createFixtureFetch(async(req,init)=>{calls++;assert.equal(req.url,FIXTURE_API_ORIGIN+'/storage/v1/object/fixture');assert.equal(init.redirect,'error');return new Response(null,{status:204});});
 for(const url of ['https://example.com','http://127.0.0.1:8888','http://localhost:54321/storage/v1/object/fixture','http://127.0.0.1:54321.evil.example'])await assert.rejects(()=>guard(url));
 await assert.rejects(()=>guard(new Request(FIXTURE_API_ORIGIN+'/storage/v1/object/fixture',{headers:{'x-forwarded-host':'example.com'}})));
 assert.equal(calls,0);
 const result=await guard(new Request(FIXTURE_API_ORIGIN+'/storage/v1/object/fixture',{method:'POST',body:'synthetic',redirect:'follow'}));
 assert.equal(result.status,204);assert.equal(calls,1);
});
test('TUS returned location only accepts fixed loopback endpoint',()=>{
 assert.equal(fixtureApiUrl('http://localhost:54321/storage/v1/upload/resumable/example').origin,FIXTURE_API_ORIGIN);
 for(const value of ['https://example.com/upload','http://127.0.0.1:54320/upload','http://user@127.0.0.1:54321/upload','http://127.0.0.1:54321/upload#fragment'])assert.throws(()=>fixtureApiUrl(value),/destination rejected/);
});
