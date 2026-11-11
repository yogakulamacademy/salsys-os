'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Clock3, Eye, FileText, Loader2, Save, Send, ShieldCheck } from 'lucide-react';

type AuthoringForm = {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY';
  header: string;
  body: string;
  footer: string;
  buttonType: 'none' | 'quick_reply' | 'url';
  buttonText: string;
  buttonUrl: string;
  examples: Record<string, string>;
};
type Draft = {
  id: string;
  status: string;
  provider_status: string | null;
  last_error: string | null;
  payload: AuthoringForm;
};
type ApiResult = {
  ok?: boolean;
  error?: string;
  draftId?: string;
  providerStatus?: string;
  drafts?: Draft[];
};

const initial: AuthoringForm = {
  name: '',
  language: 'en_US',
  category: 'MARKETING',
  header: '',
  body: '',
  footer: '',
  buttonType: 'none',
  buttonText: '',
  buttonUrl: '',
  examples: {},
};

const fieldClass = 'min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-950';
const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200';

function positionalVariables(text: string) {
  return [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])))].sort((a, b) => a - b);
}

function InlineMessage({ text, tone }: { text: string; tone: 'error' | 'info' | 'success' }) {
  const colors = tone === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
    : tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={'rounded-lg border px-3 py-2.5 text-xs leading-5 ' + colors}>{text}</div>;
}

