import type { SourceChangeImpactReport } from '@/lib/knowledge-extraction/source-change-impact';

/** Render synthetic review findings only; no mutation, suppression or action controls. */
export function KnowledgeSourceChangeImpactPreview({
  report,
}: {
  report: SourceChangeImpactReport;
}) {
  return (
    <section aria-label="Knowledge change impact preview"
      className="mx-auto mb-8 max-w-6xl rounded-xl border border-slate-200 bg-white p-5 text-slate-800 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            KB-04C · Synthetic preview
          </p>
          <h2 className="mt-2 text-lg font-semibold">Knowledge change impact</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            Manually scoped, hypothetical website quotations. This report does not
            verify website authenticity, choose a current price or update published knowledge.
          </p>
        </div>
        <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Human review required
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Change impact counts">
        {([
          ['Changed quotations',report.counts.changes],
          ['Unmapped changes',report.counts.unboundChanges],
          ['Published citations at risk',report.counts.potentiallyAffectedPublishedDocuments],
          ['Fields for review',report.counts.fieldsNeedingReview],
        ] as const).map(([label,value])=>(
          <div key={label} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {report.counts.historicalReferencesNotCovered>0?(
        <p className="mt-3 text-xs text-amber-900">
          {report.counts.historicalReferencesNotCovered} historical citation(s) are
          outside this comparison; no complete history coverage is claimed.
        </p>
      ):null}
      <div className="mt-5 space-y-4">
        {report.changes.map(item=>(
          <article key={item.changeId} className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-700">
              {item.changeKind==='modified'?'Possible quotation modification':
                item.changeKind==='removed'?'Quotation no longer present':
                'New quotation in supplied snapshot'}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {([
                ['Earlier',item.prior],['Later',item.current],
              ] as const).map(([label,source])=>(
                <div key={label} className="min-w-0 rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  {source?(
                    <>
                      <blockquote className="mt-2 break-words border-l-2 border-slate-300 pl-3 text-sm">
                        {source.exactQuote}
                      </blockquote>
                      <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                        {source.fetchedAt} · SHA {source.quoteSha256.slice(0,12)}…
                      </p>
                    </>
                  ):(
                    <p className="mt-2 text-xs text-slate-500">No quotation in this snapshot.</p>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-amber-800">
              {item.reasons.includes('published_citation_potentially_affected')
                ? 'A simulated published knowledge version cites the earlier text. Review before considering any update.'
                : 'This difference requires human source verification.'}
            </p>
          </article>
        ))}
      </div>
      <div className="mt-5 rounded-lg bg-slate-50 p-4">
        <p className="text-sm font-semibold">Effective-period and semantic review</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Field matching is provided explicitly by a reviewer; it is not inferred by AI.
          Overlapping date annotations are a review signal, not proof that either offer is active.
        </p>
        <ul className="mt-3 divide-y divide-slate-200">
          {report.fieldReviews.map(field=>(
            <li key={field.scopeKey+'|'+field.fieldKey} className="flex flex-wrap justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="break-all text-xs font-semibold text-slate-700">
                  {field.scopeKey} / {field.fieldKey}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {field.citations.length} source quotation(s) · {field.reason.replaceAll('_',' ')}
                </p>
              </div>
              <span className="text-xs font-semibold text-amber-800">
                Unverified
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-600">
        No automatic source replacement, actual knowledge suppression, approval, publication,
        crawl, evidence storage or AI call is enabled. The existing human approval
        and knowledge retrieval workflows remain unchanged.
      </p>
    </section>
  );
}
