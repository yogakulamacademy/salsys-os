import type { HumanReviewHandoffPacket } from '@/lib/knowledge-extraction/human-review-handoff';

/** Synthetic, server-rendered, read-only illustration. No decision buttons. */
export function KnowledgeHumanReviewHandoffPreview({
  packet,
}: {packet:HumanReviewHandoffPacket}){
  return (
    <section aria-label="Human review handoff preview"
      className="mx-auto mb-8 max-w-6xl rounded-xl border border-slate-200 bg-white p-5 text-slate-800 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            KB-04D · Synthetic review only
          </p>
          <h2 className="mt-2 text-lg font-semibold">Human review handoff</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            Proposed notes show how a reviewer might assess a changed source.
            They are not saved decisions, authenticated approvals or permission
            to edit existing knowledge.
          </p>
        </div>
        <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Handoff not connected
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {packet.rows.map(row=>(
          <article key={row.proposalId} className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">
                Unverified source proposal
              </p>
              <span className="text-xs text-amber-800">Not approved</span>
            </div>
            <blockquote className="mt-3 break-words border-l-2 border-slate-300 pl-3 text-sm">
              {row.sourceAnswer}
            </blockquote>
            <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
              {row.sourceUrl} · {row.sourceSnapshotSha256.slice(0,12)}…
            </p>
            <p className="mt-3 text-xs font-medium text-slate-700">
              Simulated annotation: {row.annotation.replaceAll('_',' ')}
            </p>
            {row.reviewerNote?(
              <p className="mt-1 text-xs text-slate-600">{row.reviewerNote}</p>
            ):null}
            <p className="mt-2 text-xs text-slate-600">
              An actual owner/admin must independently verify the source,
              scope, permissions and any amendment.
            </p>
          </article>
        ))}
      </div>
      <div className="mt-5 rounded-lg bg-slate-50 p-4">
        <h3 className="text-sm font-semibold">Required before a real handoff</h3>
        <ul className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
          <li>Verified source authenticity and browser visibility</li>
          <li>Authenticated tenant and reviewer in the write transaction</li>
          <li>Approved consent, retention and deletion</li>
          <li>Resolved semantic and effective-date conflicts</li>
          <li>Audit and tenant RLS validation</li>
          <li>Current document version revalidation and explicit approval</li>
        </ul>
        <p className="mt-4 text-xs leading-5 text-slate-600">
          Existing workflows remain createKnowledgeDocumentAction and
          approveKnowledgeDocumentAction. Neither action is invoked or
          connected here; this page does not submit reviewer annotations.
        </p>
      </div>
      <p className="mt-4 border-t border-slate-200 pt-4 text-xs font-medium text-amber-900">
        No reviewer decision recorded. No knowledge creation, publication,
        source storage or existing document modification authorized.
      </p>
    </section>
  );
}
