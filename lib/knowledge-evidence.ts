export type KnowledgeEvidence = {
  documentId: string;
  title: string;
  version: number | null;
  validUntil: string | null;
  sourceId: string | null;
  sourceName: string | null;
  sourceType: string | null;
  sourceUri: string | null;
};

export type KnowledgeMatch = {
  chunk_id: string;
  document_id: string;
  title: string;
  category: string;
  content: string;
  rank: number;
  valid_until: string | null;
  metadata: Record<string, unknown> | null;
};

export type KnowledgeMatches =
  | { ok: true; matches: KnowledgeMatch[]; evidence: KnowledgeEvidence[] }
  | { ok: false; error: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: string, max: number) => value.replace(/\u0000/g, '').trim().slice(0, max);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeSourceUri(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Defense in depth for explicitly unverified discovery content.
 * The production search RPC must still enforce tenant/source authorization,
 * approval and provenance itself. This only refuses evidence that actually
 * carries the unverified markers in the returned metadata. In particular,
 * the existing canonical RPC does NOT return linked-source metadata, so a
 * source-only marker remains a database-release blocker (KB-16A).
 * Missing markers preserve pre-existing ordinary/manual knowledge semantics;
 * this is not proof of consent, provenance, or approval.
 */
function explicitlyUnverifiedDiscovery(value: Record<string, unknown> | null): boolean {
  return value?.entry_mode === 'discovery_manual_review'
    || value?.manual_review_required === true
    || value?.manual_review_required === 'true'
    || value?.source_text_verified === false
    || value?.source_text_verified === 'false';
}

/** Canonical RPC owns tenant/approval/source/valid-from rules; validate and minimize its response here. */
export function inspectKnowledgeMatches(rows: unknown, now = Date.now()): KnowledgeMatches {
  if (!Array.isArray(rows) || rows.length > 20) {
    return { ok: false, error: 'Approved knowledge returned an invalid response. Retry before drafting.' };
  }

  const matches: KnowledgeMatch[] = [];
  const evidence = new Map<string, KnowledgeEvidence>();
  const seen = new Map<string, string>();

  for (const raw of rows) {
    const row = record(raw);
    if (
      !row ||
      typeof row.chunk_id !== 'string' ||
      !uuid.test(row.chunk_id) ||
      typeof row.document_id !== 'string' ||
      !uuid.test(row.document_id) ||
      typeof row.title !== 'string' ||
      typeof row.content !== 'string' ||
      !row.content.trim() ||
      typeof row.rank !== 'number' ||
      !Number.isFinite(row.rank)
    ) {
      return { ok: false, error: 'Approved knowledge could not be validated. Retry before drafting.' };
    }

    const validUntil = row.valid_until;
    if (
      validUntil !== null &&
      (typeof validUntil !== 'string' || !Number.isFinite(Date.parse(validUntil)))
    ) {
      return { ok: false, error: 'A knowledge validity date is invalid. Ask an admin to review it.' };
    }
    if (typeof validUntil === 'string' && Date.parse(validUntil) <= now) {
      return { ok: false, error: 'Retrieved knowledge expired before this draft. Refresh and try again.' };
    }

    const metadata = record(row.metadata);
    const documentMetadata = record(metadata?.document_metadata);
    const chunkMetadata = record(metadata?.chunk_metadata);
    const sourceMetadata = record(metadata?.source_metadata);
    if (
      explicitlyUnverifiedDiscovery(metadata) ||
      explicitlyUnverifiedDiscovery(documentMetadata) ||
      explicitlyUnverifiedDiscovery(sourceMetadata) ||
      explicitlyUnverifiedDiscovery(chunkMetadata) ||
      chunkMetadata?.source === 'manual_discovery_draft_unverified'
    ) {
      // Fail the entire result, not merely a tainted chunk: an LLM must not
      // receive a partially trusted set after a provenance inconsistency.
      return { ok: false, error: 'Retrieved knowledge needs source verification. Ask an admin to review it.' };
    }
    const version =
      typeof metadata?.document_version === 'number' &&
      Number.isSafeInteger(metadata.document_version) &&
      metadata.document_version > 0
        ? metadata.document_version
        : null;
    const sourceId =
      typeof metadata?.source_id === 'string' && uuid.test(metadata.source_id)
        ? metadata.source_id
        : null;
    const sourceName =
      typeof documentMetadata?.source_name === 'string' && documentMetadata.source_name.trim()
        ? text(documentMetadata.source_name, 240)
        : null;
    const sourceType =
      typeof documentMetadata?.source_type === 'string' && documentMetadata.source_type.trim()
        ? text(documentMetadata.source_type, 40)
        : null;
    const sourceUri = safeSourceUri(documentMetadata?.source_uri);
    const safeMetadata = {
      document_version: version,
      source_id: sourceId,
      document_metadata: {
        source_name: sourceName,
        source_type: sourceType,
        source_uri: sourceUri,
      },
    };

    const fingerprint = JSON.stringify([
      row.document_id,
      row.title,
      row.category,
      row.content,
      validUntil,
      version,
      sourceId,
      sourceName,
      sourceType,
      sourceUri,
    ]);

    if (seen.has(row.chunk_id)) {
      if (seen.get(row.chunk_id) !== fingerprint) {
        return { ok: false, error: 'Conflicting knowledge chunks were returned. Ask an admin to review them.' };
      }
      continue;
    }

    seen.set(row.chunk_id, fingerprint);
    matches.push({
      chunk_id: row.chunk_id,
      document_id: row.document_id,
      title: text(row.title, 240),
      category: typeof row.category === 'string' ? text(row.category, 80) : 'general',
      content: text(row.content, 1800),
      rank: row.rank,
      valid_until: typeof validUntil === 'string' ? validUntil : null,
      metadata: safeMetadata,
    });

    const currentEvidence: KnowledgeEvidence = {
      documentId: row.document_id,
      title: text(row.title, 240),
      version,
      validUntil: typeof validUntil === 'string' ? validUntil : null,
      sourceId,
      sourceName,
      sourceType,
      sourceUri,
    };
    const previous = evidence.get(row.document_id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(currentEvidence)) {
      return { ok: false, error: 'Conflicting knowledge versions were returned. Ask an admin to review them.' };
    }
    evidence.set(row.document_id, currentEvidence);
  }

  return { ok: true, matches, evidence: [...evidence.values()] };
}

/** Compare factual context, not ranking order; catches revocation/version/content/provenance changes during generation. */
export function knowledgeFingerprint(matches: readonly KnowledgeMatch[]): string {
  return JSON.stringify(
    [...matches]
      .sort((a, b) => a.chunk_id.localeCompare(b.chunk_id))
      .map((match) => [
        match.chunk_id,
        match.document_id,
        match.title,
        match.category,
        match.content,
        match.valid_until,
        match.metadata?.document_version ?? null,
        match.metadata?.source_id ?? null,
        record(match.metadata?.document_metadata)?.source_name ?? null,
        record(match.metadata?.document_metadata)?.source_type ?? null,
        record(match.metadata?.document_metadata)?.source_uri ?? null,
      ]),
  );
}
