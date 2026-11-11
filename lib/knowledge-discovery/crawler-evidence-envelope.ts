import { prepareHtml5WebsiteEvidence } from '@/lib/knowledge-extraction/html5-visible-text';
import { prepareSourceGroundedDrafts } from '@/lib/knowledge-extraction/source-grounded-drafts';
import type { PublicWebResponse } from './public-fetch';

/**
 * KB-09S: a bounded, unreviewed evidence ENVELOPE prepared from the actual
 * already authorized crawler response, NOT from manually pasted HTML.
 *
 * No database access, network requests, AI calls or publishing. The existing
 * production worker does NOT inject this preparer until legal/security
 * approval and an independently reviewed atomic evidence RPC are available.
 */
export type CrawlerEvidenceEnvelope = {
  source_url: string;
  snapshot_sha256: string;
  fetched_at: string;
  quotes: Array<{
    block_id: string;
    exact_quote: string;
    quote_sha256: string;
  }>;
};

export type CrawlerEvidenceEnvelopeResult =
  | { ok: true; evidence: CrawlerEvidenceEnvelope; candidateCount: number }
  | { ok: false; error: string };

const MAX_QUOTES = 16;
const MAX_QUOTE_CHARS = 1400;
const MAX_ENVELOPE_BYTES = 30_000;
const MAX_BODY_BYTES = 512 * 1024;

/**
 * All source claims must already originate from a pinned, robots-checked,
 * purpose-consented crawler HTTP response. This function alone cannot
 * attest to source origin or browser/CSS/JS visibility. The worker must
 * bind these bytes to the checked page commit inside ONE database transaction.
 */
export function prepareCrawlerEvidenceEnvelope(
  verifiedSeed: URL,
  response: PublicWebResponse,
  fetchedAt: string,
): CrawlerEvidenceEnvelopeResult {
  if (verifiedSeed.protocol !== 'https:' ||
      response.status !== 200 ||
      !/^(?:text\/html|application\/xhtml\+xml)(?:;|\s|$)/i.test(response.contentType) ||
      Buffer.byteLength(response.body, 'utf8') > MAX_BODY_BYTES) {
    return { ok:false, error:'unsupported_or_unbounded_html_response' };
  }
  const result = prepareHtml5WebsiteEvidence({
    verifiedSeedUrl: verifiedSeed.href,
    fetchedAt,
    response,
  });
  if (!result.ok) {
    return { ok:false, error:'invalid_crawler_evidence' };
  }
  const evidence = result.evidence;
  // The synthetic durable contract binds to the EXACT stored page URL.
  // The existing evidence normalizer drops tracking queries/fragments, so
  // do not silently attach a canonicalized quote to a different page row.
  if (response.url !== evidence.sourceUrl) {
    return { ok:false, error:'uncanonicalized_source_url' };
  }
  const candidates = prepareSourceGroundedDrafts(
    evidence, verifiedSeed.hostname,
  );
  if (!candidates.ok) {
    return { ok:false, error:'invalid_quote_provenance' };
  }
  if (!candidates.bundle.drafts.length) {
    return { ok:false, error:'no_bounded_review_candidates' };
  }
  const quotes = evidence.blocks
    .filter(block =>
      block.quote.length >= 2 && block.quote.length <= MAX_QUOTE_CHARS
    )
    .slice(0, MAX_QUOTES)
    .map(block => ({
      block_id: block.id,
      exact_quote: block.quote,
      quote_sha256: block.quoteSha256,
    }));
  if (!quotes.length) {
    return { ok:false, error:'no_bounded_review_quotes' };
  }
  const envelope: CrawlerEvidenceEnvelope = {
    source_url: evidence.sourceUrl,
    snapshot_sha256: evidence.snapshotSha256,
    fetched_at: evidence.fetchedAt,
    quotes,
  };
  if (Buffer.byteLength(JSON.stringify(envelope),'utf8') > MAX_ENVELOPE_BYTES) {
    return { ok:false, error:'evidence_envelope_too_large' };
  }
  return {
    ok:true, evidence:envelope,
    candidateCount:candidates.bundle.drafts.length,
  };
}
