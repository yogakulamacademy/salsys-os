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
