'use client';

import { useMemo, useState } from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';
import type {
  KnowledgeChangeReviewPlan,
  KnowledgeChangeTriageIntent,
} from '@/lib/knowledge-extraction/knowledge-change-review-plan';

/**
 * Local-only synthetic human-review planning UI.
 * Choices are ephemeral React state. No FormData, server action, API call,
 * local storage or publishing control is reachable from this component.
 */
const intents: Array<{id:KnowledgeChangeTriageIntent;label:string}> = [
  {id:'inspect_updated_source',label:'Inspect updated quote'},
  {id:'retain_existing_pending_verification',label:'Keep existing pending verification'},
  {id:'defer_for_human_review',label:'Defer for later review'},
];

export function KnowledgeHumanChangeReviewPreview({
  plan,
}: { plan:KnowledgeChangeReviewPlan }) {
  const [choices,setChoices] = useState<
    Record<string,KnowledgeChangeTriageIntent>
  >({});
  const [expanded,setExpanded] = useState(false);
  const chosen = useMemo(
    ()=>plan.rows.filter(row=>choices[row.changeId]!==undefined).length,
    [choices,plan.rows],
  );

  return (
    <section aria-label="Human knowledge change review preview"
      className="mx-auto mb-8 max-w-6xl rounded-xl border border-slate-200 bg-white p-5 text-slate-800 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            KB-04D · Synthetic preview
          </p>
          <h2 className="mt-2 text-lg font-semibold">Human change review</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            Plan how a reviewer would investigate changed website quotations.
            These choices are temporary notes, not authenticated decisions.
          </p>
        </div>
        <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Approval handoff blocked
        </span>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-lg bg-slate-50 p-4">
        <ShieldAlert className="mt-0.5 shrink-0 text-amber-800"
          size={17} aria-hidden="true"/>
        <div>
          <p className="text-sm font-semibold text-slate-800">
            Local triage is not approval
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Neither website authenticity nor reviewer identity is independently
            verified. No consent, storage, audit, or existing knowledge workflow
            is connected. Leaving or reloading this page clears all selections.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span><strong className="tabular-nums">{plan.rows.length}</strong> quotation changes</span>
          <span><strong className="tabular-nums">{chosen}</strong> locally triaged</span>
          <span><strong className="tabular-nums">{plan.rows.length-chosen}</strong> pending</span>
          <span><strong className="tabular-nums">
            {plan.counts.potentiallyAffectedPublishedDocuments}
          </strong> hypothetical published documents to inspect</span>
        </div>
        <button type="button" onClick={() => setChoices({})}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">
          <RotateCcw size={13} aria-hidden="true"/> Reset local triage
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {plan.rows.map(row=>(
          <article key={row.changeId}
            aria-label={'Review quotation change '+row.changeId.slice(0,8)}
            className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">
                {row.changeKind==='modified'?'Possible modified quotation':
                  row.changeKind==='removed'?'Removed quotation':'Added quotation'}
              </p>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                {choices[row.changeId]?'Local intention only':'Not triaged'}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {([
                ['Prior quotation',row.prior],
                ['Current quotation',row.current],
              ] as const).map(([label,source])=>(
                <div key={label} className="min-w-0 rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-2 break-words text-sm text-slate-700">
                    {source?.exactQuote??'No quotation in this version'}
                  </p>
                  {source?(
                    <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                      {source.fetchedAt} · {source.quoteSha256.slice(0,12)}…
                    </p>
                  ):null}
                </div>
              ))}
            </div>
            {row.potentialPublishedCitationImpact?(
              <p className="mt-3 text-xs font-semibold text-amber-800">
                A simulated published version cites the previous quotation.
              </p>
            ):null}
            <div className="mt-4 flex flex-wrap gap-2"
              role="group" aria-label="Local review intentions">
              {intents.map(option=>(
                <button key={option.id} type="button"
                  disabled={
                    (option.id==='inspect_updated_source'&&!row.current)||
                    (option.id==='retain_existing_pending_verification'&&!row.prior)
                  }
                  onClick={()=>setChoices(previous=>({
                    ...previous,[row.changeId]:option.id,
                  }))}
                  aria-pressed={choices[row.changeId]===option.id}
                  className={
                    'rounded-lg border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 '+
                    (choices[row.changeId]===option.id
                      ? 'border-slate-700 bg-slate-800 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50')
                  }>
                  {option.label}
                </button>
              ))}
            </div>
            {choices[row.changeId]?(
              <button type="button" className="mt-2 text-xs text-slate-500 underline"
                onClick={()=>setChoices(previous=>{
                  const next={...previous};delete next[row.changeId];return next;
                })}>
                Clear this choice
              </button>
            ):null}
          </article>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold">Existing approval route is not connected</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Future approved work must use the existing tenant-scoped
          knowledge-document creation, approval and archive lifecycle.
          This preview never invokes those server actions.
        </p>
        <button type="button" className="mt-3 cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-500"
          disabled aria-label="Submit for knowledge approval (disabled)">
          Submit for knowledge approval
        </button>
        <button type="button" onClick={()=>setExpanded(value=>!value)}
          aria-expanded={expanded}
          className="ml-3 mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
          {expanded?'Hide blocked gates':'View 7 blocked release gates'}
        </button>
        {expanded?(
          <ul className="mt-4 space-y-2" aria-label="Blocked release gates">
            {plan.missingReleaseGates.map(gate=>(
              <li key={gate.id} className="flex items-center justify-between gap-3 text-xs">
                <span>{gate.id.replaceAll('_',' ')}</span>
                <span className="font-semibold text-amber-800">Blocked</span>
              </li>
            ))}
          </ul>
        ):null}
      </div>
    </section>
  );
}
