import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * KB-02A: Pure, side-effect-free evidence normalization.
 *
 * Upstream parser supplies visible text blocks from a previously authorized,
 * fetched HTML document. This does NOT fetch content, call AI, or publish
 * knowledge. Source text is untrusted data, never instructions.
 */

export type VisibleBlockKind =
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'paragraph' | 'list_item' | 'table_row'
  | 'faq_question' | 'faq_answer'
  | 'navigation' | 'footer' | 'cookie_banner' | 'form'
  | 'script' | 'style' | 'hidden';

export type VisibleWebsiteBlock = {
  kind: VisibleBlockKind;
  text: string;
};

export type WebsiteEvidenceSnapshot = {
  verifiedSeedUrl: string;
  sourceUrl: string;
  pageTitle: string;
  fetchedAt: string;
  blocks: VisibleWebsiteBlock[];
};

export type SourceEvidenceBlock = {
  id: string;
  sourceBlockIndex: number;
  blockKind: Exclude<VisibleBlockKind, 'navigation'|'footer'|'cookie_banner'|'form'|'script'|'style'|'hidden'|'h1'|'h2'|'h3'|'h4'|'h5'|'h6'>;
  quote: string;
  headingPath: string[];
  quoteSha256: string;
  reviewStatus: 'unreviewed';
};

export type PreparedWebsiteEvidence = {
  sourceType: 'website';
  sourceUrl: string;
  pageTitle: string;
  fetchedAt: string;
  snapshotSha256: string;
  blocks: SourceEvidenceBlock[];
  skippedBoilerplateBlocks: number;
  skippedRepeatedBlocks: number;
  hasContent: boolean;
};

export type WebsiteEvidenceResult =
  | { ok: true; evidence: PreparedWebsiteEvidence }
  | { ok: false; error: string };

const kinds = new Set<VisibleBlockKind>([
  'h1','h2','h3','h4','h5','h6','paragraph','list_item','table_row','faq_question','faq_answer',
  'navigation','footer','cookie_banner','form','script','style','hidden',
]);
const boilerplate = new Set<VisibleBlockKind>([
  'navigation','footer','cookie_banner','form','script','style','hidden',
]);
const headings = new Set<VisibleBlockKind>(['h1','h2','h3','h4','h5','h6']);
const MAX_BLOCKS = 250;
const MAX_BLOCK_TEXT = 6000;
const MAX_TOTAL_TEXT = 100000;
const MAX_OUTPUT_BLOCKS = 180;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function cleanLiteral(value: string): string {
  // Collapse layout whitespace without changing spelling, numbers or dates.
  // Never translate, summarize, interpret or expand a source quote.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/gu, ' ').trim();
}

function canonicalSourceUrl(seedInput: string, pageInput: string): string | null {
  try {
    if (seedInput.length > 2048 || pageInput.length > 2048) return null;
    const seed = new URL(seedInput);
    const page = new URL(pageInput);
    if (seed.protocol !== 'https:' || page.protocol !== 'https:') return null;
    if (seed.username || seed.password || page.username || page.password) return null;
    if (seed.port || page.port) return null;
    if (isIP(seed.hostname) || isIP(page.hostname)) return null;
    if (seed.hostname !== page.hostname) return null;
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(seed.hostname)) return null;
    if (seed.hostname.includes('..') || page.pathname.length > 2048) return null;
    // Query-string variants are deliberately not separate evidence sources.
    page.search = '';
    page.hash = '';
    return page.href;
  } catch {
    return null;
  }
}

export function prepareWebsiteEvidence(input: unknown): WebsiteEvidenceResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok:false, error:'invalid_snapshot' };
  }
  const row = input as Record<string, unknown>;
  if (typeof row.verifiedSeedUrl !== 'string' || typeof row.sourceUrl !== 'string') {
    return { ok:false, error:'missing_source_url' };
  }
  const sourceUrl = canonicalSourceUrl(row.verifiedSeedUrl, row.sourceUrl);
  if (!sourceUrl) return { ok:false, error:'source_not_within_verified_https_host' };
  if (typeof row.pageTitle !== 'string' || row.pageTitle.length > 300) {
    return { ok:false, error:'invalid_page_title' };
  }
  if (typeof row.fetchedAt !== 'string' || !Number.isFinite(Date.parse(row.fetchedAt))) {
    return { ok:false, error:'invalid_fetched_at' };
  }
  const fetchedAt = new Date(row.fetchedAt).toISOString();
  if (!Array.isArray(row.blocks) || row.blocks.length > MAX_BLOCKS) {
    return { ok:false, error:'invalid_block_count' };
  }

  let total = 0;
  const accepted: Array<{ kind: VisibleBlockKind; text: string }> = [];
  for (const raw of row.blocks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok:false, error:'invalid_source_block' };
    }
    const block = raw as Record<string, unknown>;
    if (typeof block.kind !== 'string' || !kinds.has(block.kind as VisibleBlockKind)
      || typeof block.text !== 'string' || block.text.length > MAX_BLOCK_TEXT) {
      return { ok:false, error:'invalid_source_block' };
    }
    total += block.text.length;
    if (total > MAX_TOTAL_TEXT) return { ok:false, error:'source_text_over_limit' };
    accepted.push({ kind: block.kind as VisibleBlockKind, text: cleanLiteral(block.text) });
  }

  const pageTitle = cleanLiteral(row.pageTitle);
  const snapshotSha256 = sha256(JSON.stringify([
    sourceUrl, pageTitle, accepted.map(block => [block.kind,block.text]),
  ]));
  const headingStack = ['', '', '', '', '', ''];
  const items: SourceEvidenceBlock[] = [];
  const seenInHeading = new Set<string>();
  let skippedBoilerplateBlocks = 0;
  let skippedRepeatedBlocks = 0;

  for (const [i, block] of accepted.entries()) {
    if (boilerplate.has(block.kind)) {
      skippedBoilerplateBlocks++;
      continue;
    }
    if (headings.has(block.kind)) {
      const level = Number(block.kind.slice(1)) - 1;
      headingStack[level] = block.text;
      for (let j = level+1; j < headingStack.length; j++) headingStack[j] = '';
      seenInHeading.clear();
      continue;
    }
    if (!block.text) continue;
    if (items.length >= MAX_OUTPUT_BLOCKS) {
      return { ok:false, error:'evidence_output_over_limit' };
    }
    const headingPath = headingStack.filter(Boolean);
    const dedupe = JSON.stringify([headingPath,block.kind,block.text]);
    if (seenInHeading.has(dedupe)) {
      skippedRepeatedBlocks++;
      continue;
    }
    seenInHeading.add(dedupe);
    const id = sha256(JSON.stringify([snapshotSha256,i,block.kind,block.text]));
    items.push({
      id, sourceBlockIndex:i,
      blockKind:block.kind as SourceEvidenceBlock['blockKind'],
      quote:block.text,
      headingPath,
      quoteSha256:sha256(block.text),
      reviewStatus:'unreviewed',
    });
  }

  return {
    ok:true,
    evidence: {
      sourceType:'website', sourceUrl, pageTitle, fetchedAt,
      snapshotSha256, blocks:items, skippedBoilerplateBlocks,
      skippedRepeatedBlocks, hasContent:items.length > 0,
    },
  };
}
