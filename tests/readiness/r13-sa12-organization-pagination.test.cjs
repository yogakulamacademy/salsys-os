const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const {readFileSync}=require('node:fs');
const p=load('lib/platform-organization-pagination.ts',{});

test('registry pagination validates and bounds untrusted page values',()=>{
  for(const value of [null,undefined,[],['2'],'0','-1','1.2','1e3',' 2','2 ','01','100001','999999999999999999','2&org=other']) assert.equal(p.parseOrganizationPage(value),1);
  assert.equal(p.parseOrganizationPage('2'),2);
  assert.equal(p.parseOrganizationPage('100000'),100000);
  assert.deepEqual(p.organizationPageRange(1),{from:0,to:24});
  assert.deepEqual(p.organizationPageRange(2),{from:25,to:49});
  assert.equal(p.organizationPageHref(2),'/settings/organizations?page=2');
  for(const value of [0,-1,1.1,NaN,100001])assert.throws(()=>p.organizationPageRange(value));
});
test('registry queries are guarded, ordered and bounded; onboarding follows visible ids',()=>{
  const source=readFileSync('app/settings/organizations/page.tsx','utf8');
  assert.ok(source.indexOf('await requirePlatformAdminAccess()')<source.indexOf('const admin = createAdminClient()'));
  assert.match(source,/count: 'exact', head: true/);
  assert.match(source,/Math\.min\(parseOrganizationPage\(query.page\), lastPage\)/);
  assert.match(source,/\.order\('created_at', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)\s*\.range\(from, to\)/);
  assert.match(source,/organizationIds.length\s*\? await admin.from\('organization_onboarding'\)/);
  assert.match(source,/\.in\('organization_id', organizationIds\)/);
  assert.match(source,/Registry counts are not paid-customer counts/);
  assert.match(source,/action=\{provisionCustomerOrganizationAction\}/);
  assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test('registry search rejects raw PostgREST syntax and preserves validated filters across pages',()=>{
  assert.deepEqual(p.parseOrganizationFilters(' Yoga Academy ','active'),{search:'Yoga Academy',status:'active',invalidSearch:false});
  assert.equal(p.parseOrganizationFilters('Mysūru','unknown').status,'');
  for(const value of ['a,b','a.b','a%','a*','a_','a(b)','a"b','a\\b','a\nb','x'.repeat(81),['a','b']]){
    assert.equal(p.parseOrganizationFilters(value,'active').invalidSearch,true);
  }
  assert.equal(p.organizationSearchExpression('Yoga Academy'),'name.ilike.*Yoga Academy*,slug.ilike.*Yoga Academy*');
  assert.throws(()=>p.organizationSearchExpression('a,b'));
  assert.equal(p.organizationPageHref(2,{search:'Yoga Academy',status:'active'}),'/settings/organizations?page=2&q=Yoga+Academy&status=active');
  const source=readFileSync('app/settings/organizations/page.tsx','utf8');
  assert.match(source,/countQuery\.or\(searchExpression\)/);
  assert.match(source,/registryQuery\.or\(searchExpression\)/);
  assert.match(source,/countQuery\.eq\('status', filters.status\)/);
  assert.match(source,/registryQuery\.eq\('status', filters.status\)/);
  assert.match(source,/filters\.invalidSearch \? \{ count: 0, error: null \}/);
});