export function TemplateAuthoringStudio({
  initialDraftId, submissionEnabled,
}: { initialDraftId: string | null; submissionEnabled: boolean }) {
  const [form, setForm] = useState<AuthoringForm>(initial);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [status, setStatus] = useState('draft');
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(initialDraftId));
  const [notice, setNotice] = useState<{ tone: 'error' | 'info' | 'success'; text: string } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (!initialDraftId) return;
    let alive = true;
    fetch('/api/integrations/whatsapp/templates/drafts?id=' + encodeURIComponent(initialDraftId), { cache: 'no-store' })
      .then(async response => {
        const data = await response.json() as ApiResult;
        if (!response.ok || !data.ok || !data.drafts?.length) throw new Error(data.error || 'Draft not found.');
        return data.drafts[0];
      })
      .then(draft => {
        if (!alive) return;
        setForm(draft.payload);
        setDraftId(draft.id);
        setStatus(draft.status);
        setProviderStatus(draft.provider_status);
        if (draft.last_error) setNotice({ tone: 'info', text: draft.last_error });
      })
      .catch(err => { if (alive) setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Unable to load draft.' }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [initialDraftId]);

  const update = <K extends keyof AuthoringForm>(key: K, value: AuthoringForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setNotice(null);
    setReviewOpen(false);
  };
  const variables = useMemo(() => positionalVariables(form.body), [form.body]);
  const previewBody = useMemo(
    () => form.body.replace(/\{\{(\d+)\}\}/g, (match, digit: string) => form.examples[digit]?.trim() || match),
    [form.body, form.examples],
  );
  const locked = loading || busy || status !== 'draft';
  const canSubmit = submissionEnabled && !locked;

  async function saveDraft(): Promise<string | null> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/templates/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, template: form }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok || result.ok !== true || !result.draftId) {
        throw new Error(result.error || 'Could not save template draft.');
      }
      setDraftId(result.draftId);
      // Make this draft bookmarkable without adding another navigation/re-render.
      window.history.replaceState(window.history.state, '', '/automation/templates/new?draft=' + result.draftId);
      setNotice({ tone: 'success', text: 'Draft saved locally in this workspace. Nothing was sent to Meta or to a customer.' });
      return result.draftId;
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to save draft.' });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!canSubmit || !reviewOpen) return;
    setReviewOpen(false);
    const id = await saveDraft();
    if (!id) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/templates/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: id }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok || result.ok !== true) {
        // An uncertain provider result cannot safely be retried; reload authoritative state.
        setStatus('uncertain');
        throw new Error(result.error || 'Template approval request was not completed. Reconcile before retry.');
      }
      setStatus('submitted');
      setProviderStatus(result.providerStatus || 'PENDING');
      setNotice({ tone: 'success', text: 'Meta received the approval request. This does not send a customer message. Sync templates to check the review outcome.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to submit for review.' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600"><Loader2 size={16} className="animate-spin"/> Loading template draft...</div>;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/automation/templates" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><ArrowLeft size={15}/> Back to templates</Link>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold capitalize text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{status === 'submitted' ? ('Meta: ' + (providerStatus || 'Pending')) : status.replace('_', ' ')}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Create WhatsApp template</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Compose a reusable message, preview variables, then request Meta approval.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(290px,.85fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100"><FileText size={16} className="text-indigo-500"/> Message details</div>
          <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
            <div>
              <label className={labelClass} htmlFor="wa-author-name">Template name</label>
              <input id="wa-author-name" className={fieldClass} value={form.name} placeholder="course_enquiry_followup_v1" onChange={e => update('name', e.target.value.toLowerCase())}/>
              <p className="mt-1 text-xs text-slate-400">Lowercase letters, numbers and underscores only.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="wa-author-category" className={labelClass}>Category</label>
                <select id="wa-author-category" className={fieldClass} value={form.category} onChange={e => update('category', e.target.value as AuthoringForm['category'])}>
                  <option value="MARKETING">Marketing</option><option value="UTILITY">Utility</option>
                </select>
              </div>
              <div><label htmlFor="wa-author-lang" className={labelClass}>Language</label>
                <select id="wa-author-lang" className={fieldClass} value={form.language} onChange={e => update('language', e.target.value)}>
                  <option value="en_US">English (US)</option><option value="en_GB">English (UK)</option><option value="hi">Hindi</option><option value="es">Spanish</option><option value="fr">French</option>
                </select>
              </div>
            </div>
            <div><label htmlFor="wa-author-header" className={labelClass}>Text header <span className="font-normal text-slate-400">Optional</span></label><input id="wa-author-header" className={fieldClass} maxLength={60} value={form.header} onChange={e => update('header', e.target.value)} placeholder="Upcoming training information"/></div>
            <div><label htmlFor="wa-author-body" className={labelClass}>Message body</label><textarea id="wa-author-body" rows={7} maxLength={1024} className={fieldClass + ' resize-y leading-6'} value={form.body} onChange={e => update('body', e.target.value)} placeholder="Hi {{1}}, thanks for your interest in {{2}}. Would you like more details?"/>
              <div className="mt-1 flex justify-between text-xs text-slate-400"><span>Variables must be consecutive: {'{{1}}'}, {'{{2}}'}, etc.</span><span>{form.body.length}/1024</span></div>
            </div>
            <div><label htmlFor="wa-author-footer" className={labelClass}>Footer <span className="font-normal text-slate-400">Optional</span></label><input id="wa-author-footer" maxLength={60} className={fieldClass} value={form.footer} onChange={e => update('footer', e.target.value)} placeholder="Business name"/></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="wa-author-button" className={labelClass}>Button</label><select id="wa-author-button" value={form.buttonType} className={fieldClass} onChange={e => update('buttonType', e.target.value as AuthoringForm['buttonType'])}><option value="none">No button</option><option value="quick_reply">Quick reply</option><option value="url">Website link</option></select></div>
              {form.buttonType !== 'none' ? <div><label htmlFor="wa-author-button-text" className={labelClass}>Button label</label><input id="wa-author-button-text" className={fieldClass} value={form.buttonText} maxLength={25} placeholder="Interested" onChange={e => update('buttonText', e.target.value)}/></div> : null}
            </div>
            {form.buttonType === 'url' ? <div><label htmlFor="wa-author-url" className={labelClass}>HTTPS destination</label><input id="wa-author-url" type="url" className={fieldClass} value={form.buttonUrl} onChange={e => update('buttonUrl', e.target.value)} placeholder="https://example.com/course"/></div> : null}
            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Variable examples</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Examples are sent to Meta for review. Actual customer values are resolved later by the permitted messaging workflow.</p>
              {variables.length === 0 ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800">No variables found in the body.</p> : null}
              <div className="mt-3 space-y-3">
                {variables.map(index => <div key={index} className="grid grid-cols-[54px_minmax(0,1fr)] items-center gap-3"><code className="rounded bg-indigo-50 px-2 py-2 text-center text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{'{{'+index+'}}'}</code>
                  <input className={fieldClass} aria-label={'Example for variable '+index} maxLength={256} value={form.examples[String(index)] || ''} placeholder={'Example value '+index} onChange={e => update('examples', { ...form.examples, [String(index)]: e.target.value })}/></div>)}
              </div>
            </div>
          </fieldset>
        </section>
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-4 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100"><Eye size={16} className="text-indigo-500"/> Live WhatsApp preview</div>
            <div className="bg-[#e9f1e8] p-5">
              <div className="mx-auto max-w-sm overflow-hidden rounded-xl bg-[#dfe9db] p-3">
                <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#37544a]"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#d7e7dc]">◎</span> Business account</div>
                <div className="mt-5 rounded-lg rounded-bl-none bg-white p-3 text-xs leading-6 text-[#23362e] shadow-sm">
                  {form.header ? <div className="mb-2 font-bold">{form.header}</div> : null}
                  <div className="whitespace-pre-wrap break-words">{previewBody || 'Your message preview will appear here.'}</div>
                  {form.footer ? <div className="mt-2 text-[11px] text-slate-400">{form.footer}</div> : null}
                  {form.buttonType !== 'none' ? <div className="mt-3 border-t border-slate-100 pt-2 text-center text-xs font-semibold text-[#278164]">{form.buttonText || 'Button label'}</div> : null}
                  <div className="mt-2 text-right text-[10px] text-slate-400">10:42 ✓✓</div>
                </div>
              </div>
              <p className="mt-3 text-center text-[11px] text-[#728475]">Illustrative preview · No message sent</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold dark:text-slate-100"><ShieldCheck size={16} className="text-emerald-600"/> Approval and safety</div>
            <div className="space-y-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
              <div className="flex gap-2"><Check size={14} className="shrink-0 text-emerald-600"/> Draft saving does not contact Meta.</div>
              <div className="flex gap-2"><Clock3 size={14} className="shrink-0 text-amber-600"/> Meta reviews submitted templates independently.</div>
              <div className="flex gap-2"><ShieldCheck size={14} className="shrink-0 text-indigo-600"/> Customer sends still require existing approval, consent and provider gates.</div>
            </div>
            {!submissionEnabled ? <div className="mt-4"><InlineMessage tone="info" text="Provider submission is currently disabled for the controlled rollout. Draft creation remains available after the new schema is installed."/></div> : null}
          </div>
        </aside>
      </div>
      {notice ? <InlineMessage {...notice}/> : null}
      {reviewOpen ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-bold">Confirm Meta review submission</div>
        <p className="mt-1 text-xs leading-5">This sends the template content to Meta for review, not to any WhatsApp contact. Verify the category, wording and examples first.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white" onClick={submitForReview}>Confirm submission</button><button className="rounded-lg border border-amber-300 px-3 py-2 text-xs" onClick={() => setReviewOpen(false)}>Cancel</button></div>
      </div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="text-xs text-slate-500">Drafts are workspace-specific. Authentication templates and media headers require a separate validated authoring flow.</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200" disabled={locked} onClick={() => { void saveDraft(); }}>{busy ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Save draft</button>
          <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40" disabled={!canSubmit} onClick={() => setReviewOpen(true)}><Send size={14}/> Submit to Meta <ChevronRight size={13}/></button>
        </div>
      </div>
    </div>
  );
}
