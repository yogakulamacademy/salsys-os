import { CheckCircle2, Lightbulb, MessageSquareQuote, Sparkles, XCircle } from 'lucide-react';

import { decideKnowledgeProposalAction, findKnowledgeSuggestionsAction } from '@/app/settings/knowledge/proposal-actions';
import { hasPlaceholders, KIND_LABELS } from '@/lib/knowledge-proposals';

export type KnowledgeSuggestion = {
  id: string;
  kind: 'add' | 'update' | 'retire';
  title: string;
  category: string;
  proposed_content: string | null;
  current_excerpt: string | null;
  why: string;
  expected_effect: string;
  risk: string | null;
  evidence: Array<{ quote?: string }> | null;
  source: string;
  created_at: string;
};

const SOURCE_LABELS: Record<string, string> = {
  unanswered_questions: 'From questions leads asked',
  owner_replies: 'From your team’s replies',
  shadow_edits: 'From your edits to AI drafts',
  other: 'AI suggestion',
};

/** Settings → AI Knowledge → Suggested updates. Server component; every change needs an admin click. */
export function KnowledgeSuggestions({ suggestions, canManage, decidedThisMonth }: {
  suggestions: KnowledgeSuggestion[];
  canManage: boolean;
  decidedThisMonth: { approved: number; rejected: number };
}) {
  return (
    <section className="kn-panel kn-suggestions" id="suggested-updates" aria-labelledby="kn-suggestions-heading">
      <div className="kn-heading">
        <span className="kn-heading-icon"><Lightbulb size={21}/></span>
        <div>
          <h2 id="kn-suggestions-heading">Suggested updates {suggestions.length ? <span className="kn-count">{suggestions.length}</span> : null}</h2>
          <p>The AI reads what leads keep asking and suggests knowledge to add or fix. Nothing changes until you approve it.</p>
        </div>
        {canManage ? <form action={findKnowledgeSuggestionsAction} className="kn-suggestions-run">
          <button type="submit" className="kn-secondary kn-small"><Sparkles size={14}/> Find suggestions now</button>
        </form> : null}
      </div>

      {suggestions.length === 0 ? (
        <p className="kn-suggestions-empty">
          No suggestions waiting. New ones arrive every Monday morning.
          {decidedThisMonth.approved + decidedThisMonth.rejected > 0
            ? ` This month: ${decidedThisMonth.approved} approved, ${decidedThisMonth.rejected} rejected.` : ''}
        </p>
      ) : suggestions.map((s) => {
        const gaps = hasPlaceholders(s.proposed_content);
        const quotes = (s.evidence ?? []).map((e) => e.quote).filter(Boolean).slice(0, 5) as string[];
        return (
          <article key={s.id} className="kn-suggestion" data-kind={s.kind}>
            <div className="kn-suggestion-top">
              <span className="kn-suggestion-kind" data-kind={s.kind}>{KIND_LABELS[s.kind] ?? s.kind}</span>
              <h3>{s.title}</h3>
              <span className="kn-suggestion-source">{SOURCE_LABELS[s.source] ?? SOURCE_LABELS.other}</span>
            </div>

            <dl className="kn-suggestion-why">
              <div><dt>Why</dt><dd>{s.why}</dd></div>
              <div><dt>Expected effect</dt><dd>{s.expected_effect}</dd></div>
              {s.risk ? <div className="kn-suggestion-risk"><dt>Risk</dt><dd>{s.risk}</dd></div> : null}
            </dl>

            {quotes.length ? <details className="kn-suggestion-evidence">
              <summary><MessageSquareQuote size={14}/> What leads asked ({quotes.length} examples)</summary>
              <ul>{quotes.map((q, i) => <li key={i}>“{q}”</li>)}</ul>
            </details> : null}

            {s.kind === 'update' && s.current_excerpt ? <div className="kn-suggestion-current">
              <span>Current text</span><p>{s.current_excerpt}</p>
            </div> : null}

            {canManage ? <form action={decideKnowledgeProposalAction} className="kn-suggestion-form">
              <input type="hidden" name="proposal_id" value={s.id}/>
              {s.kind !== 'retire' ? <label className="kn-field">
                <span>{s.kind === 'update' ? 'New text' : 'Proposed text'} <small>Edit before approving</small></span>
                <textarea name="content" rows={6} defaultValue={s.proposed_content ?? ''} minLength={10} maxLength={8000}/>
                {gaps ? <small className="kn-suggestion-gap">Replace every [ADD: …] with the real answer before approving. The AI did not have these facts.</small> : null}
              </label> : <p className="kn-suggestion-retire">Approving archives the current item so AI drafts stop using it.</p>}
              <label className="kn-field"><span>Note <small>Optional</small></span>
                <input name="note" maxLength={600} placeholder="e.g. Plan changed in December"/>
              </label>
              <div className="kn-create-actions">
                <button type="submit" name="decision" value="reject" className="kn-secondary kn-small"><XCircle size={14}/> Reject</button>
                <button type="submit" name="decision" value="approve" className="kn-primary kn-small"><CheckCircle2 size={14}/> Approve</button>
              </div>
            </form> : <p className="kn-readonly">Only organization admins can approve suggestions.</p>}
          </article>
        );
      })}
    </section>
  );
}
