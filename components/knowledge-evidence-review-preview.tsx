'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowLeft, Check, CircleHelp, RotateCcw, ShieldAlert, ShieldCheck, X,
} from 'lucide-react';
import type { PreparedWebsiteEvidence } from '@/lib/knowledge-extraction/website-evidence';
import {
  chooseEvidenceForReview,
  reviewChoicesForDisplay,
  summarizeEvidenceReview,
  type EvidenceReviewChoice,
  type EvidenceReviewDecisions,
} from '@/lib/knowledge-extraction/evidence-review-plan';

type Filter = 'all' | 'pending' | 'candidate' | 'excluded';
const filters: Array<{ id: Filter; label: string }> = [
  { id:'all', label:'All evidence' },
  { id:'pending', label:'Pending' },
  { id:'candidate', label:'For later review' },
  { id:'excluded', label:'Excluded' },
];

export function KnowledgeEvidenceReviewPreview({
  evidence,
}: {
  evidence: PreparedWebsiteEvidence;
}) {
  const [choices, setChoices] = useState<EvidenceReviewDecisions>({});
  const [filter, setFilter] = useState<Filter>('all');
  const summary = useMemo(() => summarizeEvidenceReview(evidence, choices),
    [evidence, choices]);
  const rows = useMemo(() => reviewChoicesForDisplay(evidence, choices).filter(row =>
    filter === 'all' || (filter === 'pending' && row.choice === null)
      || row.choice === filter),
    [evidence, choices, filter]);

  function decide(blockId: string, decision: EvidenceReviewChoice | null) {
    setChoices(current => chooseEvidenceForReview(evidence, current, blockId, decision));
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-7 text-slate-800 sm:px-8"
      aria-label="Website evidence review preview">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings/knowledge" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
            <ArrowLeft size={13} aria-hidden="true"/> Organization Knowledge
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Evidence review</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Inspect precise website quotations and identify what deserves human review.
          </p>
        </div>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          Synthetic preview
        </span>
      </div>

      <section aria-label="Preview restrictions" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <ShieldAlert className="mt-0.5 shrink-0 text-amber-700" size={18} aria-hidden="true"/>
        <div>
          <p className="text-sm font-semibold text-amber-900">Preview only — no evidence is saved</p>
          <p className="mt-1 text-xs leading-5 text-amber-900">
            This screen uses an invented local example. Marking text for later review is not
            approval. Decisions reset when you leave or reload this page. No customer
            website is accessed, and nothing is sent to the AI knowledge library.
          </p>
        </div>
      </section>

      <section aria-label="Source record" className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 lg:grid-cols-[minmax(0,1fr)_minmax(230px,0.7fr)]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Example source</p>
          <h2 className="mt-2 text-lg font-semibold">{evidence.pageTitle || 'Untitled page'}</h2>
          <p className="mt-1 break-all text-xs text-slate-500">{evidence.sourceUrl}</p>
          <p className="mt-3 text-xs text-slate-600">
            Retrieved <time dateTime={evidence.fetchedAt}>{evidence.fetchedAt.replace('T',' ').replace('.000Z',' UTC')}</time>
          </p>
        </div>
        <div className="space-y-2 border-t border-slate-100 pt-4 text-xs lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <p className="font-semibold text-slate-700">Evidence safeguards</p>
          <p className="flex items-center gap-2 text-slate-600"><ShieldCheck size={14} aria-hidden="true"/> Exact quotation with source position</p>
          <p className="flex items-center gap-2 text-slate-600"><CircleHelp size={14} aria-hidden="true"/> Visibility and accuracy still need verification</p>
          <p className="break-all text-slate-500">Snapshot SHA-256: <code>{evidence.snapshotSha256.slice(0,16)}…</code></p>
        </div>
      </section>

      <section aria-label="Evidence review counts" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ['Evidence blocks',summary.total],
          ['Pending',summary.pending],
          ['For later review',summary.candidate],
          ['Excluded',summary.excluded],
        ] as const).map(([label,value])=>(
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section aria-label="Evidence entries" className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold">Source quotations</h2>
            <p className="mt-1 text-xs text-slate-500">Review planning only. All evidence is unreviewed.</p>
          </div>
          <button type="button" onClick={()=>{setChoices({});setFilter('all');}}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">
            <RotateCcw size={14} aria-hidden="true"/> Reset preview
          </button>
        </div>
        <div role="group" aria-label="Filter evidence" className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          {filters.map(item => (
            <button key={item.id} type="button" onClick={()=>setFilter(item.id)}
              aria-pressed={filter===item.id}
              className={'rounded-lg px-3 py-2 text-xs font-semibold transition-colors '+
                (filter===item.id?'bg-slate-800 text-white':'bg-slate-50 text-slate-600 hover:bg-slate-100')}>
              {item.label}
            </button>
          ))}
        </div>

        {rows.length===0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            There is no evidence in this filter.
          </p>
        ):(
          <div className="divide-y divide-slate-100">
            {rows.map(({block,choice})=>(
              <article className="space-y-3 p-4 sm:p-5" key={block.id}
                aria-label={'Source quotation '+(block.sourceBlockIndex+1)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-600">
                    {block.headingPath.length?block.headingPath.join(' / '):'Page overview'}
                  </p>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {choice==='candidate'?'For later review':choice==='excluded'?'Excluded':'Unreviewed'}
                  </span>
                </div>
                <blockquote className="border-l-2 border-slate-300 pl-3 text-sm leading-6 text-slate-800">
                  {block.quote}
                </blockquote>
                <p className="break-all font-mono text-[11px] text-slate-500">
                  Source block {block.sourceBlockIndex+1} · {block.blockKind.replaceAll('_',' ')} ·
                  Quote hash {block.quoteSha256.slice(0,12)}…
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={()=>decide(block.id,'candidate')}
                    aria-pressed={choice==='candidate'}
                    className={'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold '+
                      (choice==='candidate'?'border-emerald-300 bg-emerald-50 text-emerald-900':
                        'border-slate-200 text-slate-700 hover:bg-slate-50')}>
                    <Check size={13} aria-hidden="true"/> For later review
                  </button>
                  <button type="button" onClick={()=>decide(block.id,'excluded')}
                    aria-pressed={choice==='excluded'}
                    className={'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold '+
                      (choice==='excluded'?'border-rose-300 bg-rose-50 text-rose-900':
                        'border-slate-200 text-slate-700 hover:bg-slate-50')}>
                    <X size={13} aria-hidden="true"/> Exclude
                  </button>
                  {choice!==null?(
                    <button type="button" onClick={()=>decide(block.id,null)}
                      className="rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-50">
                      Undo
                    </button>
                  ):null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm font-semibold text-slate-800">Publishing remains disabled</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Storage consent, tenant retention, deletion and authenticated write
          contracts have not been approved. The preview cannot create, approve, or
          synchronize AI knowledge.
        </p>
        <button type="button" disabled title="Storage consent and approval gates are not implemented"
          className="mt-4 cursor-not-allowed rounded-lg bg-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-600"
          aria-label="Publish knowledge (disabled)">
          Publish knowledge
        </button>
      </div>
    </main>
  );
}
