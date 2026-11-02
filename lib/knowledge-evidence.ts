export type KnowledgeEvidence = { documentId: string; title: string; version: number | null; validUntil: string | null };
export type KnowledgeMatch = { chunk_id: string; document_id: string; title: string; category: string; content: string; rank: number; valid_until: string | null; metadata: Record<string, unknown> | null };
export type KnowledgeMatches = { ok: true; matches: KnowledgeMatch[]; evidence: KnowledgeEvidence[] } | { ok: false; error: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: string, max: number) => value.replace(/\u0000/g, '').trim().slice(0, max);

/** Canonical RPC owns tenant/approval/source/valid-from rules; validate and minimize its response here. */
export function inspectKnowledgeMatches(rows: unknown, now = Date.now()): KnowledgeMatches {
  if (!Array.isArray(rows) || rows.length > 20) return { ok: false, error: 'Approved knowledge returned an invalid response. Retry before drafting.' };
  const matches: KnowledgeMatch[] = [], evidence = new Map<string, KnowledgeEvidence>(), seen = new Map<string, string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !uuid.test(row.chunk_id) || !uuid.test(row.document_id) || typeof row.title !== 'string' || typeof row.content !== 'string' || !row.content.trim() || !Number.isFinite(row.rank)) return { ok: false, error: 'Approved knowledge could not be validated. Retry before drafting.' };
    const validUntil = row.valid_until;
    if (validUntil !== null && (typeof validUntil !== 'string' || !Number.isFinite(Date.parse(validUntil)))) return { ok: false, error: 'A knowledge validity date is invalid. Ask an admin to review it.' };
    if (validUntil !== null && Date.parse(validUntil) <= now) return { ok: false, error: 'Retrieved knowledge expired before this draft. Refresh and try again.' };
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : null;
    const version = typeof metadata?.document_version === 'number' && Number.isSafeInteger(metadata.document_version) && metadata.document_version > 0 ? metadata.document_version : null;
    const fingerprint = JSON.stringify([row.document_id, row.title, row.category, row.content, validUntil, version]);
    if (seen.has(row.chunk_id)) {
      if (seen.get(row.chunk_id) !== fingerprint) return { ok: false, error: 'Conflicting knowledge chunks were returned. Ask an admin to review them.' };
      continue;
    }
    seen.set(row.chunk_id, fingerprint);
    matches.push({ chunk_id: row.chunk_id, document_id: row.document_id, title: text(row.title, 240), category: typeof row.category === 'string' ? text(row.category, 80) : 'general', content: text(row.content, 1800), rank: row.rank, valid_until: validUntil, metadata: version === null ? null : { document_version: version } });
    const previous = evidence.get(row.document_id);
    if (previous && (previous.version !== version || previous.validUntil !== validUntil || previous.title !== text(row.title, 240))) return { ok: false, error: 'Conflicting knowledge versions were returned. Ask an admin to review them.' };
    evidence.set(row.document_id, { documentId: row.document_id, title: text(row.title, 240), version, validUntil });
  }
  return { ok: true, matches, evidence: [...evidence.values()] };
}

/** Compare factual context, not ranking order; catches revocation/version/content changes during generation. */
export function knowledgeFingerprint(matches: readonly KnowledgeMatch[]): string {
  return JSON.stringify([...matches].sort((a, b) => a.chunk_id.localeCompare(b.chunk_id)).map(m => [m.chunk_id, m.document_id, m.title, m.category, m.content, m.valid_until, m.metadata?.document_version ?? null]));
}
