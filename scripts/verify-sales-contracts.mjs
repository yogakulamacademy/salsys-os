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
const commandCenterPage = read('app/crm/page.tsx');
const workQueuePage = read('app/work-queue/page.tsx');
const workQueueMinePage = read('app/work-queue/mine/page.tsx');
const workQueueTeamPage = read('app/work-queue/team/page.tsx');
const opportunitiesPage = read('app/opportunities/page.tsx');
const customer360Page = read('app/customer-360/page.tsx');
const salesPerformancePage = read('app/crm/performance/page.tsx');
const leadsCompatibilityPage = read('app/leads/page.tsx');
const pipelineCompatibilityPage = read('app/pipeline/page.tsx');
const reengagedCompatibilityPage = read('app/re-engaged/page.tsx');
const qualityCompatibilityPage = read('app/data-quality/page.tsx');
const followupsCompatibilityPage = read('app/follow-ups/page.tsx');
const admissionsCompatibilityPage = read('app/admissions/page.tsx');
const dashboardCompatibilityLayout = read('app/dashboard/layout.tsx');
const middleware = read('middleware.ts');

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
requireText(workQueuePage, 'payment verification', 'payment-check task labeling');
requireText(workQueuePage, 'Reschedule', 'reschedule semantics');
requireText(workQueueMinePage, '@/app/dashboard/page', 'personal Today view is hosted under Work Queue');
requireText(workQueueTeamPage, 'Team priority queue', 'team priority scope is hosted under Work Queue');
requireText(opportunitiesPage, "type Surface = 'table' | 'pipeline' | 'activity' | 'quality'", 'unified Opportunities surfaces');
requireText(salesPerformancePage, 'Sales performance', 'management performance drill-down');

// Smart Presentation V2 is intentionally evidence-driven. These checks guard the
// data boundaries and decision-layer helpers, not incidental CSS or exact prose.
for (const [source, needle, label] of [
  [commandCenterPage, 'getDashboardPeriodAnalytics', 'Command Center uses equal-period change evidence'],
  [commandCenterPage, 'getPipelineSnapshot', 'Command Center uses stage-aging bottleneck evidence'],
  [workQueuePage, 'buildQueueOrder', 'Work Queue derives an explicit deterministic work order'],
  [workQueuePage, 'priority_band', 'Work Queue exposes persisted priority bands'],
  [opportunitiesPage, 'primaryOpportunityRisk', 'Opportunities derives explainable book-health risk'],
  [opportunitiesPage, 'Strongest aging bottleneck', 'Opportunities exposes stage-aging bottleneck context'],
  [customer360Page, 'relationshipSignal', 'Customer 360 derives explainable relationship states'],
  [customer360Page, 'No hidden health score', 'Customer 360 keeps relationship health explainable'],
]) {
  requireText(source, needle, label);
}

for (const [source, needle, label] of [
  [leadsCompatibilityPage, '/opportunities', 'legacy Leads route points to Opportunities'],
  [pipelineCompatibilityPage, "surface: 'pipeline'", 'legacy Pipeline route points to Opportunities Pipeline'],
  [reengagedCompatibilityPage, "surface: 'activity'", 'legacy Re-engaged route points to Opportunities Activity'],
  [qualityCompatibilityPage, "surface: 'quality'", 'legacy Data Quality route points to Opportunities Quality'],
  [followupsCompatibilityPage, "tab: 'followups'", 'legacy Follow-ups route points to canonical Work Queue'],
  [admissionsCompatibilityPage, '/work-queue/team', 'legacy Admissions queue points to Work Queue Team'],
  [admissionsCompatibilityPage, '/crm/performance', 'legacy Admissions performance points to Command Center Performance'],
  [dashboardCompatibilityLayout, '/work-queue/mine', 'legacy employee Dashboard points to personal Work Queue'],
  [dashboardCompatibilityLayout, '/crm', 'legacy manager Dashboard points to Command Center'],
]) {
  requireText(source, needle, label);
}

for (const needle of ['/work-queue', '/work-queue/mine', '/work-queue/team', '/opportunities']) {
  requireText(middleware, `\"${needle}\"`, `employee middleware allows ${needle}`);
}

console.log('Sales workspace contracts verified.');
