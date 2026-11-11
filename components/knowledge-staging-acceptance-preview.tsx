import type { AcceptanceLedgerReport } from '@/lib/knowledge-extraction/staging-acceptance-ledger';

/** Render-only safety checklist; never request, save, or approve evidence. */
export function KnowledgeStagingAcceptancePreview({
  report,
}: {report:AcceptanceLedgerReport}){
  const headline=report.totals;
  return (
    <section aria-label="Isolated staging acceptance preview"
      className="mx-auto mb-8 max-w-6xl rounded-xl border border-slate-200 bg-white p-5 text-slate-800 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            KB-04E · Release acceptance inventory
          </p>
          <h2 className="mt-2 text-lg font-semibold">Isolated staging acceptance</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            A checklist of independent security, consent, deletion and AI quality
            tests. Evidence claims are never treated as actual verification.
          </p>
        </div>
        <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Release blocked
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Required scenarios</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{headline.required}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Missing evidence</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{headline.missing}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Unverified claims</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{headline.claimedButUnverified}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Contradictions</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{headline.contradictory}</p>
        </div>
      </div>
      <details className="mt-4 rounded-lg border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Inspect {headline.required} acceptance scenarios
        </summary>
        <ul className="mt-3 divide-y divide-slate-100">
          {report.rows.map(row=>(
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="max-w-2xl">
                <p className="text-xs font-medium text-slate-700">{row.label}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {row.group.replaceAll('_',' ')} · Expected: {row.expected}
                </p>
              </div>
              <span className="text-xs font-semibold text-amber-800">
                {row.status==='missing'?'Not evidenced':
                  row.status==='contradictory_claim'?'Contradictory claim':
                  'Claim requires independent verification'}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <div className="mt-4 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        <p className="font-semibold text-slate-700">Production release remains disabled</p>
        <p className="mt-1">
          Isolated tenant RLS, consent withdrawal, retention/deletion, DNS and
          robots safety, real browser visibility, provider grounding, audit,
          version controls and rollback all need independent evidence.
          A fully populated checklist still cannot grant permissions.
        </p>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        No website access, knowledge write, AI provider call, merge or deployment is
        authorized by this preview. The existing approval flow is unchanged.
      </p>
    </section>
  );
}
