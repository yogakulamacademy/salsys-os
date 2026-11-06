import { requireAdminWorkspaceAccess } from '@/lib/route-access';
import { prepareHtml5WebsiteEvidence } from '@/lib/knowledge-extraction/html5-visible-text';
import { KnowledgeEvidenceReviewPreview } from '@/components/knowledge-evidence-review-preview';
import { prepareSourceGroundedDrafts } from '@/lib/knowledge-extraction/source-grounded-drafts';
import { analyzeSourceReviewSignals } from '@/lib/knowledge-extraction/source-review-signals';
import { buildAIDraftingRequest, validateAIDraftingResponse } from '@/lib/knowledge-extraction/ai-draft-contract';
import { evaluateGroundedAIProposals } from '@/lib/knowledge-extraction/ai-grounding-evaluation';
import { prepareSyntheticKnowledgeReviewAcceptance } from '@/lib/knowledge-extraction/knowledge-review-acceptance';
import { compareWebsiteEvidenceSnapshots } from '@/lib/knowledge-extraction/website-snapshot-delta';
import { KnowledgeRefreshReadinessPreview } from '@/components/knowledge-refresh-readiness-preview';
import { assessSourceChangeImpact } from '@/lib/knowledge-extraction/source-change-impact';
import { KnowledgeSourceChangeImpactPreview } from '@/components/knowledge-source-change-impact-preview';
import { prepareSyntheticHumanReviewHandoff } from '@/lib/knowledge-extraction/human-review-handoff';
import { KnowledgeHumanReviewHandoffPreview } from '@/components/knowledge-human-review-handoff-preview';

export const dynamic = 'force-dynamic';

/**
 * Synthetic, read-only KB-02D admin preview.
 * No public website is fetched, no database is queried for evidence, and no
 * review choice is stored or used to alter knowledge retrieval.
 */
const FIXTURE = [
  '<!doctype html><html lang="en"><head><title>Sample company — Services</title></head><body>',
  '<main><h1>Services</h1>',
  '<p>Our example company provides scheduled training and consultations.</p>',
  '<h2>Programs</h2>',
  '<ul><li>Introduction workshop: 2 days.</li><li>Advanced workshop: 5 days.</li></ul>',
  '<h2>Fees</h2>',
  '<table><tr><th>Service</th><th>Price</th></tr>',
  '<tr><td>Introduction workshop</td><td>$150</td></tr>',
  '<tr><td>Advanced workshop</td><td>$420</td></tr></table>',
  '<h2>Frequently asked questions</h2>',
  '<dl><dt>Can I reschedule?</dt><dd>Rescheduling requests must be submitted before the event.</dd>',
  '<dt>Are materials included?</dt><dd>Workshop materials are included.</dd></dl>',
  '</main><nav>Ignore this navigation</nav>',
  '<footer>Sample footer</footer></body></html>',
].join('');

