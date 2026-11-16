export type OpenSeoProject = {
  id: string;
  name: string;
  domain: string | null;
  locationCode: number;
  languageCode: string;
};

export type OpenSeoRankTracker = {
  id: string;
  domain: string;
  locationCode: number | null;
  locationName: string | null;
  languageCode: string | null;
  scheduleInterval: string | null;
  lastCheckedAt: string | null;
};

/** Only accept an expected JSON-RPC success response from OpenSEO. */
export function parseOpenSeoMcpStructuredContent(
  raw: string,
): Record<string, unknown> | null {
  if (raw.length > 262144) return null;

  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
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
  return mcp.structuredContent as Record<string, unknown>;
}

/** OpenSEO list_projects is free and returns structured project records. */
export function parseOpenSeoProjectInventory(raw: string): OpenSeoProject[] | null {
  const structured = parseOpenSeoMcpStructuredContent(raw);
  if (!structured || !Array.isArray(structured.projects) || structured.projects.length > 500) {
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

/**
 * OpenSEO get_rank_tracker without trackerId is another zero-credit tool.
 * Only return documented, bounded display fields from its configs.
 * Missing optional freshness values remain unknown, not zero/healthy.
 */
export function parseOpenSeoRankTrackers(raw: string): OpenSeoRankTracker[] | null {
  const structured = parseOpenSeoMcpStructuredContent(raw);
  if (!structured || !Array.isArray(structured.configs) || structured.configs.length > 100) {
    return null;
  }

  const trackers: OpenSeoRankTracker[] = [];
  for (const item of structured.configs) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !row.id.trim() ||
      row.id.length > 256 ||
      typeof row.domain !== "string" ||
      !row.domain.trim() ||
      row.domain.length > 500
    ) return null;

    for (const name of ["locationName", "languageCode", "scheduleInterval", "lastCheckedAt"]) {
      if (row[name] != null && (typeof row[name] !== "string" || row[name].length > 300)) {
        return null;
      }
    }
    if (row.locationCode != null && (typeof row.locationCode !== "number" || !Number.isFinite(row.locationCode))) {
      return null;
    }

    trackers.push({
      id: row.id,
      domain: row.domain,
      locationCode: (row.locationCode as number | null | undefined) ?? null,
      locationName: (row.locationName as string | null | undefined) ?? null,
      languageCode: (row.languageCode as string | null | undefined) ?? null,
      scheduleInterval: (row.scheduleInterval as string | null | undefined) ?? null,
      lastCheckedAt: (row.lastCheckedAt as string | null | undefined) ?? null,
    });
  }
  return trackers;
}
