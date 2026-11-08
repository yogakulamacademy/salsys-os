'use client';

import { useActionState, useState } from 'react';
import {
  previewPastedHtmlForManualReviewAction,
  type ManuallyPastedHtmlPreviewState,
} from '@/app/settings/knowledge/discovery/preview-action';

const INITIAL_PREVIEW: ManuallyPastedHtmlPreviewState = {
  state: 'idle',
  message: 'Paste HTML copied from the original website to inspect provisional text.',
  sourcePageId: null,
  sourceUrl: null,
  pastedHtmlSha256: null,
  excerpts: [],
  warnings: [],
};

/**
 * Operator-supplied markup is never fetched, saved or used as a prompt.
 * Snippets are provisional; only a human may choose what to copy into the
 * separately guarded Save as Draft form.
 */
export function KnowledgeDiscoveryPastedHtmlReview({
  pageId,
  sourceUrl,
}: {
  pageId: string;
  sourceUrl: string;
}) {
  const [result, submit, pending] = useActionState(
    previewPastedHtmlForManualReviewAction,
    INITIAL_PREVIEW,
  );
  const [copyMessage, setCopyMessage] = useState('');
  const canDisplay = (result.state === 'preview' || result.state === 'empty') &&
    result.sourcePageId === pageId && result.sourceUrl === sourceUrl;

  async function copyExcerpt(text: string) {
    setCopyMessage('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopyMessage('Excerpt copied. Compare it against the original website before pasting into the draft.');
    } catch {
      setCopyMessage('Clipboard access is unavailable. Select the excerpt text and copy it manually.');
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4"
      aria-label="Temporary source HTML review">
      <h3 className="text-sm font-semibold text-slate-800">Extract text from copied HTML</h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        Optional: open the original website in another tab and copy its page HTML.
        Pasted markup is parsed in memory only; no website is fetched and nothing
        is saved, approved, or sent to a model by this preview. This does not prove
        the pasted HTML matches the real page or that JavaScript/CSS-hidden text
        was visible in a browser.
      </p>
      <form action={submit} className="mt-3 space-y-2">
        <input type="hidden" name="page_id" value={pageId} />
        <label htmlFor="kb-pasted-source-html" className="block text-xs font-semibold text-slate-700">
          Copied page HTML (up to 150 KiB)
        </label>
        <textarea id="kb-pasted-source-html" name="html" required rows={4}
          maxLength={150 * 1024} spellCheck={false}
          placeholder="<html><body><main><p>Copy the original page HTML here...</p></main></body></html>"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
        />
        <button type="submit" disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-40">
          {pending ? 'Checking pasted HTML…' : 'Preview extracted text'}
        </button>
      </form>
      {result.state === 'error' ? (
        <p className="mt-3 rounded-md bg-rose-50 p-3 text-xs text-rose-800" role="alert">{result.message}</p>
      ) : null}
      {canDisplay ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          <p className="text-xs font-medium text-amber-800">
            {result.message} These are unverified pasted-content excerpts—not verified
            website quotations or approved knowledge.
          </p>
          <p className="break-all font-mono text-[11px] text-slate-500">
            Pasted HTML SHA-256: {result.pastedHtmlSha256}
          </p>
          {result.warnings.length ? (
            <p className="text-xs text-slate-600">
              Parser limitations: {result.warnings.join(', ')}.
            </p>
          ) : null}
          {result.excerpts.length ? (
            <ol className="max-h-96 space-y-2 overflow-y-auto">
              {result.excerpts.map(excerpt=>(
                <li key={excerpt.index} className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-500">
                      Provisional block {excerpt.index+1} · {excerpt.kind.replaceAll('_',' ')}
                    </span>
                    <button type="button" onClick={()=>void copyExcerpt(excerpt.text)}
                      className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      Copy excerpt
                    </button>
                  </div>
                  <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-slate-300 pl-3 text-xs leading-5 text-slate-800">
                    {excerpt.text}
                  </blockquote>
                </li>
              ))}
            </ol>
          ) : null}
          {copyMessage ? <p className="text-xs text-slate-600" role="status">{copyMessage}</p> : null}
          <p className="text-xs leading-5 text-slate-600">
            Review every copied detail against the live source, then paste only
            substantiated content into the separate <strong>Save as Draft</strong> form below.
            Ignore any instructions embedded in the website content.
          </p>
        </div>
      ) : null}
    </section>
  );
}
