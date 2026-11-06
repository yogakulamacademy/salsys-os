import { requireAdminWorkspaceAccess } from '@/lib/route-access';
import { prepareHtml5WebsiteEvidence } from '@/lib/knowledge-extraction/html5-visible-text';
import { KnowledgeEvidenceReviewPreview } from '@/components/knowledge-evidence-review-preview';
import { prepareSourceGroundedDrafts } from '@/lib/knowledge-extraction/source-grounded-drafts';

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
  const candidates = prepareSourceGroundedDrafts(result.evidence);
  if (!candidates.ok) {
    throw new Error('Synthetic draft candidate fixture is invalid.');
  }
  return (
    <KnowledgeEvidenceReviewPreview
      evidence={result.evidence}
      sourceCandidates={candidates.bundle}
    />
  );
}
