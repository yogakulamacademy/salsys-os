'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowLeft, Check, CircleHelp, RotateCcw, ShieldAlert, ShieldCheck, X,
} from 'lucide-react';
import type { PreparedWebsiteEvidence } from '@/lib/knowledge-extraction/website-evidence';
import type { SourceDraftBundle } from '@/lib/knowledge-extraction/source-grounded-drafts';
import type { ReviewSignalReport } from '@/lib/knowledge-extraction/source-review-signals';
import type { ValidatedAIResponse } from '@/lib/knowledge-extraction/ai-draft-contract';
import type { GroundingEvaluationReport } from '@/lib/knowledge-extraction/ai-grounding-evaluation';
import type { KnowledgeReviewAcceptancePacket } from '@/lib/knowledge-extraction/knowledge-review-acceptance';
import type { WebsiteSnapshotDeltaReport } from '@/lib/knowledge-extraction/website-snapshot-delta';
import { assessEvidenceReadiness } from '@/lib/knowledge-extraction/evidence-lifecycle-readiness';
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
  evidence, sourceCandidates, reviewSignals, simulatedAIProposals, groundingReview, acceptancePacket, snapshotDelta,
}: {
  evidence: PreparedWebsiteEvidence;
  sourceCandidates: SourceDraftBundle;
  reviewSignals: ReviewSignalReport;
  simulatedAIProposals: ValidatedAIResponse;
  groundingReview: GroundingEvaluationReport;
  acceptancePacket: KnowledgeReviewAcceptancePacket;
  snapshotDelta: WebsiteSnapshotDeltaReport;
}) {
  const [choices, setChoices] = useState<EvidenceReviewDecisions>({});
  const [filter, setFilter] = useState<Filter>('all');
  // There is intentionally no live policy input or storage endpoint in this preview.
  const lifecycle = assessEvidenceReadiness(null);
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

      <section aria-label="Source-backed draft candidates" className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Source-backed draft candidates</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
              Exact quotations and adjacent FAQ pairs, without paraphrasing or AI generation.
              Every item needs human verification; none is an approved answer.
            </p>
          </div>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
            {sourceCandidates.drafts.length} unreviewed
          </span>
        </div>
        {sourceCandidates.drafts.length===0 ? (
          <p className="mt-4 text-sm text-slate-500">No source-backed candidates are available.</p>
        ) : (
          <ol className="mt-5 space-y-3">
            {sourceCandidates.drafts.map(draft=>{
              const citations=draft.kind==='faq_pair'
                ? [draft.questionCitation,draft.answerCitation]
                : [draft.citation];
              return (
                <li key={draft.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-600">
                      {draft.kind==='faq_pair'?'FAQ pair':'Source statement'}
                    </p>
                    <span className="text-xs font-medium text-amber-700">
                      Human review required
                    </span>
                  </div>
                  {draft.kind==='faq_pair' ? (
                    <div className="mt-3 space-y-2">
                      <p className="break-words text-sm font-semibold">{draft.question}</p>
                      <blockquote className="break-words border-l-2 border-slate-300 pl-3 text-sm leading-6">
                        {draft.answer}
                      </blockquote>
                    </div>
                  ) : (
                    <blockquote className="mt-3 break-words border-l-2 border-slate-300 pl-3 text-sm leading-6">
                      {draft.statement}
                    </blockquote>
                  )}
                  <p className="mt-3 break-all font-mono text-[11px] leading-5 text-slate-500">
                    Source block{citations.length>1?'s':''} {citations.map(c=>c.sourceBlockIndex+1).join(', ')}
                    {' · '}Quote hash{citations.length>1?'es':''} {citations.map(c=>c.quoteSha256.slice(0,12)).join(' / ')}…
                  </p>
                  {draft.risks.length>0 ? (
                    <p className="mt-2 text-xs text-amber-800">
                      Check carefully: {draft.risks.map(x=>x.replaceAll('_',' ')).join(', ')}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {sourceCandidates.issues.length>0 ? (
          <p className="mt-4 text-xs text-slate-600">
            {sourceCandidates.issues.length} source fragment(s) could not be paired or were too long.
            No missing answers were invented.
          </p>
        ) : null}
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
          No AI-generated content, storage, approval, or publishing is enabled by this preview.
        </p>
      </section>

      <section aria-label="Source difference review"
        className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Potential source differences</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
              Compared only within explicitly matched fields and offer scope.
              The differences below are review reminders, not confirmed contradictions.
            </p>
          </div>
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
            {reviewSignals.signals.length} check{reviewSignals.signals.length===1?'':'s'} needed
          </span>
        </div>
        {reviewSignals.signals.length===0 ? (
          <p className="mt-4 text-sm text-slate-500">No comparable source differences were detected.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {reviewSignals.signals.map(signal=>(
              <li key={signal.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">
                    {signal.kind==='price_difference_review'?'Price variation to review':
                      signal.kind==='date_difference_review'?'Date variation to review':
                      signal.kind==='policy_text_variation_review'?'Policy wording to review':
                      'Source age to review'}
                  </p>
                  <span className="text-xs text-amber-700">Not verified</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{signal.message}</p>
                {signal.scopeKey?(
                  <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                    Comparison scope: {signal.scopeKey} · {signal.fieldKey}
                    {signal.comparisonCurrency?' · '+signal.comparisonCurrency:''}
                  </p>
                ):null}
                <div className="mt-3 space-y-2">
                  {signal.sources.map((source,index)=>(
                    <div key={source.snapshotSha256+(source.blockId??index)}
                      className="rounded-md bg-slate-50 p-3">
                      {source.exactQuote ? (
                        <blockquote className="break-words text-sm leading-6 text-slate-800">
                          {source.exactQuote}
                        </blockquote>
                      ):null}
                      <p className="mt-2 break-all text-xs text-slate-500">{source.sourceUrl}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                        Retrieved: {source.fetchedAt} · Quote SHA: {source.quoteSha256?.slice(0,12)??'—'}
                      </p>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
        {reviewSignals.issues.length>0 ? (
          <p className="mt-3 text-xs leading-5 text-slate-600">
            {reviewSignals.issues.length} comparison(s) were left unresolved because
            the values or currencies were not safely comparable.
          </p>
        ):null}
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
          Synthetic example only. Neither source has been verified as the current truth.
          No AI generation, automatic approval, storage, or publication is enabled.
        </p>
      </section>

      <section aria-label="Synthetic AI proposal review"
        className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">AI drafting contract preview</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
              Simulated model output only — no AI service was contacted.
              Answers are verbatim source quotations. Generated questions still
              require a person to check accuracy and meaning.
            </p>
          </div>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
            {simulatedAIProposals.proposals.length} simulated proposals
          </span>
        </div>
        {simulatedAIProposals.proposals.length===0 ? (
          <p className="mt-4 text-sm text-slate-500">No simulated proposals were accepted.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {simulatedAIProposals.proposals.map(proposal=>(
              <li key={proposal.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">
                    {proposal.kind==='faq'?'FAQ suggestion':'Verbatim fact suggestion'}
                  </p>
                  <span className="text-xs font-semibold text-amber-800">
                    Not approved
                  </span>
                </div>
                {proposal.question ? (
                  <p className="mt-3 break-words text-sm font-semibold">
                    {proposal.question}
                  </p>
                ):null}
                <blockquote className="mt-2 break-words border-l-2 border-slate-300 pl-3 text-sm leading-6">
                  {proposal.answerOrStatement}
                </blockquote>
                <p className="mt-2 break-all text-xs text-slate-500">
                  Citation: {proposal.answerCitation.sourceUrl}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                  Source block {proposal.answerCitation.sourceBlockIndex+1}
                  {' · '}SHA-256 {proposal.answerCitation.quoteSha256.slice(0,16)}…
                </p>
                {proposal.modelGeneratedQuestion ? (
                  <p className="mt-2 text-xs text-amber-800">
                    Question wording was simulated; semantic grounding was not verified.
                  </p>
                ):null}
                {proposal.riskReminders.length>0 ? (
                  <p className="mt-2 text-xs text-amber-800">
                    Review: {proposal.riskReminders.map(r=>r.replaceAll('_',' ')).join(', ')}
                  </p>
                ):null}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">
          This validator only enforces schema, citation identity and exact source
          wording. It cannot establish whether a source is accurate, current or
          contextually sufficient. Nothing can be stored, approved or published.
        </p>
      </section>

      <section aria-label="AI grounding quality review"
        className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Grounding and accuracy review</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
              A deterministic review checklist, not semantic verification.
              Every simulated AI suggestion requires human confirmation
              before it can be considered reliable.
            </p>
          </div>
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
            {groundingReview.held} held for resolution
          </span>
        </div>
        {groundingReview.items.length===0 ? (
          <p className="mt-4 text-sm text-slate-500">No simulated AI suggestions to assess.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {groundingReview.items.map(item=>{
              const matched=simulatedAIProposals.proposals.find(x=>x.id===item.proposalId);
              return (
                <div key={item.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700">
                      {item.disposition==='hold_for_resolution'
                        ? 'Hold — source issue requires resolution'
                        : 'Human verification required'}
                    </p>
                    <span className="text-xs font-semibold text-slate-500">
                      Not approved
                    </span>
                  </div>
                  {matched?.question ? (
                    <p className="mt-3 text-sm font-medium">{matched.question}</p>
                  ):null}
                  <p className="mt-2 break-words text-sm leading-6 text-slate-700">
                    {matched?.answerOrStatement ?? 'Citation unavailable'}
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                    Evidence SHA-256: {item.evidenceQuoteSha256.slice(0,16)}…
                  </p>
                  {item.reasons.length>0 ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
                      {item.reasons.map(reason=>(
                        <li key={reason}>
                          {reason.replaceAll('_',' ')}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-600">
                      No deterministic warning found. Semantic correctness is still unverified.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">
          Source truth and question meaning remain unverified. The checklist does not
          grant approval, persistence, or publishing authority.
        </p>
      </section>

      <section aria-label="End-to-end review acceptance"
        className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Review acceptance checkpoint</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
              Synthetic end-to-end validation is complete for this sample.
              It does not establish real source accuracy or grant permission to
              create or approve knowledge.
            </p>
          </div>
          <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
            Preview only
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Proposals</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{acceptancePacket.counts.proposals}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">On hold</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{acceptancePacket.counts.held}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Need human review</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{acceptancePacket.counts.needsHumanReview}</p>
          </div>
        </div>
        <p className="mt-4 break-all font-mono text-[11px] text-slate-500">
          Acceptance packet SHA-256: {acceptancePacket.packetId.slice(0,20)}…
        </p>
        <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
            Review 7 release requirements still blocked
          </summary>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
            <li>Authorized real-source ownership and browser visibility</li>
            <li>Tenant consent, retention, and deletion approval</li>
            <li>Independent source-conflict coverage</li>
            <li>Human semantic accuracy review</li>
            <li>Authenticated reviewer identity and audit records</li>
            <li>Isolated staging, database policies, and rollback acceptance</li>
            <li>Explicit approval to merge and deploy</li>
          </ul>
        </details>
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-700">Existing knowledge approval pathway</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Not connected. Reviewed evidence is not sent to the existing create
            or approval actions. A separate tenant-authorized, audited handoff
            must be implemented and validated before any real content is saved.
          </p>
          <p className="mt-2 text-xs font-semibold text-amber-800">
            Storage, approval, and publishing remain disabled.
          </p>
        </div>
      </section>

      <section aria-label="Website snapshot changes"
        className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Website snapshot changes</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
              Two simulated versions of the same page. Differences are source
              text observations only, not confirmed live updates.
            </p>
          </div>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
            Human verification required
          </span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
          {([
            ['Modified',snapshotDelta.counts.modified],
            ['Added',snapshotDelta.counts.added],
            ['Removed',snapshotDelta.counts.removed],
            ['Unchanged',snapshotDelta.counts.unchanged],
          ] as const).map(([label,value])=>(
            <div key={label} className="min-w-0 rounded-lg bg-slate-50 p-2.5 sm:p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 break-all font-mono text-[11px] text-slate-500">
          Exact page scope: {snapshotDelta.sourceUrl}
        </p>
        {snapshotDelta.changes.length===0 ? (
          <p className="mt-4 text-xs text-slate-600">
            No quotation changes detected. This does not prove the website is up to date.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {snapshotDelta.changes.map(delta=>(
              <li key={delta.id} className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-700">
                  {delta.kind==='modified'?'Modified source quotation':
                    delta.kind==='added'?'Added source quotation':
                    'Removed source quotation'}
                </p>
                {delta.prior ? (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500">Earlier source quote</p>
                    <blockquote className="mt-1 break-words border-l-2 border-slate-300 pl-3 text-sm">
                      {delta.prior.exactQuote}
                    </blockquote>
                    <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                      {delta.prior.fetchedAt} · SHA {delta.prior.quoteSha256.slice(0,12)}…
                    </p>
                  </div>
                ):null}
                {delta.current ? (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500">Later source quote</p>
                    <blockquote className="mt-1 break-words border-l-2 border-slate-300 pl-3 text-sm">
                      {delta.current.exactQuote}
                    </blockquote>
                    <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                      {delta.current.fetchedAt} · SHA {delta.current.quoteSha256.slice(0,12)}…
                    </p>
                  </div>
                ):null}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">
          Source authenticity, browser visibility, and real website changes have not
          been verified. No recrawl, database update, knowledge approval,
          or automatic synchronization is enabled.
        </p>
      </section>

      <section aria-label="Evidence lifecycle readiness" className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800">Consent and retention readiness</h2>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          This synthetic preview does not load any organization's consent or retention
          configuration. No storage controls have been verified here.
          Evidence writes remain disabled regardless of the review choices above.
        </p>
        <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
            Review {lifecycle.total} required storage safeguards
          </summary>
          <ul className="mt-3 space-y-3">
            {lifecycle.gates.map(gate=>(
              <li key={gate.id} className="text-xs leading-5 text-slate-600">
                <p className="font-semibold text-slate-800">{gate.label} — not verified</p>
                <p>{gate.description}</p>
              </li>
            ))}
          </ul>
        </details>
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
