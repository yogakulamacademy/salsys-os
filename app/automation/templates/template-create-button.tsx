'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';

type Props = {
  disabled?: boolean;
};

type CreateResponse = {
  ok?: boolean;
  templateId?: string;
  status?: string;
  category?: string;
  syncOk?: boolean;
  message?: string;
  error?: string;
};

const LANGUAGE_OPTIONS = [
  ['en_US', 'English (US)'],
  ['en_GB', 'English (UK)'],
  ['en', 'English'],
  ['hi', 'Hindi'],
] as const;

export function TemplateCreateButton({ disabled = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('meta_review_test');
  const [category, setCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY');
  const [language, setLanguage] = useState('en_US');
  const [headerText, setHeaderText] = useState('');
  const [bodyText, setBodyText] = useState('Hello, this is a test template created from SalsysOS for Meta App Review.');
  const [footerText, setFooterText] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const canSubmit = useMemo(
    () => Boolean(name.trim() && bodyText.trim() && !submitting),
    [name, bodyText, submitting],
  );

  function resetStatus() {
    setMessage(null);
  }

  async function createTemplate() {
    if (!canSubmit) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/integrations/whatsapp/templates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          language,
          headerText,
          bodyText,
          footerText,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CreateResponse;

      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error || 'Unable to create WhatsApp template.');
      }

      setMessage({
        tone: 'success',
        text: payload.message || `Template submitted to Meta with status ${payload.status || 'PENDING'}.`,
      });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unable to create WhatsApp template.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const modal = open ? (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[1px]">
      <button type="button" aria-label="Close create template dialog" className="absolute inset-0" onClick={() => !submitting && setOpen(false)} />
      <section className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">WhatsApp</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Create message template</h2>
            <p className="mt-1 text-sm text-slate-500">Submit a text template directly to Meta for review.</p>
          </div>
          <button type="button" onClick={() => !submitting && setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
            <X size={17} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Template name
              <input
                className="input"
                value={name}
                onChange={(event) => {
                  setName(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                  resetStatus();
                }}
                placeholder="meta_review_test"
                maxLength={512}
              />
              <span className="text-[11px] font-normal text-slate-400">Lowercase letters, numbers and underscores only.</span>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Category
              <select className="input" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Authentication</option>
              </select>
              <span className="text-[11px] font-normal text-slate-400">Meta may recategorize a template during review.</span>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
              Language
              <select className="input" value={language} onChange={(event) => setLanguage(event.target.value)}>
                {LANGUAGE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label} · {value}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
              Header <span className="font-normal text-slate-400">optional</span>
              <input
                className="input"
                value={headerText}
                onChange={(event) => {
                  setHeaderText(event.target.value);
                  resetStatus();
                }}
                placeholder="Optional short heading"
                maxLength={60}
              />
              <span className="text-[11px] font-normal text-slate-400">{headerText.length}/60</span>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
              Message body
              <textarea
                className="input min-h-32 resize-y py-3"
                value={bodyText}
                onChange={(event) => {
                  setBodyText(event.target.value);
                  resetStatus();
                }}
                maxLength={1024}
              />
              <div className="flex items-center justify-between gap-3 text-[11px] font-normal text-slate-400">
                <span>Static text only in this first creation flow; variables can be added in a later version.</span>
                <span>{bodyText.length}/1024</span>
              </div>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
              Footer <span className="font-normal text-slate-400">optional</span>
              <input
                className="input"
                value={footerText}
                onChange={(event) => {
                  setFooterText(event.target.value);
                  resetStatus();
                }}
                placeholder="Optional footer text"
                maxLength={60}
              />
              <span className="text-[11px] font-normal text-slate-400">{footerText.length}/60</span>
            </label>
          </div>

          <div className="mt-5 rounded-2xl bg-[#eef7f1] p-4">
            <div className="mx-auto max-w-[420px] rounded-2xl rounded-tr-md bg-white p-4 shadow-sm">
              {headerText ? <div className="text-sm font-bold text-slate-900">{headerText}</div> : null}
              <div className={`${headerText ? 'mt-2' : ''} whitespace-pre-wrap text-sm leading-6 text-slate-700`}>
                {bodyText || 'Your message preview will appear here.'}
              </div>
              {footerText ? <div className="mt-2 text-xs text-slate-400">{footerText}</div> : null}
            </div>
          </div>

          {message ? (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${message.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
              {message.text}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-400">Submitting sends this template to Meta. It does not send a customer message.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={submitting} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!canSubmit} onClick={createTemplate}>
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {submitting ? 'Submitting…' : 'Submit to Meta'}
            </button>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
        className="btn-secondary"
        title={disabled ? 'Connect WhatsApp and use an owner/admin account to create templates.' : 'Create a WhatsApp message template'}
      >
        <Plus size={15} />
        Create template
      </button>
      {typeof document !== 'undefined' && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
