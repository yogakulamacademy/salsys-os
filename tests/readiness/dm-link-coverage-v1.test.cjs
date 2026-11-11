const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(relative, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', output)((name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error('Unexpected dependency '+name);
  }, exports);
  return exports;
}
const intel = load('lib/ai/dm-link-intelligence.ts');
const coverage = load('lib/ai/dm-link-coverage.ts', { './dm-link-intelligence': intel });
const destination = load('lib/ai/dm-link-destination.ts');
const baseVisit = {
  organizationId:'org-1', linkOrganizationId:'org-1',
  conversationOrganizationId:'org-1', visitOrganizationId:'org-1',
  processingPurposePermitted:true, tokenRevoked:false,
  issuedAt:'2026-11-11T10:00:00Z', expiresAt:'2026-11-12T12:00:00Z',
  observedAt:'2026-11-11T12:00:00Z', signal:'browser_observation',
  suspectedPreviewOrBot:false, knownForwardedLink:false,
  networkCountry:'AE', networkCountrySource:'trusted_server',
};
const wrap=(eventId='event_11111111', changes={})=>({eventId,linkId:'opaque_link_11',evidence:{...baseVisit,...changes}});
const summarize=(events, opts={})=>coverage.summarizeDmLinkCoverage({organizationId:'org-1',linkId:'opaque_link_11',processingPurposePermitted:true,events,...opts});
const dest=(url, changes={})=>destination.validateDmLinkDestination({destination:url,allowedOrigins:['https://www.yogakulam.com'],allowedPathPrefixes:['/courses/'],...changes});

