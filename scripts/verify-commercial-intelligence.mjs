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

const engine = read('lib/commercial-intelligence.ts');
const panel = read('components/commercial-intelligence-panel.tsx');
const paidMedia = read('components/paid-media-intelligence-panel.tsx');
const commandCenter = read('app/commercial-intelligence/page.tsx');
const attributionPage = read('app/attribution/page.tsx');
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
expectIncludes(commandCenter, 'Commercial Intelligence', 'command center route missing');
expectIncludes(commandCenter, 'Smart does not mean speculative', 'interpretation guardrail missing');
expectIncludes(commandCenter, 'RevenueAttributionReconciliationCard', 'command center reconciliation missing');
expectIncludes(commandCenter, 'PaidMediaIntelligencePanel', 'paid-media intelligence not surfaced');
expectIncludes(attributionPage, 'buildAttributionIntelligence', 'attribution intelligence builder not surfaced');
expectIncludes(attributionPage, 'ExecutiveDecisionBrief', 'attribution decision intelligence not surfaced');
expectIncludes(funnelLayout, 'buildFunnelIntelligence', 'funnel intelligence not surfaced');
expectIncludes(revenueLayout, 'buildRevenueIntelligence', 'revenue intelligence not surfaced');

console.log('Commercial intelligence contracts verified.');
