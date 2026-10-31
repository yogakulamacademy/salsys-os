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
const revenuePage = read('app/revenue/page.tsx');
const funnelLayout = read('app/funnel/layout.tsx');
const revenueLayout = read('app/revenue/layout.tsx');

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
expectIncludes(marketingPage, 'buildAttributionIntelligence', 'attribution intelligence must remain surfaced in Marketing');
expectIncludes(marketingPage, 'FunnelIntelligenceWorkspaceV2', 'funnel intelligence must remain surfaced in Marketing');
expectIncludes(marketingPage, 'ExecutiveDecisionBrief', 'Marketing decision intelligence must remain surfaced');
expectIncludes(revenuePage, 'ExecutiveDecisionBrief', 'Revenue decision intelligence must remain surfaced');
expectIncludes(revenuePage, '/admissions?view=payments', 'Revenue must route payment action work to Admissions');
expectIncludes(revenuePage, '/marketing?view=attribution', 'Revenue must route attribution investigation to Marketing');

expectNotIncludes(funnelLayout, 'CommercialIntelligencePanel', 'Funnel layout must not append duplicate intelligence presentation');
expectNotIncludes(revenueLayout, 'CommercialIntelligencePanel', 'Revenue layout must not append duplicate intelligence presentation');

console.log('Commercial intelligence contracts verified across canonical workspaces.');
