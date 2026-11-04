'use client';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { previewKnowledgeAction, type KnowledgePreviewResult } from '@/app/settings/knowledge/actions';
import { createLatestReadGuard } from '@/lib/latest-read';

export function KnowledgeRetrievalPreview({ enabled }: { enabled: boolean }) {
  const [result, setResult] = useState<KnowledgePreviewResult>({ state: 'idle', message: '' });
  const [pending, startTransition] = useTransition();
  const guard = useRef(createLatestReadGuard());
  useEffect(() => () => guard.current.invalidate(), []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const request = guard.current.start();
    startTransition(async () => {
      try { const next = await previewKnowledgeAction(data); if (request.isCurrent()) setResult(next); }
      catch { if (request.isCurrent()) setResult({ state: 'error', message: 'Preview could not be loaded. Retry before relying on this result.' }); }
    });
  }
  return <section aria-label="Test approved knowledge" className="card-pad">
    <h2 className="text-base font-semibold text-copy-strong">Test your knowledge</h2>
    <p className="mt-1 text-sm leading-6 text-copy-muted">Ask a customer question and verify which approved, currently eligible records match. This is retrieval testing, not an AI-generated reply.</p>
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
      <label className="min-w-0 flex-1"><span className="field-label">Customer question</span><input className="input w-full" name="query" required maxLength={500} disabled={!enabled} placeholder="For example: How do I request a transfer?" onChange={() => { guard.current.invalidate(); setResult({ state: 'idle', message: '' }); }} /></label>
      <button className="btn-secondary self-start sm:self-end" type="submit" disabled={!enabled || pending}>{pending ? 'Checking…' : 'Check approved knowledge'}</button>
    </form>
    {!enabled ? <p className="mt-3 text-xs text-copy-muted">A configured live workspace and organization admin access are required.</p> : null}
    <div role="status" aria-live="polite" className="mt-3 text-sm text-copy-muted">{result.message}</div>
    {result.matches?.length ? <ol className="mt-4 space-y-3">{result.matches.map((match, index) => <li key={`${match.documentId}:${index}`} className="rounded-lg border border-line p-3">
      <h3 className="text-sm font-medium text-copy-strong">{match.title}</h3>
      <p className="mt-1 text-xs text-copy-muted">{match.version === null ? 'Version unavailable' : `Version ${match.version}`}{match.validUntil ? ` · Valid until ${new Date(match.validUntil).toISOString()}` : ' · No expiry recorded'}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-copy">{match.excerpt}</p>
    </li>)}</ol> : null}
  </section>;
}
