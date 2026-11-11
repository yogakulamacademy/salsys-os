'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname,
  '../../lib/commercial/plan-review-auth-preview.ts'), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;

// Run the ACTUAL server-only TypeScript adapter against synthetic, externally
// controlled session/workspace/database fixtures. No real Supabase connection,
// user record, network request, organization mutation or privileged client.
function scenario(overrides = {}) {
  const example = {
    user: { id: 'user-1' },
    authError: null,
    workspace: {
      activeOrganizationId: 'org-a',
      activeWorkspace: {
        organizationId: 'org-a', organizationSlug: 'salsysos', role: 'owner',
      },
    },
    profile: { id: 'user-1', active: true },
    membership: {
      user_id: 'user-1', organization_id: 'org-a', active: true, role: 'owner',
    },
    organization: { id: 'org-a', status: 'active', slug: 'salsysos' },
    ...overrides,
  };

  const tablesSeen = [];
  const session = {
    auth: { getUser: async () => ({
      data: { user: example.user },
      error: example.authError,
    }) },
    from(table) {
      tablesSeen.push(table);
      const filters = {};
      const builder = {
        select() { return this; },
        eq(field, value) { filters[field] = value; return this; },
        async maybeSingle() {
          const row = ({
            profiles: example.profile,
            organization_members: example.membership,
            organizations: example.organization,
          })[table];
          if (!row) return {data:null,error:null};
          for (const [field,value] of Object.entries(filters)) {
            if (row[field] !== value) return {data:null,error:null};
          }
          return {data:{...row},error:null};
        },
      };
      return builder;
    },
  };

  const exports = {};
  const sandbox = {
    exports,
    module: {exports},
    require(specifier) {
      if (specifier === 'server-only') return {};
      if (specifier === '@/lib/supabase/server') {
        return {createClient: async () => session};
      }
      if (specifier === '@/lib/workspace') {
        return {getCurrentWorkspaceContext: async client => {
          assert.equal(client, session);
          return example.workspace;
        }};
      }
      throw new Error('Unapproved dependency in commercial auth adapter: '+specifier);
    },
    Object, Promise, Error, String, Array,
  };
  vm.runInNewContext(output, sandbox, {
    filename: 'plan-review-auth-preview.transpiled.cjs',
    timeout: 1000,
  });
  return {api:sandbox.module.exports,tablesSeen};
}

test('R13-P1 actual adapter verifies server session and returns inert platform review scope', async () => {
  const {api,tablesSeen} = scenario();
  const result = await api.requireCommercialPlatformReviewPreview();
  assert.equal(result.actorUserId,'user-1');
  assert.equal(result.organizationId,'org-a');
  assert.equal(result.organizationSlug,'salsysos');
  assert.equal(result.role,'owner');
  assert.equal(result.scope,'platform_plan_review');
  assert.equal(result.readonlyOnly,true);
  assert.equal(result.canCharge,false);
  assert.equal(result.canChangeSubscriptions,false);
  assert.equal(result.canActivateCapabilities,false);
  assert.deepEqual(tablesSeen.slice().sort(),
    ['organization_members','organizations','profiles'].sort());
});

test('R13-P1 actual adapter permits only current tenant, not any requested tenant', async () => {
  const {api}=scenario({
    workspace: {
      activeOrganizationId:'org-b',
      activeWorkspace:{organizationId:'org-b',organizationSlug:'tenant-b',role:'admin'},
    },
    membership:{user_id:'user-1',organization_id:'org-b',role:'admin',active:true},
    organization:{id:'org-b',slug:'tenant-b',status:'active'},
  });
  const read = await api.requireCurrentTenantPlanReadPreview();
  assert.equal(read.organizationId,'org-b');
  assert.equal(read.scope,'current_tenant_plan_read');
  assert.equal(read.canCharge,false);
  await assert.rejects(api.requireCommercialPlatformReviewPreview(),/commercial_platform_tenant_required/);
});

test('R13-P1 rejects forged workspace switch without active corresponding membership', async () => {
  const {api}=scenario({
    workspace: {
      activeOrganizationId:'org-b',
      activeWorkspace:{organizationId:'org-b',organizationSlug:'tenant-b',role:'owner'},
    },
    organization:{id:'org-b',slug:'tenant-b',status:'active'},
  });
  await assert.rejects(api.requireCurrentTenantPlanReadPreview(),
    /commercial_active_owner_membership_required/);
});

test('R13-P1 rejects inactive profile, suspended org, and stale role', async () => {
  await assert.rejects(scenario({profile:{id:'user-1',active:false}})
    .api.requireCurrentTenantPlanReadPreview(),/commercial_active_profile_required/);
  await assert.rejects(scenario({organization:{id:'org-a',slug:'salsysos',status:'suspended'}})
    .api.requireCurrentTenantPlanReadPreview(),/commercial_active_organization_required/);
  await assert.rejects(scenario({
    membership:{user_id:'user-1',organization_id:'org-a',active:true,role:'admin'}
  }).api.requireCurrentTenantPlanReadPreview(),/commercial_membership_role_changed/);
});

test('R13-P1 rejects unprivileged member, mismatched tenant selector and signed-out user', async () => {
  await assert.rejects(scenario({
    workspace:{
      activeOrganizationId:'org-a',
      activeWorkspace:{organizationId:'org-a',organizationSlug:'salsysos',role:'viewer'}
    },
    membership:{user_id:'user-1',organization_id:'org-a',active:true,role:'viewer'},
  }).api.requireCurrentTenantPlanReadPreview(),/commercial_owner_or_admin_required/);
  await assert.rejects(scenario({
    workspace:{
      activeOrganizationId:'org-x',
      activeWorkspace:{organizationId:'org-a',organizationSlug:'salsysos',role:'owner'}
    }
  }).api.requireCurrentTenantPlanReadPreview(),/commercial_active_tenant_required/);
  await assert.rejects(scenario({user:null}).api.requireCurrentTenantPlanReadPreview(),
    /commercial_authentication_required/);
  await assert.rejects(scenario({authError:{message:'revoked'}})
    .api.requireCurrentTenantPlanReadPreview(),/commercial_authentication_required/);
});

test('R13-P1 rejects forged membership and inconsistent active organization', async () => {
  await assert.rejects(scenario({
    membership:{user_id:'someone-else',organization_id:'org-a',active:true,role:'owner'},
  }).api.requireCurrentTenantPlanReadPreview(),/commercial_active_owner_membership_required/);
  await assert.rejects(scenario({
    organization:{id:'org-a',slug:'other-org',status:'active'}
  }).api.requireCurrentTenantPlanReadPreview(),/commercial_active_organization_required/);
  await assert.rejects(scenario({
    organization:{id:'org-a',slug:'salsysos',status:'archived'}
  }).api.requireCurrentTenantPlanReadPreview(),/commercial_active_organization_required/);
});
