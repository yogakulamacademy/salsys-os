/**
 * KB-14A — presentation and server-action defense in depth ONLY.
 *
 * The authoritative guard must live in reviewed PostgreSQL SQL; an old
 * `approve_knowledge_document_v1` RPC can be called without Next.js.
 * Treat all discovered-page and explicitly unverified document markers
 * as publication-held until independent source/consent approval is designed.
 */
export function discoveryPublicationHeld(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  const value = metadata as Record<string, unknown>;
  return value.entry_mode === 'discovery_manual_review'
    || value.manual_review_required === true
    || value.source_text_verified === false;
}
