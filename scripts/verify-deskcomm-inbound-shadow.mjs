#!/usr/bin/env node
/**
 * Fail-closed structural contract for adopting Deskcomm-style inbound
 * separation. These checks are intentionally independent of credentials,
 * database state, WhatsApp delivery and any paid vendor deployment.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const webhook = read('app/api/whatsapp/webhook/route.ts');
const projector = read('lib/integrations/deskcomm-inbound-shadow.ts');
const summary = read('lib/integrations/deskcomm-shadow-summary.ts');
const humanReview = read('lib/integrations/deskcomm-human-review-queue.ts');
const humanReviewData = read('lib/integrations/deskcomm-human-review-data.ts');
const humanReviewPage = read('app/automation/whatsapp/human-review/page.tsx');
const readiness = read('lib/integrations/deskcomm-shadow-readiness.ts');
const page = read('app/automation/whatsapp/inbound-shadow/page.tsx');
const ops = read('app/automation/whatsapp/page.tsx');
const env = read('.env.example');
const provider = read('lib/integrations/whatsapp-provider-send.ts');
const doc = read('docs/open-source-seo-whatsapp-adoption.md');

assert.ok(env.includes('SALSYS_DESKCOMM_INBOUND_SHADOW=false'), 'shadow must default OFF');
assert.ok(webhook.includes("process.env.SALSYS_DESKCOMM_INBOUND_SHADOW === 'true'"));
assert.ok(webhook.includes("projectDeskcommInboundShadow"));
assert.ok(webhook.includes('deskcomm_inbound_shadow: deskcommInboundShadow'));
assert.ok(webhook.includes("ingest_raw_event"));
assert.ok(webhook.includes("ingest_whatsapp_webhook_event"), 'existing CRM ingestor must remain');

const hmacIndex = webhook.indexOf('const signatureValid = verifyMetaSignature(');
const tenantIndex = webhook.indexOf('event.organization_id = organizationId');
const shadowIndex = webhook.indexOf('const deskcommInboundShadow =');
const canonicalIndex = webhook.indexOf("'ingest_raw_event'");
assert.ok(hmacIndex >= 0 && hmacIndex < tenantIndex, 'HMAC must be checked before tenant assignment');
assert.ok(tenantIndex < shadowIndex, 'tenant identity must be resolved before shadow');
assert.ok(shadowIndex < canonicalIndex, 'shadow must be calculated before canonical metadata ingest');

assert.ok(projector.includes('automation_authorized: false'));
assert.ok(projector.includes('replay_authorized: false'));
assert.ok(projector.includes("acknowledgement_strategy: 'existing_sync_after_processing'"));
assert.ok(projector.includes("signature_valid === true"));
assert.ok(projector.includes('input.organizationMapped'));
assert.ok(!projector.includes('fetch('), 'shadow projector must not contact vendor/provider');
assert.ok(!projector.includes('.from('), 'shadow projector must not mutate CRM');

assert.ok(readiness.includes('await requireAdminWorkspaceAccess()'));
assert.ok(readiness.indexOf('await requireAdminWorkspaceAccess()') < readiness.indexOf('createAdminClient()'));
assert.ok(readiness.includes(".select('metadata,received_at')"));
assert.ok(readiness.includes(".eq('organization_id', active.organizationId)"));
assert.ok(readiness.includes(".eq('source_system', 'whatsapp')"));
assert.ok(readiness.includes(".limit(1001)"));
assert.ok(readiness.includes('data.length > 1000'));
assert.ok(!readiness.includes('whatsapp-provider-send'));
assert.ok(!summary.includes('fetch('));
assert.ok(page.includes('getCurrentDeskcommShadowReadiness()'));
assert.ok(ops.includes('/automation/whatsapp/inbound-shadow'));
assert.ok(provider.includes('executePreparedWhatsAppProviderSend'), 'unchanged official Meta sender exists');
assert.ok(doc.includes('WhatsApp Phase B: Deskcomm-inspired inbound channel shadow'));

assert.ok(projector.includes("human_handoff_candidate"));
assert.ok(summary.includes("candidateHumanHandoffs"));
assert.ok(humanReviewData.includes("await requireAdminWorkspaceAccess()"));
assert.ok(humanReviewData.indexOf("await requireAdminWorkspaceAccess()") < humanReviewData.indexOf("createAdminClient()"));
assert.ok(humanReviewData.includes(".eq('organization_id', organizationId)"));
assert.ok(humanReviewData.includes(".eq('direction', 'inbound')"));
assert.ok(humanReviewData.includes(".eq('ingestion_method', 'whatsapp_webhook')"));
assert.ok(humanReviewData.includes(".limit(1001)"));
assert.ok(humanReviewData.includes("raw.length > 1000"));
assert.ok(humanReviewData.includes("candidates.slice(0, 40)"));
assert.ok(humanReview.includes("conversation.external_account_id === candidate.businessAccountId"));
assert.ok(humanReview.includes("conversation.external_conversation_id === candidate.senderId"));
assert.ok(humanReview.includes("msg.direction === 'inbound'"));
assert.ok(humanReview.includes("leads.has(link.lead_id)"));
assert.ok(humanReviewPage.includes("getCurrentDeskcommHumanReviewQueue()"));
assert.ok(!humanReviewData.includes("executePreparedWhatsAppProviderSend"));
assert.ok(!humanReviewData.includes(".insert("));
assert.ok(!humanReviewData.includes(".update("));
assert.ok(!humanReviewData.includes(".rpc("));
assert.ok(!humanReviewData.includes("fetch("));

console.log('[deskcomm-inbound-shadow] PASS: HMAC -> tenant -> pure shadow -> canonical event, no sends/replay, bounded admin diagnostics');
