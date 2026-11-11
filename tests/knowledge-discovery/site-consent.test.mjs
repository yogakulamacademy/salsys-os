import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverySiteConsentActive } from '../../lib/knowledge-discovery/site-consent.ts';

const org='10000000-0000-4000-8000-000000000001';
const owner='20000000-0000-4000-8000-000000000001';
const host='fixture.example.com';
const now=Date.parse('2026-11-06T12:00:00Z');
const active=()=>({
  organization_id:org,hostname:host,purpose:'website_discovery_review_only',
  status:'granted',policy_version:'synthetic-test-v1',granted_by:owner,
  granted_at:'2026-11-05T10:00:00Z',
  valid_until:'2026-11-07T10:00:00Z',withdrawn_at:null,
});

test('explicit active consent belongs to exact organization, host and declared discovery purpose',()=>{
  assert.equal(discoverySiteConsentActive(active(),org,host,now),true);
  assert.equal(discoverySiteConsentActive(active(),org,'another.example.com',now),false);
  assert.equal(discoverySiteConsentActive(active(),'10000000-0000-4000-8000-000000000002',host,now),false);
  assert.equal(discoverySiteConsentActive(active(),org,'fixture.example.com.evil.net',now),false);
  assert.equal(discoverySiteConsentActive(active(),org,'www.fixture.example.com',now),false);
});
test('missing, denied, withdrawn, expired, future or self-asserted consent fails closed',()=>{
  assert.equal(discoverySiteConsentActive(null,org,host,now),false);
  const variants=[
    {status:'withdrawn',withdrawn_at:'2026-11-06T11:00:00Z'},
    {status:'pending'},
    {status:'denied'},
    {status:'granted',withdrawn_at:'2026-11-06T11:00:00Z'},
    {valid_until:'2026-11-06T11:59:59Z'},
    {valid_until:'2026-11-06T12:00:00Z'},
    {granted_at:'2026-11-07T12:00:00Z'},
    {purpose:'website_evidence_review'},
    {purpose:'website_discovery'},
    {policy_version:''},
    {policy_version:' '.repeat(4)},
    {granted_by:null},
    {granted_by:'not-a-uuid'},
    {organization_id:'10000000-0000-4000-8000-000000000002'},
    {hostname:'another.example.com'},
    {valid_until:'not-a-date'},
  ];
  for(const variation of variants){
    assert.equal(discoverySiteConsentActive({...active(),...variation},org,host,now),
      false,JSON.stringify(variation));
  }
  assert.equal(discoverySiteConsentActive(active(),org,host,Number.NaN),false);
});
test('no role or source URI can substitute for a tenant consent record',()=>{
  const c=active();
  for(const bad of ['fixture.example.com:443','https://fixture.example.com/',
      'fixture.example.com@wrong.net','localhost','10.0.0.1','evil..example.com']){
    assert.equal(discoverySiteConsentActive(c,org,bad,now),false);
  }
  assert.equal(discoverySiteConsentActive({...c,role:'owner',approved:true,canFetch:true},
    org,host,now),true,'Extraneous claims are ignored; only canonical row fields decide');
});
