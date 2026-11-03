const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261103213500_whatsapp_sales_asset_human_media_send_v1.sql'),
  'utf8',
);
const transport = fs.readFileSync(
  path.join(root, 'lib/integrations/whatsapp-sales-asset-media.ts'),
  'utf8',
);
const action = fs.readFileSync(
  path.join(root, 'app/conversations/whatsapp-sales-asset-send-actions.ts'),
  'utf8',
);
const composer = fs.readFileSync(
  path.join(root, 'components/conversation-composer.tsx'),
  'utf8',
);

test('human Sales Asset media audit is tenant scoped and service-role reconciled', () => {
  for (const needle of [
    'public.sales_asset_dispatch_audits',
    "state in ('prepared','uploading','sending','sent','failed','sent_unreconciled')",
    'sales_asset_dispatch_audits_asset_fk',
    'public.is_organization_member(organization_id)',
    'record_whatsapp_sales_asset_send_success_v1',
    "auth.role() <> 'service_role'",
    "message_type",
    "'sales_asset_id'",
    "'sales_asset_dispatch_audit_id'",
    "'provider_media_id'",
  ]) {
    assert.match(migration, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(
    migration,
    /revoke all on function public\.record_whatsapp_sales_asset_send_success_v1\(uuid,uuid,text\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_whatsapp_sales_asset_send_success_v1\(uuid,uuid,text\)[\s\S]*to service_role/,
  );
});

test('media transport keeps the source object private and re-resolves before provider delivery', () => {
  assert.match(transport, /resolveSalesAssetForHumanDispatch/);
  assert.match(transport, /\.from\(asset\.safeReference\.bucket\)[\s\S]*\.download\(asset\.safeReference\.path\)/);
  assert.match(transport, /\/media`/);
  assert.match(transport, /messaging_product', 'whatsapp'/);
  assert.match(transport, /provider_media_id/);
  assert.match(transport, /record_whatsapp_sales_asset_send_success_v1/);
  assert.match(transport, /sent_unreconciled/);
  assert.match(transport, /Do not resend this attachment/);

  assert.doesNotMatch(
    transport,
    /createSignedUrl|createSignedUrls|getPublicUrl|safeReference\.path.*https?:\/\//,
  );
});

test('first provider slice is intentionally limited to compatible image and PDF media', () => {
  assert.match(transport, /\['image\/jpeg', 'image\/png'\]/);
  assert.match(transport, /asset\.mimeType !== 'application\/pdf'/);
  assert.match(transport, /MAX_IMAGE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(transport, /MAX_DOCUMENT_BYTES = 50 \* 1024 \* 1024/);
  assert.match(transport, /MAX_CAPTION_LENGTH = 1024/);
  assert.match(transport, /currently supports approved images and PDF documents only/);
});

test('human send action rechecks access, WhatsApp window and live lead scope', () => {
  for (const needle of [
    'can_work_lead',
    "current_contact_channel !== 'whatsapp'",
    "contact_type', 'whatsapp'",
    "direction', 'inbound'",
    'CUSTOMER_SERVICE_WINDOW_MS',
    'interested_course_id',
    'preferred_location',
    'language',
    'executeHumanWhatsAppSalesAssetSend',
    'sales_asset_id',
  ]) {
    assert.match(action, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('composer routes a selected asset through the dedicated media action without autonomous send', () => {
  assert.match(composer, /sendWhatsAppSalesAssetMessageAction/);
  assert.match(composer, /formData\.set\("sales_asset_id", selectedAsset\.assetId\)/);
  assert.match(composer, /customerMessageSent/);
  assert.match(composer, /Do not resend/i);
  assert.match(composer, /1024/);
  assert.match(composer, /fresh server re-check/i);
  assert.doesNotMatch(composer, /graph\.facebook\.com|createSignedUrl|getPublicUrl/);
});
