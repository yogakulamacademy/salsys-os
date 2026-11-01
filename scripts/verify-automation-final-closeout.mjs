import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function expectIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Automation final closeout verification failed: ${label}`);
  }
}

function expectNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Automation final closeout verification failed: ${label}`);
  }
}

const overview = read('app/automation/page.tsx');
const triggers = read('app/automation/triggers/page.tsx');
const approvals = read('app/automation/approvals/page.tsx');
const approvalApi = read('app/api/automation/approvals/[approvalId]/route.ts');
const approvalRoute = read('app/automation-approvals/page.tsx');
const approvalLayout = read('app/automation-approvals/layout.tsx');
const routeAccess = read('lib/route-access.ts');
const nextConfig = read('next.config.ts');
const submissionGuard = read('components/automation/automation-submission-guard.tsx');
const automationLayout = read('app/automation/layout.tsx');
const settingsActions = read('app/automation/settings/actions.ts');
const publishActions = read('app/automation/flow-builder/publish-actions.ts');
const scheduler = read('lib/automation/runtime-scheduler.ts');

for (const [source, label] of [
  [overview, 'Automation overview'],
  [triggers, 'Smart Triggers summary'],
]) {
  expectIncludes(source, ".from('automation_approval_requests')", `${label} must count the canonical approval queue`);
  expectIncludes(source, ".eq('status', 'pending')", `${label} must count pending approval requests only`);
  expectNotIncludes(source, ".eq('status', 'awaiting_approval')", `${label} must not infer approvals from runtime status tables`);
}

expectIncludes(approvals, "['owner', 'admin', 'admissions'].includes(role)", 'Approval UI action roles must include Admissions');
expectIncludes(approvalApi, "['owner', 'admin', 'admissions'].includes(activeWorkspace.role)", 'Approval API decision roles must include Admissions');
expectIncludes(approvalApi, 'if (!sameOrigin(request))', 'Approval API same-origin protection missing');
expectIncludes(approvalApi, 'Human approval alone never overrides the provider kill switch', 'Human approval/provider safety boundary missing');

expectIncludes(routeAccess, 'AUTOMATION_APPROVAL_ROLES', 'Dedicated approval access role set missing');
expectIncludes(routeAccess, '["owner", "admin", "manager", "admissions"]', 'Approval access roles must be owner/admin/manager/admissions');
expectIncludes(routeAccess, 'requireAutomationApprovalWorkspaceAccess', 'Approval-only workspace guard missing');
expectIncludes(nextConfig, "source: '/automation/approvals'", 'Canonical approval URL rewrite missing');
expectIncludes(nextConfig, "destination: '/automation-approvals'", 'Internal approval route destination missing');
expectIncludes(approvalRoute, "@/app/automation/approvals/page", 'Internal approval route must reuse the canonical approvals page');
expectIncludes(approvalLayout, 'requireAutomationApprovalWorkspaceAccess', 'Internal approval layout must enforce approval-only access');
expectIncludes(approvalLayout, "['owner', 'admin', 'manager'].includes(workspace.role)", 'Only privileged roles may receive full Automation Studio navigation');
expectIncludes(approvalLayout, 'Approval-only automation access.', 'Admissions approval-only boundary must be explicit in the UI');
expectIncludes(approvalLayout, '<AutomationNavigation />', 'Privileged approval reviewers must retain Automation navigation');

expectIncludes(automationLayout, '<AutomationSubmissionGuard />', 'Automation repeated-submit guard must be mounted in Automation Studio');
expectIncludes(submissionGuard, 'save draft', 'Repeated-submit guard must cover draft creation');
expectIncludes(submissionGuard, "form.getAttribute(GUARDED_FORM_ATTR) === 'active'", 'Repeated-submit guard must lock the whole create form');
expectIncludes(submissionGuard, 'event.preventDefault();', 'Repeated-submit guard must cancel duplicate submissions');
expectIncludes(submissionGuard, 'event.stopImmediatePropagation();', 'Repeated-submit guard must stop duplicate server-action dispatch');
expectIncludes(submissionGuard, "form.setAttribute('aria-busy', 'true')", 'Repeated-submit guard must expose form in-flight state');
expectIncludes(submissionGuard, 'control.disabled = true;', 'Repeated-submit guard must disable guarded create controls');
expectNotIncludes(submissionGuard, 'workflow name', 'Repeated-submit protection must not enforce workflow-name uniqueness');

expectIncludes(settingsActions, 'autonomous_send_enabled: false', 'WhatsApp autonomous send must remain fail-closed');
expectIncludes(settingsActions, 'requires_human_approval: true', 'WhatsApp human approval requirement must remain forced on');
expectIncludes(settingsActions, 'current_published_version', 'Runtime activation must remain pinned to a published version');
expectIncludes(publishActions, 'validation_snapshot', 'Flow publishing must retain validation evidence');
expectIncludes(publishActions, 'definition_hash', 'Flow publishing must retain definition integrity evidence');
expectIncludes(publishActions, 'Runtime remains OFF until you explicitly enable it', 'Publishing must not imply runtime activation');
expectIncludes(scheduler, ".eq('status', 'active')", 'Scheduler must scan active workflows only');
expectIncludes(scheduler, ".eq('runtime_flow_enabled', true)", 'Scheduler must scan runtime-enabled workflows only');

console.log('Automation final closeout contracts verified.');
