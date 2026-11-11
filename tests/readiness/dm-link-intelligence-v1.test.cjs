const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(relative, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)((name) => {
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error(`Unexpected dependency: ${name}`);
  }, exports);
  return exports;
}
const intel = load('lib/ai/dm-link-intelligence.ts');
const tokens = load('lib/ai/dm-link-token.ts', { 'node:crypto': require('node:crypto') });
const visit = {
  organizationId:'tenant-a', linkOrganizationId:'tenant-a',
  conversationOrganizationId:'tenant-a', visitOrganizationId:'tenant-a',
  processingPurposePermitted:true, tokenRevoked:false,
  issuedAt:'2026-11-11T10:00:00Z', expiresAt:'2026-11-13T10:00:00Z',
  observedAt:'2026-11-11T10:10:00Z', signal:'browser_observation',
  suspectedPreviewOrBot:false, knownForwardedLink:false,
  networkCountry:'AE', networkCountrySource:'trusted_server',
};
const attention = {
  organizationId:'tenant-a', linkOrganizationId:'tenant-a',
  conversationOrganizationId:'tenant-a', linkId:'opaque_token_01',
  channel:'instagram', purposePermitted:true, linkRevoked:false,
  outboundState:'delivered', linkSentAt:'2026-11-11T10:00:00Z',
  linkExpiresAt:'2026-11-13T10:00:00Z', now:'2026-11-12T10:30:00Z',
  waitingHours:24, clickCoverage:'supported', clickStatus:'none',
  repliedSinceSend:false, optedOut:false, humanHandled:false,
  leadClosedOrEnrolled:false, existingTask:false,
};

test('a trusted browser visit yields observed network country but never price eligibility or verified residence', () => {
  assert.deepEqual(intel.evaluateDmLinkVisit(visit), {
    status:'country_observed', observedVisitCountry:'AE',
    identityAssurance:'token_link_only', customerResidenceVerified:false,
    priceEligibility:'undetermined',
  });
});

test('cross-tenant click association fails closed', () => {
  assert.equal(intel.evaluateDmLinkVisit({ ...visit, visitOrganizationId:'tenant-b' }).status, 'restricted');
  assert.equal(intel.evaluateDmLinkVisit({ ...visit, linkOrganizationId:'tenant-b' }).observedVisitCountry, null);
});

test('bot, preview and forwarded-link observations never become country-of-recipient evidence', () => {
  for (const changes of [
    { suspectedPreviewOrBot:true },
    { knownForwardedLink:true },
    { signal:'http_request' },
  ]) {
    const result = intel.evaluateDmLinkVisit({ ...visit, ...changes });
    assert.equal(result.status, 'ambiguous_request');
    assert.equal(result.observedVisitCountry, null);
    assert.equal(result.customerResidenceVerified, false);
  }
});

test('no purpose permission, revoked token, expired link and invalid timestamps reject association', () => {
  for (const changes of [
    {processingPurposePermitted:false}, {tokenRevoked:true},
    {observedAt:'2026-11-20T10:10:00Z'},
    {observedAt:'bad timestamp'},
    {expiresAt:'2026-11-10T10:00:00Z'},
  ]) {
    assert.equal(intel.evaluateDmLinkVisit({ ...visit, ...changes }).status, 'restricted');
  }
});

test('untrusted geolocation, missing country and malformed country never establish location', () => {
  for (const changes of [
    {networkCountrySource:'untrusted_header'},
    {networkCountry:null}, {networkCountry:'united arab emirates'},
    {networkCountry:'ae'},
  ]) {
    const result = intel.evaluateDmLinkVisit({ ...visit, ...changes });
    assert.equal(result.status, 'observed_country_unknown');
    assert.equal(result.observedVisitCountry, null);
  }
});

test('no visit signal is not a proved non-click', () => {
  const res = intel.evaluateDmLinkVisit({ ...visit, signal:'none', observedAt:null });
  assert.equal(res.status, 'none');
  assert.equal(res.identityAssurance, 'none');
});

test('eligible and due Instagram link with covered non-observation yields staff task only', () => {
  const out = intel.evaluateDmLinkStaffAttention(attention);
  assert.equal(out.action, 'staff_review_due');
  assert.equal(out.reason, 'no_verified_visit');
  assert.equal(out.taskKey, 'dm-link-review-v1:tenant-a:opaque_token_01:24');
  assert.equal(out.automaticSendAllowed, false);
});

