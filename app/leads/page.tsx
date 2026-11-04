import { LeadsAttributionScopeBar } from "@/components/leads-attribution-scope-bar";
import { LeadsCleanTable } from "@/components/leads-clean-table";
import { LeadsOverview } from "@/components/leads/leads-overview";
import { LeadsHeaderActions } from "@/components/leads/leads-header-actions";
import { RecentBookingActivity } from "@/components/recent-booking-activity";
import { TeamAssignmentPanel } from "@/components/team-assignment-panel";
import { Notice, PageHeader } from "@/components/ui";
import {
  getLeadsWorkspacePageWithAttributionScope,
  parseLeadsAttributionScope,
} from "@/lib/leads-attribution-scope";
import { parseLeadsWorkspaceParams } from "@/lib/leads-data";
import { isMockMode } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import styles from "./leads.module.css";

type LeadsPageProps = {
  searchParams: Promise<{
    notice?: string | string[];
    error?: string | string[];
    q?: string | string[];
    stage?: string | string[];
    source?: string | string[];
    channel?: string | string[];
    creation_channel?: string | string[];
    last_touch_source?: string | string[];
    owner?: string | string[];
    course?: string | string[];
    aging?: string | string[];
    view?: string | string[];
    sort?: string | string[];
    page?: string | string[];
  }>;
};

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
  const filters = parseLeadsWorkspaceParams(params);
  const attributionScope = parseLeadsAttributionScope(params);
  const workspace = await getLeadsWorkspacePageWithAttributionScope(filters, attributionScope);
  const mock = isMockMode();
  const notice = one(params.notice);
  const error = one(params.error);

  let canManage = false;
  if (!mock) {
    try {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!authError && user) {
        const orgId = await requireCurrentOrganizationId(supabase, user.id);
        const [permission, contactPermission] = await Promise.all([
          supabase.rpc("can_manage_sales_workspace", { p_organization_id: orgId }),
          supabase.rpc("can_view_lead_pii"),
        ]);
        canManage =
          !permission.error && permission.data === true &&
          !contactPermission.error && contactPermission.data === true;
      }
    } catch {
      // Fail closed: existing Leads browsing remains available, import/export do not.
      canManage = false;
    }
  }

  // Keep the user's current server-side Leads filter scope in their download.
  const exportQuery = new URLSearchParams();
  for (const key of [
    "q", "stage", "source", "channel", "creation_channel",
    "last_touch_source", "owner", "course", "aging", "view", "sort",
  ] as const) {
    const raw = one(params[key]);
    if (raw) exportQuery.set(key, raw);
  }
  const exportHref = "/api/leads/export" + (exportQuery.size ? "?" + exportQuery : "");

  return (
    <div className={`leads-workspace-v2 ${styles.workspace} min-w-0 space-y-3 pb-4`} data-testid="leads-workspace">
      <PageHeader
        eyebrow="CRM · Workspace"
        title="Leads"
        description="Manage, qualify, and move incoming leads forward from one workspace."
        actions={<LeadsHeaderActions canManage={canManage} mock={mock} exportHref={exportHref} />}
      />

      {notice === "mock-create" ? (
        <Notice tone="warning">
          Demo mode is active, so the test lead was not saved.
        </Notice>
      ) : null}

      {notice === "owner-updated" || notice === "owner-unassigned" ? (
        <Notice tone="success">
          {notice === "owner-unassigned" ? "Lead ownership removed." : "Lead owner updated."}
        </Notice>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}

      {workspace.warning ? (
        <Notice tone="warning" title="Leads loaded with a fallback path">
          {workspace.warning}
        </Notice>
      ) : null}

      <LeadsOverview summary={workspace.summary} />

      <LeadsAttributionScopeBar scope={attributionScope} />

      <LeadsCleanTable
        leads={workspace.leads}
        intelligence={workspace.intelligence}
        mock={mock}
        filters={filters}
        options={workspace.options}
        summary={workspace.summary}
        pagination={workspace.pagination}
      />

      <TeamAssignmentPanel returnTo="/leads" />
      <details className="ui-panel overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-copy-strong">Recent booking activity</summary>
        <RecentBookingActivity />
      </details>
    </div>
  );
}

function one(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
