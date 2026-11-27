import { PageFeedback } from '@/components/page-feedback';
import Link from 'next/link';

import { importChatExportAction, reviewConversationInsightAction, runConversationLearningAction } from '@/app/settings/ai-learning/actions';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

type Run = {
  id: string; created_at: string; source: string; source_label: string | null; conversations_analyzed: number; messages_analyzed: number;
  outbound_messages: number; conversations_with_team_reply: number; won_conversations: number; enough_for_outcome_learning: boolean;
};
type Insight = {
  id: string; kind: string; insight_key: string; label: string; conversations: number; share: number;
  detail: string; examples: string[] | null; review_status: 'pending' | 'approved' | 'rejected';
};

const SECTIONS: Array<{ kind: string; title: string; hint: string }> = [
  { kind: 'stall_point', title: 'Where leads go quiet', hint: 'The last thing a lead said before the conversation stopped.' },
  { kind: 'question', title: 'What leads ask', hint: 'Answer these well and early: they are most of the inbox.' },
  { kind: 'objection', title: 'What holds them back', hint: 'Objections the AI should handle or hand to a person.' },
  { kind: 'offer_request', title: 'Offers leads ask for', hint: 'Requests only. Which offers exist, and when to give them, is your decision.' },
  { kind: 'buying_signal', title: 'Buying signals', hint: 'Moments to move fast: reply, book, or send the payment link.' },
  { kind: 'timing', title: 'When leads write', hint: 'Use to schedule follow-ups and staff cover.' },
  { kind: 'outcome_driver', title: 'What converts', hint: 'Only shown once there are enough enrolments with team replies.' },
];

