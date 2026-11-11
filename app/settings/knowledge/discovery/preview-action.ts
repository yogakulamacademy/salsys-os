'use server';

import { createHash } from 'node:crypto';

import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import { eligibleDiscoveredPageForManualDraft } from '@/lib/knowledge-discovery/eligible-page-draft';
import { extractHtml5VisibleBlocks, prepareHtml5WebsiteEvidence } from '@/lib/knowledge-extraction/html5-visible-text';
import { prepareSourceGroundedDrafts } from '@/lib/knowledge-extraction/source-grounded-drafts';

/** This is USER-PASTED, UNVERIFIED HTML, not source fetched by SalsysOS. */
export type ManuallyPastedHtmlPreviewState = {
  state: 'idle' | 'error' | 'empty' | 'preview';
  message: string;
  sourcePageId: string | null;
  sourceUrl: string | null;
  pastedHtmlSha256: string | null;
  excerpts: Array<{ index: number; kind: string; text: string }>;
  warnings: string[];
  // These are quote-only proposals derived from ADMIN-PASTED markup.
  // No website attestation, AI generation, storage or approval.
  provisionalCandidates: Array<{
    kind: 'faq_pair' | 'source_statement';
    text: string;
    risks: string[];
  }>;
};

function fail(message: string): ManuallyPastedHtmlPreviewState {
  return {
    state: 'error', message, sourcePageId: null, sourceUrl: null,
    pastedHtmlSha256: null, excerpts: [], warnings: [],
    provisionalCandidates: [],
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PASTED_HTML_BYTES = 150 * 1024;
const MAX_EXCERPTS = 24;
const MAX_EXCERPT_TEXT = 1400;

/**
 * KB-09R: no network, storage, worker, LLM, approval or public API access.
 * The only input is manually supplied HTML, and only source metadata from
 * the currently authorized tenant may be attached to its provisional text.
 * Stale proof/consent, missing RLS or disabled pilot all fail closed.
 *
 * useActionState requires a previous state parameter; it is ignored, not
 * trusted as evidence or as authority to continue a prior review.
 */
export async function previewPastedHtmlForManualReviewAction(
  _previous: ManuallyPastedHtmlPreviewState,
  formData: FormData,
): Promise<ManuallyPastedHtmlPreviewState> {
  if (useMockData ||
      process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED !== 'true' ||
      process.env.KNOWLEDGE_DISCOVERY_PAUSED === 'true') {
    return fail('The controlled discovery review is not enabled. No HTML was processed.');
  }

  const pageId = formData.get('page_id');
  const rawHtml = formData.get('html');
  if (typeof pageId !== 'string' || !UUID.test(pageId) ||
      typeof rawHtml !== 'string' || !rawHtml.trim() ||
      Buffer.byteLength(rawHtml, 'utf8') > MAX_PASTED_HTML_BYTES) {
    return fail('Provide a valid selected page and no more than 150 KiB of pasted HTML.');
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return fail('Please sign in again to review website evidence.');

    const workspace = await getCurrentWorkspaceContext(supabase);
    const active = workspace.activeWorkspace;
    const organizationId = workspace.activeOrganizationId;
    if (!organizationId || !active ||
        active.organizationId !== organizationId ||
        !['owner', 'admin'].includes(active.role)) {
      return fail('Only an owner or admin of the active organization may review source evidence.');
    }
    const { data: permitted, error: permitError } = await supabase.rpc(
      'can_manage_organization', { p_organization_id: organizationId },
    );
    if (permitError || permitted !== true) return fail('Your permission to review this organization is unavailable.');

    // This guard rechecks CURRENT organization, source page, job, ownership
    // proof and specific discovery consent. User-supplied URLs are ignored.
    const page = await eligibleDiscoveredPageForManualDraft(supabase, organizationId, pageId);
    if (!page) return fail('The selected page no longer has current review authorization.');

    // Reuse KB-02C's conservative HTML5 parser; never fabricate citations
    // or claim that user-pasted bytes were fetched by the discovery worker.
    const parsed = extractHtml5VisibleBlocks(rawHtml);
    if (!parsed.ok) return fail('The pasted HTML could not be safely extracted: ' + parsed.error);

    const excerpts = parsed.blocks
      .map((block, index) => ({index,kind:block.kind,text:block.text}))
      .filter(block => block.text.length >= 2 && block.text.length <= MAX_EXCERPT_TEXT)
      .slice(0, MAX_EXCERPTS);

    // Reuse the existing KB-02C+KB-03A exact-source candidate algorithms.
    // The synthetic "fetchedAt" below denotes the time an ADMIN PASTED
    // content into this review preview, never a verified live website fetch.
    // Do NOT persist citation identifiers from this unverified copy.
    const source = new URL(page.sourceUri);
    const prepared = prepareHtml5WebsiteEvidence({
      verifiedSeedUrl: source.origin + '/',
      fetchedAt: new Date().toISOString(),
      response:{
        url: page.sourceUri,
        status: 200,
        contentType: 'text/html',
        body: rawHtml,
      },
    });
    const derived = prepared.ok
      ? prepareSourceGroundedDrafts(prepared.evidence, source.hostname)
      : null;
    const provisionalCandidates = derived?.ok
      ? derived.bundle.drafts.slice(0, 12).map(draft => ({
          kind: draft.kind,
          text: draft.kind === 'faq_pair'
            ? 'Q: ' + draft.question + '\nA: ' + draft.answer
            : draft.statement,
          risks: draft.risks,
        }))
      : [];

    if (!excerpts.length) {
      return {
        state:'empty',
        message:'No eligible visible-text snippets were found. This does not prove the page contains no content.',
        sourcePageId:pageId, sourceUrl:page.sourceUri,
        pastedHtmlSha256:createHash('sha256').update(rawHtml,'utf8').digest('hex'),
        excerpts:[], warnings:parsed.warnings,
        provisionalCandidates: [],
      };
    }

    return {
      state:'preview',
      message:'Provisional text extracted from your pasted HTML. Compare against the original page before adding any draft.',
      sourcePageId:pageId, sourceUrl:page.sourceUri,
      pastedHtmlSha256:createHash('sha256').update(rawHtml,'utf8').digest('hex'),
      excerpts, warnings:parsed.warnings,
      provisionalCandidates,
    };
  } catch {
    // Never return source HTML, cookies, tenant identifiers, DB traces or
    // content from an interrupted proof/consent check.
    return fail('The review is unavailable. No content was saved or approved.');
  }
}