test('no duplicate tasks, after-reply follow-ups or opt-out follow-ups', () => {
  for (const updates of [
    {existingTask:true}, {repliedSinceSend:true},
    {optedOut:true}, {humanHandled:true},
    {leadClosedOrEnrolled:true}, {linkRevoked:true},
  ]) {
    const out = intel.evaluateDmLinkStaffAttention({...attention,...updates});
    assert.equal(out.action, 'none');
    assert.equal(out.automaticSendAllowed, false);
  }
});

test('missing/ambiguous tracking must never be described as definitely not clicked', () => {
  for (const updates of [
    {clickCoverage:'missing'}, {clickCoverage:'ambiguous'},
    {clickStatus:'restricted'},
  ]) {
    const out = intel.evaluateDmLinkStaffAttention({...attention,...updates});
    assert.equal(out.action, 'none');
    assert.equal(out.reason, 'tracking_unavailable');
  }
  const uncertain = intel.evaluateDmLinkStaffAttention({...attention,clickStatus:'ambiguous_request'});
  assert.equal(uncertain.action, 'staff_review_due');
  assert.equal(uncertain.reason, 'visit_ambiguous');
});

test('a valid observed visit suppresses no-click follow-up even if country unavailable', () => {
  for (const status of ['country_observed','observed_country_unknown']) {
    const out = intel.evaluateDmLinkStaffAttention({...attention,clickStatus:status});
    assert.equal(out.action,'none');
    assert.equal(out.reason,'visit_recorded');
  }
});

test('unconfirmed/failed Instagram delivery never generates false no-click claim', () => {
  for (const outboundState of ['draft','queued','failed','revoked']) {
    const out=intel.evaluateDmLinkStaffAttention({...attention,outboundState});
    assert.equal(out.action,'none');
    assert.equal(out.reason,'not_delivered');
  }
  for (const outboundState of ['provider_accepted','unknown']) {
    const out=intel.evaluateDmLinkStaffAttention({...attention,outboundState});
    assert.equal(out.action,'staff_review_due');
    assert.equal(out.reason,'delivery_unconfirmed');
    assert.equal(out.automaticSendAllowed,false);
  }
});

test('not due, expired link, cross-tenant or wrong channel fail closed', () => {
  for (const patch of [
    {now:'2026-11-11T18:00:00Z'},
    {now:'2026-11-13T10:00:00Z'},
    {linkOrganizationId:'tenant-b'},
    {conversationOrganizationId:'tenant-b'},
    {channel:'whatsapp'}, {purposePermitted:false},
  ]) {
    assert.equal(intel.evaluateDmLinkStaffAttention({...attention,...patch}).action,'none');
  }
});

test('invalid link IDs, duration and timestamp fail without task key', () => {
  for (const patch of [
    {linkId:'bad:tag'}, {linkId:'short'}, {waitingHours:0},
    {waitingHours:1.5}, {waitingHours:169},
    {linkSentAt:'not a time'},
  ]) {
    const r=intel.evaluateDmLinkStaffAttention({...attention,...patch});
    assert.equal(r.action,'none');
    assert.equal(r.taskKey,null);
  }
});

test('opaque links are random, fixed-size, HMAC-bound and invalid digests fail closed', () => {
  const secret='a-secret-with-at-least-32-characters-in-production';
  const token=tokens.createDmLinkToken();
  const other=tokens.createDmLinkToken();
  assert.match(token,/^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token,other);
  const digest=tokens.digestDmLinkToken(token,secret);
  assert.match(digest,/^[a-f0-9]{64}$/);
  assert.equal(tokens.matchesDmLinkTokenDigest(token,secret,digest),true);
  assert.equal(tokens.matchesDmLinkTokenDigest(other,secret,digest),false);
  assert.equal(tokens.matchesDmLinkTokenDigest(token,secret,'x'.repeat(64)),false);
  assert.throws(()=>tokens.digestDmLinkToken(token,'short'),/Invalid/);
  assert.throws(()=>tokens.digestDmLinkToken('lead-id-123',secret),/Invalid/);
});
