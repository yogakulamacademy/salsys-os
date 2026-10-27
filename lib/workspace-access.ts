import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CurrentWorkspaceAccess = {
  organizationId: string;
  role: string;
  workspaceCodes: string[];
};

type WorkspaceContextPayload = {
  organization_id?: unknown;
  active_organization_id?: unknown;
  role?: unknown;
  workspace_codes?: unknown;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export async function getCurrentWorkspaceAccess(): Promise<CurrentWorkspaceAccess | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_current_workspace_context_v1");

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const payload = data as WorkspaceContextPayload;
  const organizationId = cleanText(
    payload.active_organization_id ?? payload.organization_id,
  );
  const role = cleanText(payload.role).toLowerCase();
  const workspaceCodes = Array.isArray(payload.workspace_codes)
    ? payload.workspace_codes
        .map((value) => cleanText(value).toLowerCase())
        .filter(Boolean)
    : [];

  if (!organizationId || !role) return null;

  return {
    organizationId,
    role,
    workspaceCodes: Array.from(new Set(workspaceCodes)),
  };
}

export async function hasCurrentWorkspaceAccess(workspaceCode: string) {
  const access = await getCurrentWorkspaceAccess();
  if (!access) return false;

  return access.workspaceCodes.includes(workspaceCode.trim().toLowerCase());
}
