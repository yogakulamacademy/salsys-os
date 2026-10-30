import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceContext } from "@/lib/workspace";

const OPERATIONS_ROLES = new Set(["owner", "admin", "manager"]);

export async function requireOperationsAccess() {
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

  if (!OPERATIONS_ROLES.has(workspace.activeWorkspace.role)) {
    redirect("/dashboard?restricted=1");
  }

  return workspace.activeWorkspace;
}
