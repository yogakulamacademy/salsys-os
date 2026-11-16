import "server-only";

import { getVendorWorkspacePreview } from "@/lib/integrations/vendor-workspaces";
import { parseOpenSeoProjectInventory, type OpenSeoProject } from "@/lib/integrations/openseo-mcp-response";

export type OpenSeoProjectInventory = {
  status:
    | "disabled"
    | "not_configured"
    | "tenant_not_mapped"
    | "credentials_missing"
    | "unauthorized"
    | "unavailable"
    | "invalid_response"
    | "connected";
  message: string;
  projects: OpenSeoProject[];
  checkedAt: string | null;
};

type Environment = Record<string, string | undefined>;

function result(
  status: OpenSeoProjectInventory["status"],
  message: string,
  projects: OpenSeoProject[] = [],
  checkedAt: string | null = null,
): OpenSeoProjectInventory {
  return { status, message, projects, checkedAt };
}


/**
 * Read only OpenSEO's zero-credit list_projects tool. This env-level pilot is
 * locked to exactly one SalsysOS tenant. A missing or mismatched mapping
 * refuses outbound requests, because an OpenSEO API key can read all projects
 * in the OpenSEO organization to which that key belongs.
 */
export async function getOpenSeoProjectInventory(
  organizationId: string,
  env: Environment = process.env,
): Promise<OpenSeoProjectInventory> {
  const workspace = getVendorWorkspacePreview("open-seo", env);
  if (!workspace.previewEnabled) {
    return result("disabled", "The OpenSEO pilot is disabled.");
  }
  if (!workspace.url) {
    return result("not_configured", "OpenSEO needs a valid HTTPS deployment URL.");
  }

  const mappedTenant = env.SALSYS_OPENSEO_SALSYS_ORG_ID?.trim();
  if (!organizationId || !mappedTenant || mappedTenant !== organizationId) {
    return result(
      "tenant_not_mapped",
      "This SalsysOS workspace has no approved OpenSEO tenant mapping.",
    );
  }

  const apiKey = env.SALSYS_OPENSEO_API_KEY?.trim();
  if (!apiKey || !/^oseo_[A-Za-z0-9_-]+$/.test(apiKey)) {
    return result(
      "credentials_missing",
      "A server-side OpenSEO API key is required to list real projects.",
    );
  }

  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(new URL("/mcp", workspace.url), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/call",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "list_projects",
          arguments: {},
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 401 || response.status === 403) {
      return result("unauthorized", "OpenSEO rejected the configured API key.", [], checkedAt);
    }
    if (!response.ok) {
      return result("unavailable", "OpenSEO did not accept the MCP request.", [], checkedAt);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json") && !contentType.includes("text/event-stream")) {
      return result("invalid_response", "OpenSEO returned an unexpected response format.", [], checkedAt);
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 262144) {
      return result("invalid_response", "OpenSEO returned an oversized project inventory.", [], checkedAt);
    }

    // Bound the actual bytes too; content-length can be missing or misleading.
    const reader = response.body?.getReader();
    if (!reader) {
      return result("invalid_response", "OpenSEO returned an empty transport body.", [], checkedAt);
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        return result("invalid_response", "OpenSEO returned an oversized project inventory.", [], checkedAt);
      }
      chunks.push(next.value);
    }
    const raw = new TextDecoder().decode(
      Uint8Array.from(chunks.flatMap((chunk) => Array.from(chunk))),
    );
    const projects = parseOpenSeoProjectInventory(raw);
    if (!projects) {
      return result("invalid_response", "OpenSEO project data could not be verified.", [], checkedAt);
    }
    return result(
      "connected",
      projects.length
        ? `Verified ${projects.length} real OpenSEO project${projects.length === 1 ? "" : "s"}.`
        : "OpenSEO connected, but this API key has no projects yet.",
      projects,
      checkedAt,
    );
  } catch {
    return result("unavailable", "OpenSEO MCP request failed or timed out.", [], checkedAt);
  }
}
