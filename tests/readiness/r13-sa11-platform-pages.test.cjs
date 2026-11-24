const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

test('organization creation and plan proposal forms are disclosed without changing server action boundaries',()=>{
  const organizations=readFileSync('app/settings/organizations/page.tsx','utf8');
  assert.match(organizations,/<details open=\{Boolean\(query\.error\)\}/);
  assert.match(organizations,/<form action=\{provisionCustomerOrganizationAction\}/);
  assert.ok(organizations.indexOf('await requirePlatformAdminAccess()')<organizations.indexOf('<details'));
  assert.match(organizations,/\{organizations.length\} loaded/);
  const plans=readFileSync('app/settings/commercial-plans/page.tsx','utf8');
  assert.match(plans,/state.may_author&&<details open=\{result==='error'\}/);
  for(const action of ['createPlanAction','transitionPlanAction','publishInitialPlanAction'])assert.ok(plans.includes('action={'+action+'}'));
  assert.ok(plans.indexOf('await readPlanReviewState()')<plans.indexOf('<details'));
  assert.match(plans,/state.publicationEnabled&&state.may_publish/);
});
test('overview cards link only to existing routes and do not invent billing metrics',()=>{
  const overview=readFileSync('app/platform-admin/page.tsx','utf8');
  for(const route of ['/settings/organizations','/settings/commercial-plans','/settings/commercial-plans/pilot','/platform-admin/health'])assert.ok(overview.includes('href="'+route+'"'));
  assert.match(overview,/unavailable pending verified billing evidence/);
  assert.match(overview,/not paying-customer or subscription metrics/);
  assert.doesNotMatch(overview,/createAdminClient|\.rpc\(|\.from\(|<form/);
});

test('remaining platform pages preserve guarded reads, truthful states and manual action gates',()=>{
  const business=readFileSync('app/platform-admin/business/page.tsx','utf8');
  assert.match(business,/readiness\.workspaceCodes\.includes\(workspace\.code\)/);
  assert.match(business,/\{permitted &&/);
  assert.match(business,/Stored connection status only/);
  const success=readFileSync('app/platform-admin/customer-success/page.tsx','utf8');
  assert.match(success,/summary\.registered>0/);
  assert.match(success,/summary\.missingRecords/);
  assert.match(success,/not paying-customer or adoption metrics/);
  const health=readFileSync('app/platform-admin/health/page.tsx','utf8');
  assert.match(health,/health\.critical\+health\.warning>0/);
  assert.match(health,/internal tenant only/);
  assert.match(health,/Credential values are never rendered/);
  for(const page of [business,success,health]){
    assert.ok(page.indexOf('await readPlanReviewState()')>=0);
    assert.doesNotMatch(page,/createAdminClient|\.rpc\(|\.from\(|<form/);
  }
  const pilot=readFileSync('app/settings/commercial-plans/pilot/page.tsx','utf8');
  assert.match(pilot,/max=\{state\.max_slots\}/);
  assert.match(pilot,/activationEnabled&&<section/);
  assert.match(pilot,/Approvals are recorded here; activation is disabled/);
  for(const action of ['approvePilotAction','activatePilotAction','assignPlanAction','enablePilotAction'])assert.ok(pilot.includes('action={'+action+'}'));
});
