import "server-only";
import { createClient } from "@/lib/supabase/server";

export type SignupPlan =
  | { state: "not_self_signup" | "unavailable" }
  | { state: "pro_trial" | "free_pending_reconciliation" | "free"; planCode: "pro" | "free"; remainingSeconds: number; trialEndsAt: string; workspaceCodes: string[] };

export async function getCurrentSignupPlan(supabase?: Awaited<ReturnType<typeof createClient>>): Promise<SignupPlan> {
  try {
    const client = supabase ?? await createClient();
    const { data, error } = await client.rpc("get_current_signup_plan_v1");
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return { state: "unavailable" };
    if (data.state === "not_self_signup") return { state: "not_self_signup" };
    if (!["pro_trial", "free_pending_reconciliation", "free"].includes(data.state) ||
      data.plan_code !== (data.state === "pro_trial" ? "pro" : "free") ||
      typeof data.remaining_seconds !== "number" || !Number.isFinite(data.remaining_seconds) ||
      data.remaining_seconds < 0 || typeof data.trial_ends_at !== "string" ||
      !Number.isFinite(Date.parse(data.trial_ends_at)) ||
      !Array.isArray(data.workspace_codes) || !data.workspace_codes.every((c: unknown) => typeof c === "string")) {
      return { state: "unavailable" };
    }
    return { state: data.state, planCode: data.plan_code, remainingSeconds: data.remaining_seconds,
      trialEndsAt: data.trial_ends_at, workspaceCodes: data.workspace_codes };
  } catch {
    return { state: "unavailable" };
  }
}

// A commercial allowlist never grants access on its own. Call after existing
// workspace/membership/capability checks. Not wired as global enforcement.
export function signupPlanAllowsWorkspace(plan: SignupPlan, workspaceCode: string): boolean {
  if (plan.state === "not_self_signup") return true;
  if (plan.state === "unavailable") return false;
  return "workspaceCodes" in plan && plan.workspaceCodes.includes(workspaceCode);
}
