import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function expectIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Commercial intelligence verification failed: ${label}`);
  }
}

function expectNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Commercial intelligence verification failed: ${label}`);
  }
}

const engine = read('lib/commercial-intelligence.ts');
const panel = read('components/commercial-intelligence-panel.tsx');
const paidMedia = read('components/paid-media-intelligence-panel.tsx');
const legacyRoute = read('app/commercial-intelligence/page.tsx');
const marketingPage = read('app/marketing/page.tsx');
const marketingCanonicalWorkspace = read('app/marketing/canonical-workspace.tsx');
const marketingOverview = read('app/marketing/marketing-command-center-overview.tsx');
const marketingSurface = `${marketingPage}\n${marketingCanonicalWorkspace}\n${marketingOverview}`;
const revenuePage = read('app/revenue/page.tsx');
const funnelLayout = read('app/funnel/layout.tsx');
const revenueLayout = read('app/revenue/layout.tsx');
const revenueReadiness = read('lib/revenue-readiness.ts');
const revenueReadinessNotice = read('components/revenue-readiness-notice.tsx');
const revenueCloseoutMigration = read('supabase/migrations/20261101043000_revenue_final_closeout_v1.sql');

expectIncludes(engine, 'buildFunnelIntelligence', 'funnel intelligence builder missing');
expectIncludes(engine, 'buildAttributionIntelligence', 'attribution intelligence builder missing');
expectIncludes(engine, 'buildRevenueIntelligence', 'revenue intelligence builder missing');
expectIncludes(engine, 'reconcileRevenueAttribution', 'revenue/attribution reconciliation missing');
expectIncludes(engine, 'It is not a conversion probability', 'funnel readiness probability guard missing');
expectIncludes(engine, 'not causal certainty', 'attribution causality guard missing');
expectIncludes(engine, 'not a win probability', 'revenue forecast probability guard missing');
expectIncludes(engine, 'currencies are never mixed', 'currency isolation guard missing');
expectIncludes(engine, 'Unknown', 'unknown-evidence handling missing');

expectIncludes(panel, 'SalsysOS decision intelligence', 'decision intelligence panel missing');
expectIncludes(panel, 'Commercial reconciliation', 'reconciliation panel missing');
expectIncludes(paidMedia, 'Spend → CRM → Revenue quality', 'paid-media decision panel missing');
expectIncludes(paidMedia, 'does not automatically move advertising budget', 'paid-media human-control guard missing');
expectIncludes(paidMedia, 'Repair lineage before strong ROI conclusions', 'Google attribution-quality guard missing');
expectIncludes(paidMedia, 'Unmatched IDs stay unresolved rather than being guessed', 'Meta attribution-quality guard missing');

expectIncludes(legacyRoute, 'redirect("/home")', 'legacy Commercial Intelligence route must resolve to the canonical command center');
expectIncludes(marketingSurface, 'buildAttributionIntelligence', 'attribution intelligence must remain surfaced in Marketing');
expectIncludes(marketingSurface, 'FunnelIntelligenceWorkspaceV2', 'funnel intelligence must remain surfaced in Marketing');
expectIncludes(marketingSurface, 'ExecutiveDecisionBrief', 'Marketing decision intelligence must remain surfaced');
expectIncludes(revenuePage, 'ExecutiveDecisionBrief', 'Revenue decision intelligence must remain surfaced');
expectIncludes(revenuePage, '/admissions?view=payments', 'Revenue must route payment action work to Admissions');
expectIncludes(revenuePage, '/marketing?view=attribution', 'Revenue must route attribution investigation to Marketing');

expectNotIncludes(funnelLayout, 'CommercialIntelligencePanel', 'Funnel layout must not append duplicate intelligence presentation');
expectNotIncludes(revenueLayout, 'CommercialIntelligencePanel', 'Revenue layout must not append duplicate intelligence presentation');
expectIncludes(revenueLayout, 'RevenueReadinessNotice', 'Revenue layout must surface forecast readiness before downstream evidence');

for (const [needle, label] of [
  ['get_revenue_readiness_v1', 'Revenue readiness RPC client'],
  ['openLeads', 'open-lead readiness count'],
  ['unvaluedLeads', 'missing-value readiness count'],
  ['undatedLeads', 'missing-close-date readiness count'],
  ['pendingPaymentRequests', 'pending-payment workflow count'],
  ['available: false', 'readiness unavailable state'],
]) {
  expectIncludes(revenueReadiness, needle, label);
}

for (const [needle, label] of [
  ['Revenue forecast readiness', 'Revenue readiness heading'],
  ['Commercial value coverage', 'commercial value coverage metric'],
  ['Expected close coverage', 'expected close coverage metric'],
  ['Pending payment requests', 'pending payment request metric'],
  ['never count as collected revenue until payment evidence is marked paid', 'pending-payment revenue guard'],
  ['/admissions?view=pipeline', 'pipeline readiness action'],
  ['/admissions?view=payments', 'payment queue readiness action'],
]) {
  expectIncludes(revenueReadinessNotice, needle, label);
}

for (const [needle, label] of [
  ['create or replace view public.v_lead_revenue_status', 'canonical lead Revenue status view'],
  ['with (security_invoker = true)', 'Revenue status security-invoker boundary'],
  ['coalesce(l.potential_value, latest_enrollment.total_value)::numeric(12,2)', 'forecast/status value fallback consistency'],
  ["latest_enrollment.currency,\n      'INR'", 'forecast/status currency fallback consistency'],
  ['left join lateral (', 'latest enrollment fallback join'],
  ['pt.currency = upper(', 'payment totals canonical-currency match'],
  ['create or replace function public.get_revenue_readiness_v1', 'Revenue readiness RPC'],
  ['public.is_organization_member(p_organization_id)', 'Revenue readiness tenant authorization'],
  ["'unvalued_leads'", 'Revenue unvalued readiness evidence'],
  ["'undated_leads'", 'Revenue undated readiness evidence'],
  ["'valued_undated_leads'", 'Revenue valued-undated evidence'],
  ["p.status::text = 'pending'", 'pending payment request workflow evidence'],
  ['Pending payment requests are counted as workflow items only and are never included in collected revenue.', 'pending payment accounting semantics'],
  ['from public, anon;', 'Revenue readiness anonymous execution revoked'],
  ['to authenticated, service_role;', 'Revenue readiness authorized execution'],
]) {
  expectIncludes(revenueCloseoutMigration, needle, label);
}

console.log('Commercial intelligence contracts verified across canonical workspaces.');
