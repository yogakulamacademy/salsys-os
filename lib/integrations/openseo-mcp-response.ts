export type OpenSeoProject = {
  id: string;
  name: string;
  domain: string | null;
  locationCode: number;
  languageCode: string;
};

/** Safely interpret either JSON or server-sent event MCP transport output. */
export function parseOpenSeoProjectInventory(raw: string): OpenSeoProject[] | null {
  if (raw.length > 262144) return null;

  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    // Stateless MCP servers may respond with SSE. Only collect JSON-RPC
    // response events; never reflect upstream error descriptions in our UI.
    const responses: unknown[] = [];
    for (const event of raw.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        responses.push(JSON.parse(data));
      } catch {
        return null;
      }
    }
    envelope = responses.find(
      (entry) =>
        !!entry &&
        typeof entry === "object" &&
        "id" in entry &&
        (entry as { id: unknown }).id === 1,
    );
  }

  if (!envelope || typeof envelope !== "object") return null;

  const packet = envelope as Record<string, unknown>;
  if (packet.jsonrpc !== "2.0" || packet.id !== 1 || packet.error) return null;
  if (!packet.result || typeof packet.result !== "object") return null;
  const mcp = packet.result as Record<string, unknown>;
  if (mcp.isError || !mcp.structuredContent || typeof mcp.structuredContent !== "object") {
    return null;
  }
  const structured = mcp.structuredContent as Record<string, unknown>;
  if (!Array.isArray(structured.projects) || structured.projects.length > 500) {
    return null;
  }

  const projects: OpenSeoProject[] = [];
  for (const item of structured.projects) {
    if (!item || typeof item !== "object") return null;
    const project = item as Record<string, unknown>;
    if (
      typeof project.id !== "string" ||
      !project.id.trim() ||
      project.id.length > 256 ||
      typeof project.name !== "string" ||
      !project.name.trim() ||
      project.name.length > 300 ||
      (project.domain != null && (typeof project.domain !== "string" || project.domain.length > 500)) ||
      typeof project.locationCode !== "number" ||
      !Number.isFinite(project.locationCode) ||
      typeof project.languageCode !== "string" ||
      project.languageCode.length > 24
    ) return null;

    projects.push({
      id: project.id,
      name: project.name,
      domain: (project.domain as string | null | undefined) ?? null,
      locationCode: project.locationCode,
      languageCode: project.languageCode,
    });
  }
  return projects;
}

