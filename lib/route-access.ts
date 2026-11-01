import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  canAccessEducationOperationsForCurrentSession,
  getCurrentWorkspaceContext,
} from "@/lib/workspace";

const PRIVILEGED_ROLES = new Set(["owner", "admin", "manager"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);
const AUTOMATION_APPROVAL_ROLES = new Set(["owner", "admin", "manager", "admissions"]);

async function requireWorkspaceRole(allowedRoles: Set<string>) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const workspace = await getCurrentWorkspaceContext(supabase);

  if (!workspace.activeWorkspace) {
    redirect("/workspace");
  }

  if (!allowedRoles.has(workspace.activeWorkspace.role)) {
    redirect("/dashboard?restricted=1");
  }

  return workspace.activeWorkspace;
}

export function requirePrivilegedWorkspaceAccess() {
  return requireWorkspaceRole(PRIVILEGED_ROLES);
}

export function requireAdminWorkspaceAccess() {
  return requireWorkspaceRole(ADMIN_ROLES);
}

export function requireAutomationApprovalWorkspaceAccess() {
  return requireWorkspaceRole(AUTOMATION_APPROVAL_ROLES);
}

export async function requireEducationOperationsAccess() {
  const workspace = await requireWorkspaceRole(PRIVILEGED_ROLES);
  const supabase = await createClient();
  const allowed = await canAccessEducationOperationsForCurrentSession(
    supabase,
    workspace.organizationId,
  );

  if (!allowed) {
    redirect("/dashboard?restricted=education");
  }

  return workspace;
}
