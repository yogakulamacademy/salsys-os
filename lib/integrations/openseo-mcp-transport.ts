import "server-only";

import { getVendorWorkspacePreview } from "@/lib/integrations/vendor-workspaces";

export type OpenSeoReadOnlyTool = "list_projects" | "get_rank_tracker";

export type OpenSeoMcpCallStatus =
  | "disabled"
  | "not_configured"
  | "tenant_not_mapped"
  | "credentials_missing"
  | "unauthorized"
  | "unavailable"
  | "invalid_response"
  | "connected";

export type OpenSeoMcpCall = {
  status: OpenSeoMcpCallStatus;
  message: string;
  raw: string | null;
  checkedAt: string | null;
};

type Environment = Record<string, string | undefined>;

function result(
  status: OpenSeoMcpCallStatus,
  message: string,
  raw: string | null = null,
  checkedAt: string | null = null,
): OpenSeoMcpCall {
  return { status, message, raw, checkedAt };
}

/**
 * The only permitted MCP operations here are zero-credit, read-only inventory
 * tools identified directly in upstream OpenSEO source. Nothing in this client
 * can call create_project, research_keywords, run_rank_tracker or any Meta API.
 *
 * The API key belongs to an OpenSEO organization, not a SalsysOS tenant. The
 * fixed tenant mapping is a deliberate fail-closed pilot until per-tenant
 * encrypted credentials and revocation have been implemented.
 */
export async function callOpenSeoReadOnlyMcpTool(
  organizationId: string,
  tool: OpenSeoReadOnlyTool,
  args: Record<string, unknown> = {},
  env: Environment = process.env,
): Promise<OpenSeoMcpCall> {
  if (tool !== "list_projects" && tool !== "get_rank_tracker") {
    return result("invalid_response", "Unsupported OpenSEO operation.");
  }

  const preview = getVendorWorkspacePreview("open-seo", env);
  if (!preview.previewEnabled) {
    return result("disabled", "The OpenSEO pilot is disabled.");
  }
  if (!preview.url) {
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
  if (!apiKey || !/^oseo_[A-Za-z0-9_.~-]{8,2048}$/.test(apiKey)) {
    return result(
      "credentials_missing",
      "A server-side OpenSEO API key is required for verified project data.",
    );
  }

  let toolArgs: Record<string, unknown>;
  if (tool === "list_projects") {
    toolArgs = {};
  } else {
    if (
      typeof args.projectId !== "string" ||
      !args.projectId ||
      args.projectId.length > 256
    ) {
      return result("invalid_response", "A valid OpenSEO project ID is required.");
    }
    toolArgs = { projectId: args.projectId };
  }

  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(new URL("/mcp", preview.url), {
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
          name: tool,
          arguments: toolArgs,
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
      return result("unauthorized", "OpenSEO rejected the configured API key.", null, checkedAt);
    }
    if (!response.ok) {
      return result("unavailable", "OpenSEO did not accept the MCP request.", null, checkedAt);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json") && !contentType.includes("text/event-stream")) {
      return result("invalid_response", "OpenSEO returned an unexpected response format.", null, checkedAt);
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 262144) {
      return result("invalid_response", "OpenSEO returned too much data for the pilot.", null, checkedAt);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return result("invalid_response", "OpenSEO returned an empty transport body.", null, checkedAt);
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        return result("invalid_response", "OpenSEO returned too much data for the pilot.", null, checkedAt);
      }
      chunks.push(next.value);
    }

    const bytes = new Uint8Array(size);
    let cursor = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    return result("connected", "OpenSEO MCP transport responded.", new TextDecoder().decode(bytes), checkedAt);
  } catch {
    return result("unavailable", "OpenSEO MCP request failed or timed out.", null, checkedAt);
  }
}
