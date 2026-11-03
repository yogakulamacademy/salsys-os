const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers.cjs');

const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261103195200_sales_asset_library_foundation_v1.sql'),
  'utf8',
);
const discoveryMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261103204500_sales_asset_copilot_discovery_v1.sql'),
  'utf8',
);
const humanDispatchMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261103210500_sales_asset_human_dispatch_preflight_v1.sql'),
  'utf8',
);
const actions = fs.readFileSync(path.join(root, 'app/settings/assets/actions.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/settings/assets/page.tsx'), 'utf8');
const settingsOverview = fs.readFileSync(path.join(root, 'app/settings/overview/page.tsx'), 'utf8');
const copilotAssetActions = fs.readFileSync(
  path.join(root, 'app/conversations/copilot-asset-actions.ts'),
  'utf8',
);
const copilotAssetSelectionActions = fs.readFileSync(
  path.join(root, 'app/conversations/copilot-asset-selection-actions.ts'),
  'utf8',
);
const humanDispatchGuard = fs.readFileSync(
  path.join(root, 'lib/sales-asset-human-dispatch.ts'),
  'utf8',
);
const copilot = fs.readFileSync(
  path.join(root, 'components/conversation-copilot.tsx'),
  'utf8',
);
const composer = fs.readFileSync(
  path.join(root, 'components/conversation-composer.tsx'),
  'utf8',
);

function loadGuard() {
  return load('lib/sales-asset-dispatch.ts').resolveSalesAssetForDispatch;
}

function validResponse(overrides = {}) {
  const organizationId = '10000000-0000-4000-8000-000000000001';
  const assetId = '20000000-0000-4000-8000-000000000001';
  return {
    asset_id: assetId,
    organization_id: organizationId,
    version: 1,
    title: 'Approved campus image',
    asset_kind: 'image',
    mime_type: 'image/jpeg',
    size_bytes: 1024,
    accessibility_alt_text: 'A campus room',
    accessibility_caption: null,
    safe_reference: {
      bucket: 'sales-assets-private',
      path: `${organizationId}/30000000-0000-4000-8000-000000000001.jpg`,
    },
    ...overrides,
  };
}

const context = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  assetId: '20000000-0000-4000-8000-000000000001',
  channel: 'whatsapp',
  language: 'en',
  course: '200h',
  location: 'mysore',
};