test('empty history remains not observed, not proved no click',()=>{
 const r=summarize([]);assert.equal(r.state,'not_observed');assert.equal(r.clickStatus,'none');assert.equal(r.observedVisitCountry,null);
});
test('approved first-party route allowed with canonical URL',()=>{
 assert.deepEqual(dest('https://www.yogakulam.com/courses/mysore/200-hour-yoga-teacher-training-in-mysore.php'),{allowed:true,normalizedUrl:'https://www.yogakulam.com/courses/mysore/200-hour-yoga-teacher-training-in-mysore.php'});
});
test('reject all unsafe destination schemes and hosts',()=>{
 for(const url of ['http://www.yogakulam.com/courses/a','https://other.example/courses/a','javascript:alert(1)','//www.yogakulam.com/courses/a','https://www.yogakulam.com.evil.test/courses/a','https://user:pw@www.yogakulam.com/courses/a','https://www.yogakulam.com:444/courses/a','https://www.yogakulam.com/admin','https://www.yogakulam.com/courses/../admin','https://www.yogakulam.com/courses/a?next=https://evil.example','https://www.yogakulam.com/courses/a#section']) {
  assert.equal(dest(url).allowed,false,url);
 }
});
test('reject encoded traversal and malformed or untrusted host config',()=>{
 for(const url of ['https://www.yogakulam.com/courses/%2e%2e/admin','https://www.yogakulam.com/courses/%2Fadmin','https://www.yogakulam.com\\@evil.test/courses/a','https://www.yogakulam.com/courses/a%5cb']) {
  assert.equal(dest(url).allowed,false,url);
 }
 assert.equal(dest('https://www.yogakulam.com/courses/a',{allowedOrigins:['http://www.yogakulam.com']}).reason,'invalid_config');
 assert.equal(dest('https://www.yogakulam.com/courses/a',{allowedOrigins:['https://127.0.0.1']}).reason,'invalid_config');
 assert.equal(dest('https://www.yogakulam.com/courses/a',{allowedPathPrefixes:['/']}).reason,'invalid_config');
});
test('single permitted visit yields country-of-network, not verified residence',()=>{
 const r=summarize([wrap()]);assert.equal(r.state,'country_observed');assert.equal(r.observedVisitCountry,'AE');assert.equal(r.customerResidenceVerified,false);assert.equal(r.pricingEligibility,'undetermined');assert.equal(r.identityAssurance,'token_link_only');
});
test('duplicate event ids do not inflate visit count',()=>{
 const r=summarize([wrap(),wrap()]);assert.equal(r.qualifyingVisitCount,1);assert.equal(r.observedVisitCountry,'AE');
});
test('different countries conflict rather than silently replacing lead country',()=>{
 const r=summarize([wrap(),wrap('event_22222222',{networkCountry:'IN',observedAt:'2026-11-11T13:00:00Z'})]);assert.equal(r.state,'conflicting_countries');assert.equal(r.observedVisitCountry,null);assert.equal(r.clickStatus,'observed_country_unknown');
});
test('bot or preview request alone remains ambiguous without country',()=>{
 const r=summarize([wrap('event_1preview',{signal:'http_request',suspectedPreviewOrBot:true})]);assert.equal(r.state,'ambiguous_request');assert.equal(r.observedVisitCountry,null);assert.equal(r.ambiguousRequestCount,1);
});
test('preview followed by real visit retains real evidence separately',()=>{
 const r=summarize([wrap('event_1preview',{signal:'http_request',suspectedPreviewOrBot:true}),wrap('event_22222222')]);assert.equal(r.state,'country_observed');assert.equal(r.ambiguousRequestCount,1);assert.equal(r.qualifyingVisitCount,1);
});
test('foreign-tenant, wrong-link or malformed events cause restricted not false no-click',()=>{
 for(const e of [wrap('event_bad',{organizationId:'org-2'}),{...wrap(),linkId:'someone_else'}, {...wrap(),eventId:'oops'}]){
  const r=summarize([e]);assert.equal(r.state,'restricted');assert.equal(r.clickStatus,'restricted');
 }
});
test('missing purpose, overlong list and revoked link are restricted',()=>{
 assert.equal(summarize([wrap()],{processingPurposePermitted:false}).state,'restricted');
 assert.equal(summarize(Array(101).fill(wrap())).state,'restricted');
 assert.equal(summarize([wrap('event_11111111',{tokenRevoked:true})]).state,'restricted');
});
test('country unknown remains visit observed and suppresses no-click staff alert',()=>{
 const r=summarize([wrap('event_11111111',{networkCountrySource:'untrusted_header'})]);
 assert.equal(r.state,'observed_country_unknown');assert.equal(r.observedVisitCountry,null);
 const attention=intel.evaluateDmLinkStaffAttention({organizationId:'org-1',linkOrganizationId:'org-1',conversationOrganizationId:'org-1',linkId:'opaque_link_11',channel:'instagram',purposePermitted:true,linkRevoked:false,outboundState:'delivered',linkSentAt:'2026-11-11T10:00:00Z',linkExpiresAt:'2026-11-12T12:00:00Z',now:'2026-11-12T10:30:00Z',waitingHours:24,clickCoverage:'supported',clickStatus:r.clickStatus,repliedSinceSend:false,optedOut:false,humanHandled:false,leadClosedOrEnrolled:false,existingTask:false});
 assert.equal(attention.action,'none');assert.equal(attention.reason,'visit_recorded');
});
test('known + unknown browser countries do not silently assign a definitive observed country',()=>{
 const r=summarize([wrap(),wrap('event_33333333',{networkCountry:null,observedAt:'2026-11-11T13:00:00Z'})]);
 assert.equal(r.state,'observed_country_unknown');assert.equal(r.observedVisitCountry,null);assert.equal(r.qualifyingVisitCount,2);
});


test('duplicate event id with conflicting observations fails closed rather than silently trusting first value',()=>{
 const r=summarize([wrap(),wrap('event_11111111',{networkCountry:'IN'})]);
 assert.equal(r.state,'restricted');assert.equal(r.observedVisitCountry,null);
});
test('no observed click after due interval creates staff-review suggestion but never authorizes a DM',()=>{
 const observed=summarize([]);
 const attention=intel.evaluateDmLinkStaffAttention({organizationId:'org-1',linkOrganizationId:'org-1',conversationOrganizationId:'org-1',linkId:'opaque_link_11',channel:'instagram',purposePermitted:true,linkRevoked:false,outboundState:'delivered',linkSentAt:'2026-11-11T10:00:00Z',linkExpiresAt:'2026-11-12T12:00:00Z',now:'2026-11-12T10:30:00Z',waitingHours:24,clickCoverage:'supported',clickStatus:observed.clickStatus,repliedSinceSend:false,optedOut:false,humanHandled:false,leadClosedOrEnrolled:false,existingTask:false});
 assert.equal(attention.action,'staff_review_due');assert.equal(attention.reason,'no_verified_visit');assert.equal(attention.automaticSendAllowed,false);
});