function pct(share: number) {
  return `${Math.round(Number(share) * 100)}%`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

function StatusChip({ status }: { status: Insight['review_status'] }) {
  const tone = status === 'approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : status === 'rejected' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-amber-50 text-amber-800 ring-amber-200';
  const label = status === 'approved' ? 'AI uses this' : status === 'rejected' ? 'Ignored' : 'Needs review';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone}`}>{label}</span>;
}

function ReviewButtons({ insight }: { insight: Insight }) {
  return (
    <form action={reviewConversationInsightAction} className="flex gap-1.5">
      <input type="hidden" name="insight_id" value={insight.id} />
      {insight.review_status !== 'approved' ? <button name="decision" value="approved" className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button> : null}
      {insight.review_status !== 'rejected' ? <button name="decision" value="rejected" className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-copy hover:bg-surface-soft">Ignore</button> : null}
      {insight.review_status !== 'pending' ? <button name="decision" value="pending" className="rounded-lg px-2 py-1 text-xs font-semibold text-copy-muted hover:text-copy">Undo</button> : null}
    </form>
  );
}

export default async function AiLearningPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; source?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="p-6 text-sm text-copy-muted">Sign in to view AI learning.</main>;
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const [{ data: canManage }, { data: runRows, error: runError }] = await Promise.all([
    supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
    supabase.from('conversation_learning_runs').select('id, created_at, source, source_label, conversations_analyzed, messages_analyzed, outbound_messages, conversations_with_team_reply, won_conversations, enough_for_outcome_learning').eq('organization_id', organizationId).eq('status', 'completed').order('created_at', { ascending: false }).limit(20),
  ]);
  // Latest completed run of each source.
  const latestBySource = new Map<string, Run>();
  for (const row of (runRows ?? []) as Run[]) if (!latestBySource.has(row.source)) latestBySource.set(row.source, row);
  const sources = [...latestBySource.values()];
  const sourceParam = query.source;
  const run = sources.find((r) => r.source === sourceParam) ?? sources[0] ?? null;
  let insights: Insight[] = [];
  if (run) {
    const { data } = await supabase.from('conversation_learning_insights').select('id, kind, insight_key, label, conversations, share, detail, examples, review_status').eq('run_id', run.id).order('conversations', { ascending: false });
    insights = (data ?? []) as Insight[];
  }
  const SOURCE_NAMES: Record<string, string> = { crm_messages: 'SalsysOS inbox', whatsapp_export: 'WhatsApp export', instagram_export: 'Instagram export' };
  const gaps = insights.filter((i) => i.kind === 'data_gap');
  const approved = insights.filter((i) => i.review_status === 'approved' && i.kind !== 'data_gap').length;
  const pending = insights.filter((i) => i.review_status === 'pending').length;

  return (<><PageFeedback error={query.error} notice={query.notice} />{(
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
      <Link href="/settings" className="text-xs text-copy-muted hover:text-copy">Back to settings</Link>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-copy">AI learning from your conversations</h1>
          <p className="mt-1 max-w-2xl text-sm text-copy-muted">SalsysOS reads your own past conversations, finds what leads ask, where they stop and what holds them back. You approve what the AI may use. Nothing is shared outside your organization, and nothing is sent to leads from here.</p>
        </div>
        {canManage === true ? (
          <form action={runConversationLearningAction}>
            <button className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">{run ? 'Learn again' : 'Learn from conversations'}</button>
          </form>
        ) : null}
      </header>

      {query.notice ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{query.notice}</div> : null}
      {query.error || runError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{query.error || 'AI learning is temporarily unavailable.'}</div> : null}

      {canManage === true ? (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-copy">Learn from a chat export</h2>
          <p className="mt-0.5 text-xs text-copy-muted">Upload the WhatsApp Business “AI information report” (.zip). Chats are read once to learn patterns, then discarded; only the insights are saved. Test chats are skipped.</p>
          <form action={importChatExportAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input type="file" name="export" accept=".zip,.txt" required className="text-sm text-copy" />
            <button className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-copy hover:bg-surface-soft">Upload and learn</button>
          </form>
        </section>
      ) : null}

      {sources.length > 1 ? (
        <nav aria-label="Learning source" className="flex flex-wrap gap-2">
          {sources.map((s) => (
            <Link key={s.id} href={`/settings/ai-learning?source=${s.source}`} aria-current={s.id === run?.id ? 'page' : undefined}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${s.id === run?.id ? 'bg-brand-600 text-white' : 'border border-line text-copy hover:bg-surface-soft'}`}>
              {SOURCE_NAMES[s.source] ?? s.source}
            </Link>
          ))}
        </nav>
      ) : null}
      {run?.source_label ? <p className="text-xs text-copy-muted">Showing: {run.source_label}</p> : null}

      {!run ? (
        <section className="rounded-2xl border border-line bg-surface p-6 text-sm text-copy-muted">No learning run yet. {canManage === true ? 'Press “Learn from conversations” to analyse the last 180 days.' : 'Ask an admin to run it.'}</section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            {[
              ['Conversations', run.conversations_analyzed.toLocaleString('en-IN'), `Learned ${dateTime(run.created_at)}`],
              ['Team replies stored', run.conversations_with_team_reply.toLocaleString('en-IN'), `${run.outbound_messages.toLocaleString('en-IN')} outbound messages`],
              ['Enrolments linked', run.won_conversations.toLocaleString('en-IN'), run.enough_for_outcome_learning ? 'Enough to learn what converts' : 'Too few to learn what converts'],
              ['Approved for AI', String(approved), `${pending} waiting for review`],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-xl border border-line bg-surface p-4">
                <p className="text-xs font-medium text-copy-muted">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-copy">{value}</p>
                <p className="mt-1 text-xs text-copy-muted">{note}</p>
              </div>
            ))}
          </section>

          {gaps.length ? (
            <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-900">What the AI can’t learn yet</h2>
              {gaps.map((gap) => <p key={gap.id} className="text-sm leading-6 text-amber-900"><strong>{gap.label}.</strong> {gap.detail}</p>)}
            </section>
          ) : null}

          {SECTIONS.map((section) => {
            const rows = insights.filter((i) => i.kind === section.kind);
            if (!rows.length) return null;
            return (
              <section key={section.kind} className="rounded-2xl border border-line bg-surface p-4">
                <h2 className="text-base font-semibold text-copy">{section.title}</h2>
                <p className="mt-0.5 text-xs text-copy-muted">{section.hint}</p>
                <ul className="mt-3 divide-y divide-line">
                  {rows.map((insight) => (
                    <li key={insight.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-copy">{insight.label}</span>
                          <span className="text-xs font-semibold tabular-nums text-copy-muted">{insight.conversations.toLocaleString('en-IN')} · {pct(insight.share)}</span>
                          <StatusChip status={insight.review_status} />
                        </div>
                        <div className="mt-2 h-1.5 w-full max-w-sm rounded-full bg-surface-soft"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${Math.max(2, Math.round(Number(insight.share) * 100))}%` }} /></div>
                        <p className="mt-1.5 text-xs text-copy-muted">{insight.detail}</p>
                        {insight.examples?.length ? <p className="mt-1 text-xs italic text-copy-muted">e.g. “{insight.examples.join('” · “')}”</p> : null}
                      </div>
                      {canManage === true ? <ReviewButtons insight={insight} /> : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </main>
  )}</>);
}
