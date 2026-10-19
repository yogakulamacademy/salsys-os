'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Send, XCircle } from 'lucide-react';

type Props = {
  approvalId: string;
  disabled?: boolean;
  mode?: 'decision' | 'execute';
};

export function ApprovalActions({ approvalId, disabled = false, mode = 'decision' }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | 'execute' | null>(null);
  const [message, setMessage] = useState<{ tone: 'warning' | 'success'; text: string } | null>(null);

  async function decide(decision: 'approve' | 'reject', executionOnly = false) {
    if (busy || disabled) return;
    setBusy(executionOnly ? 'execute' : decision);
    setMessage(null);

    try {
      const response = await fetch(`/api/automation/approvals/${encodeURIComponent(approvalId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        customerMessageSent?: boolean;
        preparation?: { status?: string };
      };

      if (!response.ok && response.status !== 202) {
        throw new Error(payload.error || 'Unable to save approval decision.');
      }

      if (decision === 'approve') {
        if (payload.customerMessageSent === true) {
          setMessage({ tone: 'success', text: 'WhatsApp message sent and recorded successfully.' });
        } else {
          const preparationStatus = payload.preparation?.status || 'blocked';
          setMessage({
            tone: 'warning',
            text:
              preparationStatus === 'blocked'
                ? 'Approved, but provider execution is still blocked by the current safety gates.'
                : 'Approved. No customer message was sent.',
          });
        }
      }

      router.refresh();
    } catch (caught) {
      setMessage({
        tone: 'warning',
        text: caught instanceof Error ? caught.message : 'Unable to save approval decision.',
      });
    } finally {
      setBusy(null);
    }
  }

  if (mode === 'execute') {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled={disabled || busy !== null}
          onClick={() => decide('approve', true)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'execute' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Execute approved send
        </button>
        {message ? (
          <p
            className={`max-w-xl text-xs leading-5 ${
              message.tone === 'success' ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy !== null}
          onClick={() => decide('approve')}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Approve
        </button>
        <button
          type="button"
          disabled={disabled || busy !== null}
          onClick={() => decide('reject')}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'reject' ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
          Reject
        </button>
      </div>
      {message ? (
        <p
          className={`max-w-xl text-xs leading-5 ${
            message.tone === 'success' ? 'text-emerald-700' : 'text-amber-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
