import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Investigation-scope contract verification failed: missing ${label} (${needle})`);
  }
}

function rejectText(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Investigation-scope contract verification failed: forbidden ${label} (${needle})`);
  }
}

const scope = read('lib/investigation-scope.ts');
const marketing = read('app/marketing/canonical-workspace.tsx');
const leads = read('app/leads/page.tsx');
const performance = read('app/performance/page.tsx');
const teamPerformance = read('app/team-performance/page.tsx');
const contactPerformance = read('components/performance/contact-performance-workspace.tsx');
const admissionsAttribution = read('app/admissions/attribution/page.tsx');
const revenueAttribution = read('app/revenue/attribution/page.tsx');
const nextConfig = read('next.config.ts');

for (const [needle, label] of [
  ['const view = url.searchParams.get("view")?.trim() || "overview";', 'view-aware Marketing transfer'],
  ['if (view === "campaigns")', 'Campaigns-specific Marketing transfer'],
  ['else if (view === "attribution")', 'Attribution-specific Marketing transfer'],
  ['const view = url.searchParams.get("view")?.trim() || "team";', 'view-aware Performance transfer'],
  ['if (view === "team")', 'Team-only Performance filter transfer'],
  ['const performanceRanges = new Set(["7d", "30d", "month", "last_month"]);', 'explicit native Performance range allowlist'],
  ['if (scope.range === "custom")', 'custom Performance range branch'],
  ['validDateRange(scope.start, scope.end)', 'validated custom range dates'],
  ['validDateRange(scope.from, scope.to)', 'validated custom period dates'],
  ['from: getDate("from")', 'date-only capture for from'],
  ['to: getDate("to")', 'date-only capture for to'],
  ['add("employee", scope.employee);', 'employee scope visibility'],
]) {
  requireText(scope, needle, label);
}

rejectText(scope, 'from: get("from")', 'unvalidated date/from marker capture');
rejectText(scope, 'to: get("to")', 'unvalidated date/to marker capture');

for (const [needle, label] of [
  ['view?: string;', 'Marketing view query contract'],
  ['q?: string;', 'Marketing search query contract'],
  ['platform?: string;', 'Campaign platform filter contract'],
  ['outcome?: string;', 'Campaign outcome filter contract'],
  ['course?: string;', 'Attribution course filter contract'],
  ['location?: string;', 'Attribution location filter contract'],
  ['country?: string;', 'Attribution country filter contract'],
  ['stage?: string;', 'Attribution stage filter contract'],
  ['query: query.q?.trim() ?? ""', 'Attribution finder consumes q'],
  ['platform: query.platform?.trim() || "all"', 'Campaigns consume platform'],
]) {
  requireText(marketing, needle, label);
}

for (const [needle, label] of [
  ['source?: string | string[];', 'Leads first-touch source query'],
  ['channel?: string | string[];', 'Leads current-channel query'],
  ['creation_channel?: string | string[];', 'Leads creation-channel query'],
  ['last_touch_source?: string | string[];', 'Leads last-touch query'],
  ['owner?: string | string[];', 'Leads owner query'],
  ['course?: string | string[];', 'Leads course query'],
]) {
  requireText(leads, needle, label);
}

for (const [needle, label] of [
  ['range?: string;', 'Performance range query'],
  ['start?: string;', 'Performance custom start query'],
  ['end?: string;', 'Performance custom end query'],
  ['employee?: string;', 'Performance employee query'],
  ['<TeamPerformancePage searchParams={teamSearchParams} />', 'Team view consumes range search params'],
  ['<ContactPerformanceWorkspace mode="response" />', 'Response view is a distinct unscoped contact workspace'],
  ['<ContactPerformanceWorkspace mode="communication" />', 'Communication view is a distinct unscoped contact workspace'],
]) {
  requireText(performance, needle, label);
}

for (const range of ["'7d'", "'30d'", "'month'", "'last_month'", "'custom'"]) {
  requireText(teamPerformance, range, `Team Performance native range ${range}`);
}
requireText(teamPerformance, 'query.start! <= query.end!', 'custom Performance range ordering');

// Contact Performance currently has no search-parameter contract. If that changes,
// transferInvestigationScope must be reviewed before filters are declared native there.
rejectText(contactPerformance, 'searchParams', 'implicit Response/Communication query filtering without transfer review');

for (const [needle, label] of [
  ['creation_channel?: string | string[];', 'Admissions creation-channel query'],
  ['last_touch_source?: string | string[];', 'Admissions last-touch query'],
  ['cohort.leadIds.has(row.lead_id)', 'Admissions exact lead-ID cohort boundary'],
]) {
  requireText(admissionsAttribution, needle, label);
}

for (const [needle, label] of [
  ['creation_channel?: string | string[];', 'Revenue creation-channel query'],
  ['last_touch_source?: string | string[];', 'Revenue last-touch query'],
  ['getRevenueAttributionOpportunities', 'Revenue full-cohort attribution read'],
]) {
  requireText(revenueAttribution, needle, label);
}

for (const [needle, label] of [
  ["value: 'attribution'", 'Admissions attribution rewrite'],
  ["destination: '/admissions/attribution'", 'Admissions focused attribution renderer'],
  ["key: 'attribution_scope'", 'Revenue attribution rewrite key'],
  ["destination: '/revenue/attribution'", 'Revenue focused attribution renderer'],
]) {
  requireText(nextConfig, needle, label);
}

console.log('Cross-workspace investigation scope contracts verified.');
