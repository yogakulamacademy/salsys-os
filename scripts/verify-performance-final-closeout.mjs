import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Performance final closeout verification failed: ${label}`);
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Performance final closeout verification failed: ${label}`);
  }
}

const migration = read('supabase/migrations/20261101050000_performance_final_closeout_v1.sql');
const performance = read('app/performance/page.tsx');
const team = read('app/team-performance/page.tsx');
const teamLayout = read('app/team-performance/layout.tsx');
const scope = read('lib/investigation-scope.ts');
const contact = read('components/performance/contact-performance-workspace.tsx');

for (const [needle, label] of [
  ["'om.role::text as role'", 'team snapshot must project organization role'],
  ["'and om.role in (''owner'', ''admin'', ''admissions'')'", 'team snapshot must filter canonical tenant roles'],
  ["'om.role = ''admissions'''", 'assignment fairness must use organization Admissions role'],
  ['expected one legacy role projection', 'migration must fail closed on team definition drift'],
  ['expected one legacy Admissions role filter', 'migration must fail closed on fairness definition drift'],
  ['operational metrics remain unchanged', 'migration must document metric-semantics preservation'],
  ['historical assignment evidence remains activity-based and is never reconstructed', 'fairness evidence limitation must remain explicit'],
]) {
  requireText(migration, needle, label);
}

for (const [source, needle, label] of [
  [performance, 'requireAdminWorkspaceAccess', 'Performance canonical workspace guard missing'],
  [performance, 'await requireAdminWorkspaceAccess();', 'Performance must enforce canonical admin workspace access'],
  [team, "import { requireAdminWorkspaceAccess } from '@/lib/route-access';", 'Team Performance canonical guard import missing'],
  [team, 'await requireAdminWorkspaceAccess();', 'Team Performance page must use canonical workspace access'],
  [teamLayout, 'requireAdminWorkspaceAccess', 'Direct Team Performance layout guard missing'],
  [team, "role === 'owner'", 'Owner role label missing'],
  [team, 'Active Owner, Admin and Employee accounts included in the read model.', 'Team membership explanation must match canonical roles'],
  [team, 'Median first response is raw elapsed time and is not', 'raw response-time limitation missing'],
  [team, 'yet adjusted for working hours.', 'business-hours SLA limitation missing'],
  [contact, 'Historical records may be incomplete.', 'contact evidence limitation missing'],
  [contact, 'Volume is descriptive and is not a performance score.', 'communication-volume guard missing'],
  [performance, '<ContactPerformanceWorkspace mode="response" />', 'Response workspace must remain distinct'],
  [performance, '<ContactPerformanceWorkspace mode="communication" />', 'Communication workspace must remain distinct'],
]) {
  requireText(source, needle, label);
}

for (const [source, needle, label] of [
  [performance, 'is_crm_admin', 'Performance must not use legacy global CRM admin role'],
  [performance, 'createClient', 'Performance route must not implement a second profile-role access path'],
  [team, "from(\n        'profiles'", 'Team Performance must not read global profile role for access'],
  [team, "profile.role !==", 'Team Performance legacy profile-role redirect must be removed'],
  [team, "import { redirect } from 'next/navigation';", 'Team Performance legacy redirect dependency must be removed'],
  [team, "import { useMockData } from '@/lib/config';", 'Team Performance legacy mock access bypass must be removed'],
]) {
  forbidText(source, needle, label);
}

requireText(scope, 'const performanceRanges = new Set(["7d", "30d", "month", "last_month"]);', 'Performance native range contract drifted');
requireText(scope, 'if (scope.range === "custom")', 'Performance custom range transfer missing');
requireText(scope, 'add("employee", "employee", scope.employee);', 'Performance employee scope transfer missing');

console.log('Performance final closeout contracts verified.');