test('sales asset foundation is private, tenant-scoped and lifecycle governed', () => {
  for (const needle of [
    "'sales-assets-private'",
    'public.sales_assets',
    'public.sales_asset_events',
    'enable row level security',
    'public.is_organization_member(organization_id)',
    'public.can_manage_organization(public.sales_asset_storage_organization_id(name))',
    'register_sales_asset_v1',
    'approve_sales_asset_v1',
    'revoke_sales_asset_v1',
    'resolve_sales_asset_for_dispatch_v1',
    "auth.role() <> 'service_role'",
    "state <> 'approved'",
    'revoked_at is not null',
    'rights_valid_until',
    'valid_until',
    'channel_scope',
    'language_scope',
    'course_scope',
    'location_scope',
    "'safe_reference'",
  ]) {
    assert.match(migration, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(migration, /insert into storage\.buckets[\s\S]*false/);
  assert.match(migration, /grant execute on function public\.resolve_sales_asset_for_dispatch_v1[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.resolve_sales_asset_for_dispatch_v1[\s\S]*to authenticated/);
});

test('settings surface uploads to private storage and exposes separate approval and revocation actions', () => {
  assert.match(actions, /\.from\(PRIVATE_ASSET_BUCKET\)[\s\S]*\.upload\(/);
  assert.match(actions, /register_sales_asset_v1/);
  assert.match(actions, /approve_sales_asset_v1/);
  assert.match(actions, /revoke_sales_asset_v1/);
  assert.match(actions, /upsert: false/);
  assert.doesNotMatch(actions, /createSignedUrl|createSignedUrls|getPublicUrl/);

  assert.match(page, /Sales Asset Library/);
  assert.match(page, /Approve manual use/);
  assert.match(page, /Approve \+ auto-send/);
  assert.match(page, /Revoke/);
  assert.match(page, /Private reference:/);
  assert.match(settingsOverview, /href="\/settings\/assets"/);
});

test('Co-Pilot discovery exposes approved metadata only and remains tenant-scoped', () => {
  for (const needle of [
    'search_sales_assets_for_copilot_v1',
    'public.is_organization_member(p_organization_id)',
    "asset.state = 'approved'",
    'asset.revoked_at is null',
    "asset.rights_status = 'cleared'",
    'asset.rights_valid_until',
    'asset.valid_from',
    'asset.valid_until',
    'asset.channel_scope',
    'asset.course_scope',
    'asset.location_scope',
    'asset.language_scope',
    'scored.relevance > 0',
    'v_course is not null and v_course = any(asset.course_scope)',
    'v_location is not null and v_location = any(asset.location_scope)',
    'v_language is not null and v_language = any(asset.language_scope)',
    'to authenticated',
  ]) {
    assert.match(discoveryMigration, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(copilotAssetActions, /search_sales_assets_for_copilot_v1/);
  assert.match(copilotAssetActions, /can_work_lead/);
  assert.match(copilotAssetActions, /sanitizeSuggestions/);
  assert.doesNotMatch(
    copilotAssetActions,
    /safe_reference|storage_bucket|storage_path|createSignedUrl|createSignedUrls|getPublicUrl/,
  );
});

test('active Reply Co-Pilot presents approved asset suggestions and preflights human selection', () => {
  assert.match(copilot, /discoverCopilotSalesAssetsAction/);
  assert.match(copilot, /prepareCopilotAssetSelectionAction/);
  assert.match(copilot, /Relevant approved assets/);
  assert.match(copilot, /crm:copilot-asset-selected/);
  assert.match(copilot, /Prepare attachment in composer/);
  assert.match(copilot, /Preflight does not send media/);
  assert.match(copilot, /href="\/settings\/assets"/);
  assert.doesNotMatch(copilot, /executePreparedWhatsAppProviderSend|graph\.facebook\.com|createSignedUrl|getPublicUrl/);
});

test('human attachment preflight is service-role-only and preserves manual-use eligibility', () => {
  for (const needle of [
    'resolve_sales_asset_for_human_dispatch_v1',
    "auth.role() <> 'service_role'",
    "v_asset.state <> 'approved'",
    'v_asset.revoked_at is not null',
    "v_asset.rights_status <> 'cleared'",
    'v_asset.rights_valid_until',
    'v_asset.valid_from',
    'v_asset.valid_until',
    'v_asset.channel_scope',
    'v_asset.language_scope',
    'v_asset.course_scope',
    'v_asset.location_scope',
    'storage.objects',
    "'safe_reference'",
    'to service_role',
  ]) {
    assert.match(humanDispatchMigration, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(
    humanDispatchMigration,
    /not\s+v_asset\.auto_send_allowed|v_asset\.auto_send_allowed\s*=\s*true/i,
  );
  assert.doesNotMatch(
    humanDispatchMigration,
    /grant execute on function public\.resolve_sales_asset_for_human_dispatch_v1[\s\S]*to authenticated/,
  );

  assert.match(humanDispatchGuard, /resolve_sales_asset_for_human_dispatch_v1/);
  assert.match(humanDispatchGuard, /sales-assets-private/);
  assert.match(humanDispatchGuard, /tenant or asset mismatch/);
  assert.match(humanDispatchGuard, /unsafe storage path/);
});

test('authenticated asset selection action rechecks lead access and never returns private storage coordinates', () => {
  assert.match(copilotAssetSelectionActions, /can_work_lead/);
  assert.match(copilotAssetSelectionActions, /resolveSalesAssetForHumanDispatch/);
  assert.match(copilotAssetSelectionActions, /current_contact_channel/);
  assert.match(copilotAssetSelectionActions, /interested_course_id/);
  assert.match(copilotAssetSelectionActions, /preferred_location/);
  assert.match(copilotAssetSelectionActions, /channel: 'whatsapp'/);
  assert.doesNotMatch(
    copilotAssetSelectionActions,
    /safeReference\s*:|safe_reference|createSignedUrl|createSignedUrls|getPublicUrl|graph\.facebook\.com/,
  );
});

test('WhatsApp composer preserves server-preflighted metadata until a human starts controlled provider delivery', () => {
  assert.match(composer, /crm:copilot-asset-selected/);
  assert.match(composer, /Attachment ready for controlled send/);
  assert.match(composer, /setSelectedAsset\(asset\)/);
  assert.match(composer, /formData\.set\("sales_asset_id", assetForSend\.assetId\)/);
  assert.match(composer, /fresh server re-check/i);
  assert.match(composer, /sendWhatsAppSalesAssetMessageAction/);
  assert.doesNotMatch(
    composer,
    /safeReference|safe_reference|storage_bucket|storage_path|graph\.facebook\.com|createSignedUrl|createSignedUrls|getPublicUrl|executePreparedWhatsAppProviderSend/,
  );
});

test('dispatch guard calls only the server-owned resolver and returns a private tenant reference', async () => {
  const calls = [];
  const resolve = loadGuard();
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: validResponse(), error: null };
    },
  };

  const result = await resolve(client, context);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'resolve_sales_asset_for_dispatch_v1');
  assert.deepEqual(calls[0].args, {
    p_organization_id: context.organizationId,
    p_asset_id: context.assetId,
    p_channel: 'whatsapp',
    p_language: 'en',
    p_course: '200h',
    p_location: 'mysore',
  });
  assert.deepEqual(result.safeReference, {
    bucket: 'sales-assets-private',
    path: `${context.organizationId}/30000000-0000-4000-8000-000000000001.jpg`,
  });
});

test('dispatch guard rejects non-private buckets and wrong-tenant paths even after an RPC response', async () => {
  const resolve = loadGuard();

  await assert.rejects(
    resolve(
      { rpc: async () => ({ data: validResponse({ safe_reference: { bucket: 'public-media', path: `${context.organizationId}/asset.jpg` } }), error: null }) },
      context,
    ),
    /non-private storage bucket/,
  );

  await assert.rejects(
    resolve(
      { rpc: async () => ({ data: validResponse({ safe_reference: { bucket: 'sales-assets-private', path: '90000000-0000-4000-8000-000000000009/asset.jpg' } }), error: null }) },
      context,
    ),
    /unsafe storage path/,
  );

  await assert.rejects(
    resolve(
      { rpc: async () => ({ data: validResponse({ safe_reference: { bucket: 'sales-assets-private', path: `https://example.test/${context.organizationId}/asset.jpg` } }), error: null }) },
      context,
    ),
    /unsafe storage path/,
  );
});

test('dispatch guard fails closed on resolver errors', async () => {
  const resolve = loadGuard();
  await assert.rejects(
    resolve(
      { rpc: async () => ({ data: null, error: { message: 'Sales asset is not approved for automatic dispatch' } }) },
      context,
    ),
    /not approved for automatic dispatch/,
  );
});
