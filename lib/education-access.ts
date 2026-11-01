import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  canAccessEducationOperationsForCurrentSession,
  getCurrentWorkspaceContext,
  organizationHasCapabilityForCurrentSession,
} from "@/lib/workspace";

export type EducationAccessState = {
  organizationId: string;
  role: string;
  educationEnabled: boolean;
  residentialEnabled: boolean;
  operationsAccess: boolean;
};

export async function getEducationAccessState(): Promise<EducationAccessState> {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspaceContext(supabase);
  const active = workspace.activeWorkspace;

  if (!active?.organizationId) {
    throw new Error("Unable to resolve Education access: no active workspace.");
  }

  const [educationEnabled, residentialEnabled, operationsAccess] = await Promise.all([
    organizationHasCapabilityForCurrentSession(
      supabase,
      active.organizationId,
      "education_core",
    ),
    organizationHasCapabilityForCurrentSession(
      supabase,
      active.organizationId,
      "wellness_residential",
    ),
    canAccessEducationOperationsForCurrentSession(
      supabase,
      active.organizationId,
    ),
  ]);

  return {
    organizationId: active.organizationId,
    role: active.role,
    educationEnabled,
    residentialEnabled,
    operationsAccess,
  };
}

export async function isEducationCoreEnabledForCurrentSession() {
  const state = await getEducationAccessState();
  return state.educationEnabled;
}

export async function isWellnessResidentialEnabledForCurrentSession() {
  const state = await getEducationAccessState();
  return state.residentialEnabled;
}

export async function canAccessEducationOperationsForCurrentWorkspace() {
  const state = await getEducationAccessState();
  return state.operationsAccess;
}
