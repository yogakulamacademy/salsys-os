import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Sales contract verification failed: missing ${label} (${needle})`);
  }
}

function rejectText(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Sales contract verification failed: forbidden ${label} (${needle})`);
  }
}

const pipelineActions = read('app/pipeline/actions.ts');
const pipelineBoard = read('components/crm/pipeline-board-studio.tsx');
const paymentActions = read('app/actions/payments.ts');
const paymentCard = read('components/payment-card.tsx');
const paymentActionsClient = read('components/payment-actions-client.tsx');
const conversationsData = read('lib/conversations-data.ts');
const conversationsCore = read('lib/conversations-data-core.ts');
const conversationsSidebar = read('components/conversations-sidebar.tsx');
const messagingEligibility = read('lib/messaging-eligibility.ts');
const instagramActions = read('app/conversations/instagram-actions.ts');
const copilot = read('components/conversation-copilot.tsx');
const copilotActions = read('app/conversations/copilot-actions.ts');
const followupsData = read('lib/followups-data.ts');
const followupsPage = read('app/follow-ups/page.tsx');

for (const [needle, label] of [
  ['set_lead_stage', 'Pipeline uses canonical stage RPC'],
  ['A reason is required before marking an opportunity Lost.', 'Lost requires audit reason'],
  ['p_reason: mutationReason', 'Pipeline passes stage audit reason'],
]) {
  requireText(pipelineActions, needle, label);
}

for (const [needle, label] of [
  ['closed_won', 'Closed Won consequence flow'],
  ['lossReasons', 'structured Lost reasons'],
  ['This changes the opportunity stage only.', 'Enrolled stage separation warning'],
  ['Outcome / park', 'separate outcome action'],
]) {
  requireText(pipelineBoard, needle, label);
}

for (const [needle, label] of [
  ['report_payment_claim_v1', 'reported-payment review action'],
  ['verify_payment_v1', 'authoritative payment verification action'],
  ['verification evidence before marking a payment paid', 'payment evidence requirement'],
]) {
  requireText(paymentActions, needle, label);
}

requireText(paymentCard, 'Customer-reported payments stay separate from verified financial truth.', 'payment claim/truth separation copy');
requireText(paymentCard, 'PaymentActionsClient', 'dedicated payment action boundary');
rejectText(paymentCard, 'recordPaymentAction', 'raw record-payment action exposed by Payment card');

for (const [needle, label] of [
  ['Report customer payment', 'reported-payment UI'],
  ['Create verification task', 'payment-check task creation UI'],
  ['Verify received payment', 'authoritative payment verification UI'],
  ['Owner/Admin only.', 'payment verifier permission cue'],
  ['Verify & record paid', 'verified paid action'],
  ['does not mark the payment as paid or change the Opportunity stage', 'claim cannot create financial truth'],
]) {
  requireText(paymentActionsClient, needle, label);
}

for (const [needle, label] of [
  ['conversations-data-core', 'stable Lead-centric Conversations loader boundary'],
  ['person_leads', 'deterministic Contact grouping source'],
  ['relatedLeadIds', 'Contact-to-Opportunity queue context'],
  ['Contact grouping unavailable; using Lead-level queue', 'fail-soft Contact grouping fallback'],
]) {
  requireText(conversationsData, needle, label);
}

requireText(conversationsCore, 'get_current_conversations_workspace_v1', 'original optimized Conversations RPC path');
requireText(conversationsSidebar, '+{otherOpportunities} opp', 'multi-opportunity Contact badge');
requireText(conversationsSidebar, 'relatedLeadIds', 'selected Opportunity remains highlighted inside grouped Contact');

for (const [needle, label] of [
  ['evaluate_instagram_dm_send_policy_v1', 'Instagram provider policy adapter'],
  ['humanApprovalRequired: true', 'human approval requirement'],
  ['replyMode: "template"', 'WhatsApp template-required mode'],
  ['replyMode: "freeform"', 'free-form eligible mode'],
]) {
  requireText(messagingEligibility, needle, label);
}

for (const [needle, label] of [
  ['evaluate_instagram_dm_send_policy_v1', 'Instagram send-time policy recheck'],
  ['p_human_approved: true', 'Instagram human-approved send boundary'],
]) {
  requireText(instagramActions, needle, label);
}

for (const [needle, label] of [
  ['AI never sends the message.', 'Copilot no-auto-send UI contract'],
  ['Use draft in composer', 'Copilot draft handoff'],
]) {
  requireText(copilot, needle, label);
}

for (const [needle, label] of [
  ['You never send messages yourself.', 'Copilot generation system boundary'],
  ['Never invent prices, dates, availability, accreditation, policies, refunds, discounts, promises, or exceptions.', 'Copilot factual safety boundary'],
  ['approvedOrganizationKnowledge', 'approved knowledge grounding'],
]) {
  requireText(copilotActions, needle, label);
}

requireText(followupsData, 'taskType', 'task provenance in Follow-ups adapter');
requireText(followupsPage, 'Payment verification', 'payment-check task labeling');
requireText(followupsPage, 'Reschedule', 'reschedule semantics');

console.log('Sales workspace contracts verified.');
