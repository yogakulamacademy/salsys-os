import "server-only";

import {
  callOpenSeoReadOnlyMcpTool,
  type OpenSeoMcpCallStatus,
} from "@/lib/integrations/openseo-mcp-transport";
import {
  parseOpenSeoProjectInventory,
  parseOpenSeoRankTrackers,
  type OpenSeoProject,
  type OpenSeoRankTracker,
} from "@/lib/integrations/openseo-mcp-response";

export type OpenSeoProjectInventory = {
  status: OpenSeoMcpCallStatus;
  message: string;
  projects: OpenSeoProject[];
  checkedAt: string | null;
};

export type OpenSeoRankTrackerInventory = {
  status: OpenSeoMcpCallStatus | "project_not_found";
  message: string;
  project: OpenSeoProject | null;
  trackers: OpenSeoRankTracker[];
  checkedAt: string | null;
};

type Environment = Record<string, string | undefined>;

/** Zero-credit OpenSEO project inventory, with exact SalsysOS tenant binding. */
export async function getOpenSeoProjectInventory(
  organizationId: string,
  env: Environment = process.env,
): Promise<OpenSeoProjectInventory> {
  const call = await callOpenSeoReadOnlyMcpTool(organizationId, "list_projects", {}, env);
  if (call.status !== "connected" || call.raw === null) {
    return {
      status: call.status,
      message: call.message,
      projects: [],
      checkedAt: call.checkedAt,
    };
  }

  const projects = parseOpenSeoProjectInventory(call.raw);
  if (!projects) {
    return {
      status: "invalid_response",
      message: "OpenSEO project data could not be verified.",
      projects: [],
      checkedAt: call.checkedAt,
    };
  }
  return {
    status: "connected",
    message: projects.length
      ? `Verified ${projects.length} real OpenSEO project${projects.length === 1 ? "" : "s"}.`
      : "OpenSEO connected, but this API key has no projects yet.",
    projects,
    checkedAt: call.checkedAt,
  };
}

/**
 * Zero-credit existing rank tracker list, always after verifying the project
 * is present in the API key's list_projects inventory. No scheduled or manual
 * rank checks are triggered. This is observation, not measurement execution.
 */
export async function getOpenSeoRankTrackerInventory(
  organizationId: string,
  projectId: string,
  env: Environment = process.env,
): Promise<OpenSeoRankTrackerInventory> {
  const projects = await getOpenSeoProjectInventory(organizationId, env);
  if (projects.status !== "connected") {
    return {
      status: projects.status,
      message: projects.message,
      project: null,
      trackers: [],
      checkedAt: projects.checkedAt,
    };
  }

  const project = projects.projects.find((item) => item.id === projectId);
  if (!project) {
    return {
      status: "project_not_found",
      message: "This OpenSEO project is not present in the mapped workspace.",
      project: null,
      trackers: [],
      checkedAt: projects.checkedAt,
    };
  }

  const call = await callOpenSeoReadOnlyMcpTool(
    organizationId,
    "get_rank_tracker",
    { projectId: project.id },
    env,
  );
  if (call.status !== "connected" || call.raw === null) {
    return {
      status: call.status,
      message: call.message,
      project,
      trackers: [],
      checkedAt: call.checkedAt,
    };
  }

  const trackers = parseOpenSeoRankTrackers(call.raw);
  if (!trackers) {
    return {
      status: "invalid_response",
      message: "OpenSEO rank tracker data could not be verified.",
      project,
      trackers: [],
      checkedAt: call.checkedAt,
    };
  }
  return {
    status: "connected",
    message: trackers.length
      ? `Verified ${trackers.length} saved rank tracker${trackers.length === 1 ? "" : "s"}.`
      : "OpenSEO connected, but this project has no rank trackers yet.",
    project,
    trackers,
    checkedAt: call.checkedAt,
  };
}
