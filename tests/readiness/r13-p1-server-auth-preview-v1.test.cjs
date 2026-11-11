'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const source=readFileSync(path.resolve(
  __dirname,'../../lib/commercial/plan-review-auth-preview.ts'),'utf8');

test('R13-P1 auth adapter is inert server-only and does not import service-role credentials',()=>{
  assert.match(source,/import 'server-only'/);
  assert.match(source,/from '@\/lib\/supabase\/server'/);
  assert.match(source,/from '@\/lib\/workspace'/);
  assert.doesNotMatch(source,/createAdminClient|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(source,/\bfetch\s*\(|\.rpc\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  assert.doesNotMatch(source,/\bpublic\.payments\b|\.from\(['"]saas_/);
  assert.doesNotMatch(source,/\bexport\s+(?:const|function)\s+.*(?:activate|charge|provision|enable)/i);
});

test('R13-P1 auth uses fresh verified server user and tenant, not client claims',()=>{
  assert.match(source,/session\.auth\.getUser\(\)/);
  assert.match(source,/getCurrentWorkspaceContext\(session\)/);
  assert.match(source,/workspace\.activeOrganizationId !== active\.organizationId/);
  assert.match(source,/\.from\('profiles'\)/);
  assert.match(source,/\.eq\('id', user\.id\)/);
  assert.match(source,/profileResult\.data\?\.active !== true/);
  assert.match(source,/\.from\('organization_members'\)/);
  assert.match(source,/\.eq\('user_id', user\.id\)/);
  assert.match(source,/\.eq\('organization_id', active\.organizationId\)/);
  assert.match(source,/\.eq\('active', true\)/);
  assert.match(source,/member\?\.active !== true/);
  assert.match(source,/\.from\('organizations'\)/);
  assert.match(source,/organization\?\.status !== 'active'/);
  assert.match(source,/organization\?\.id !== active\.organizationId/);
  assert.match(source,/organization\?\.slug !== active\.organizationSlug/);
  assert.match(source,/active\.role !== member\.role/);
});

test('R13-P1 review scope is restricted to platform tenant; tenant read cannot be selected by caller',()=>{
  assert.match(source,/current\.organizationSlug !== 'salsysos'/);
  assert.match(source,/export async function requireCommercialPlatformReviewPreview\(\)/);
  assert.match(source,/export async function requireCurrentTenantPlanReadPreview\(\)/);
  assert.match(source,/scope: 'current_tenant_plan_read'/);
  assert.match(source,/scope: 'platform_plan_review'/);
  assert.match(source,/canChangeSubscriptions: false/);
  assert.match(source,/canCharge: false/);
  assert.match(source,/canActivateCapabilities: false/);
  assert.doesNotMatch(source,/request\.headers|request\.json|searchParams|formData|req\.body/);
  assert.match(source,/never an arbitrary/);
});

test('R13-P1 trusted authorization adapter explicitly disclaims unverified session-revocation assurance',()=>{
  assert.match(source,/does NOT prove session revocation/i);
  assert.match(source,/Inert until imported by a separately reviewed server route/i);
  assert.match(source,/Does NOT query future saas_/);
});