export default async function EvidenceReviewPreviewPage() {
  await requireAdminWorkspaceAccess();

  const result = prepareHtml5WebsiteEvidence({
    verifiedSeedUrl:'https://sample.example.com/',
    fetchedAt:'2026-11-06T00:00:00.000Z',
    response:{
      url:'https://sample.example.com/services',
      status:200,
      contentType:'text/html',
      body:FIXTURE,
    },
  });
  if (!result.ok) {
    throw new Error('Synthetic evidence preview fixture is invalid.');
  }
  const candidates = prepareSourceGroundedDrafts(result.evidence, 'sample.example.com');
  if (!candidates.ok) {
    throw new Error('Synthetic draft candidate fixture is invalid.');
  }
  // A second invented page demonstrates a difference without claiming that
  // either quotation is current or correct. No network calls or DB writes.
  const older = prepareHtml5WebsiteEvidence({
    verifiedSeedUrl:'https://sample.example.com/',
    fetchedAt:'2026-09-01T00:00:00.000Z',
    response:{
      url:'https://sample.example.com/archived-workshop-fees',
      status:200,
      contentType:'text/html',
      body:'<html><head><title>Archived example fees</title></head><body>'
        +'<main><h1>Introduction workshop</h1><h2>Fees</h2>'
        +'<p>Introduction workshop: $175</p></main></body></html>',
    },
  });
  if(!older.ok)throw new Error('Synthetic older source fixture is invalid.');
  const olderCandidates=prepareSourceGroundedDrafts(older.evidence,'sample.example.com');
  if(!olderCandidates.ok)throw new Error('Synthetic older source candidates invalid.');
  const currentFee=candidates.bundle.drafts.find(d=>d.kind==='source_statement'
    &&d.statement==='Introduction workshop | $150');
  const previousFee=olderCandidates.bundle.drafts.find(d=>d.kind==='source_statement'
    &&d.statement==='Introduction workshop: $175');
  if(!currentFee||!previousFee)throw new Error('Synthetic comparison binding missing.');
  const scopeKey='program:introduction-workshop/session:sample';
  const fieldKey='fee';
  const differences=analyzeSourceReviewSignals(
    [candidates.bundle,olderCandidates.bundle],
    [
      {draftId:currentFee.id,scopeKey,fieldKey,kind:'price'},
      {draftId:previousFee.id,scopeKey,fieldKey,kind:'price'},
    ],
    {
      verifiedHostname:'sample.example.com',
      asOf:'2026-11-06T12:00:00.000Z',
      reviewAgeDays:30,
    },
  );
  if(!differences.ok)throw new Error('Synthetic source comparison failed.');
  // KB-03C: Simulated model JSON demonstrates the output gate only. There
  // is no LLM provider, network call, evidence write or approval action.
  const aiEnvelope=buildAIDraftingRequest([candidates.bundle],'sample.example.com');
  if(!aiEnvelope.ok)throw new Error('Synthetic AI request fixture failed validation.');
  const feeEvidence=aiEnvelope.request.evidence.find(item=>
    item.exactAnswerQuote==='Introduction workshop | $150');
  const faqEvidence=aiEnvelope.request.evidence.find(item=>
    item.originalQuestion==='Can I reschedule?');
  if(!feeEvidence||!faqEvidence)throw new Error('Synthetic AI evidence fixture incomplete.');
  const syntheticModelJson = {
    schemaVersion:'kb03c-v1',
    requestId:aiEnvelope.request.requestId,
    proposals:[
      {
        kind:'faq',sourceDraftId:feeEvidence.sourceDraftId,
        question:'What is the fee for the introduction workshop?',
        answer:feeEvidence.exactAnswerQuote,
      },
      {
        kind:'faq',sourceDraftId:faqEvidence.sourceDraftId,
        question:'Can I reschedule?',
        answer:faqEvidence.exactAnswerQuote,
      },
    ],
  };
  const simulatedAI=validateAIDraftingResponse(syntheticModelJson,aiEnvelope.request);
  if(!simulatedAI.ok)throw new Error('Synthetic AI response fixture failed validation.');
  const groundingReview=evaluateGroundedAIProposals(
    aiEnvelope.request,
    simulatedAI.result,
    {asOf:'2026-11-06T12:00:00Z',reviewAgeDays:30},
    differences.report,
  );
  if(!groundingReview.ok)throw new Error('Synthetic grounding evaluation failed.');
  const acceptance=prepareSyntheticKnowledgeReviewAcceptance(
    aiEnvelope.request,
    syntheticModelJson,
    {asOf:'2026-11-06T12:00:00Z',reviewAgeDays:30},
    differences.report,
  );
  if(!acceptance.ok)throw new Error('Synthetic KB-03E acceptance fixture failed.');
  // KB-04A: Same exact invented page at two synthetic fetch timestamps.
  // Demonstrates source-only changes with no recrawl or approval mechanism.
  const previousPage = prepareHtml5WebsiteEvidence({
    verifiedSeedUrl:'https://sample.example.com/',
    fetchedAt:'2026-09-01T00:00:00.000Z',
    response:{
      url:'https://sample.example.com/services',
      status:200,
      contentType:'text/html',
      body:FIXTURE.replace('<td>$150</td>','<td>$175</td>'),
    },
  });
  if(!previousPage.ok)throw new Error('Synthetic prior page fixture invalid.');
  const snapshotDelta=compareWebsiteEvidenceSnapshots(
    previousPage.evidence,result.evidence,'sample.example.com',
  );
  if(!snapshotDelta.ok)throw new Error('Synthetic source snapshot comparison failed.');
  // KB-04C: MANUALLY SCOPED, invented effective windows and knowledge citation.
  // None of this is loaded from a customer, published corpus or live website.
  const modified=snapshotDelta.report.changes.find(change=>
    change.kind==='modified'&&change.prior&&change.current);
  if(!modified||!modified.prior||!modified.current){
    throw new Error('Synthetic knowledge change-impact fixture invalid.');
  }
  const testOrganization='00000000-0000-4000-8000-000000000001';
  const impact=assessSourceChangeImpact(
    [snapshotDelta.report],
    [
      {
        organizationId:testOrganization,changeId:modified.id,side:'prior',
        scopeKey:'program:introduction-workshop/session:sample',
        fieldKey:'fee',kind:'price',
        effectiveFrom:'2026-09-01',effectiveUntil:'2026-11-01',
      },
      {
        organizationId:testOrganization,changeId:modified.id,side:'current',
        scopeKey:'program:introduction-workshop/session:sample',
        fieldKey:'fee',kind:'price',
        effectiveFrom:'2026-10-15',effectiveUntil:'2026-12-01',
      },
    ],
    [{
      organizationId:testOrganization,
      documentId:'00000000-0000-4000-8000-000000000002',
      version:1,state:'published',sourceUrl:modified.prior.sourceUrl,
      snapshotSha256:modified.prior.snapshotSha256,
      blockId:modified.prior.blockId,quoteSha256:modified.prior.quoteSha256,
    }],
    {
      organizationId:testOrganization,verifiedHostname:'sample.example.com',
      asOf:'2026-11-06T12:00:00Z',reviewAgeDays:30,
    },
  );
  if(!impact.ok)throw new Error('Synthetic source change-impact fixture failed.');
  // KB-04D: one fictional, unsaved annotation. No actual actor, audit or
  // action invocation is implied by the claim below.
  const annotatedRow=acceptance.packet.rows.find(row=>
    row.sourceUrl===modified.current.sourceUrl&&
    row.answerQuoteSha256===modified.current.quoteSha256&&
    row.answerBlockId===modified.current.blockId);
  const handoff=prepareSyntheticHumanReviewHandoff({
    organizationId:testOrganization,activeOrganizationId:testOrganization,
    reviewerId:'00000000-0000-4000-8000-000000000003',
    reviewerRole:'admin',recordedAt:'2026-11-06T12:00:00Z',
    acceptance:acceptance.packet,impact:impact.report,
    annotations:annotatedRow?[{
      proposalId:annotatedRow.proposalId,changeId:modified.id,
      annotation:'request_manual_correction',
      reviewerNote:'Fictional reviewer: independently check the current fee before editing.',
    }]:[],
  });
  if(!handoff.ok)throw new Error('Synthetic human review handoff fixture failed.');

  return (
    <>
    <KnowledgeEvidenceReviewPreview
      evidence={result.evidence}
      sourceCandidates={candidates.bundle}
      reviewSignals={differences.report}
      simulatedAIProposals={simulatedAI.result}
      groundingReview={groundingReview.report}
      acceptancePacket={acceptance.packet}
      snapshotDelta={snapshotDelta.report}
    />
    <KnowledgeRefreshReadinessPreview />
    <KnowledgeSourceChangeImpactPreview report={impact.report} />
    <KnowledgeHumanReviewHandoffPreview packet={handoff.packet} />
    </>
  );
}
