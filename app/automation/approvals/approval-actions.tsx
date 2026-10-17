'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

type Props = {
  approvalId: string;
  disabled?: boolean;
};

export function ApprovalActions({ approvalId, disabled = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approve' | 'reject') {
    if (busy || disabled) return;
    setBusy(decision);
    setError(null);

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

      if (decision === 'approve' && payload.customerMessageSent !== true) {
        const preparationStatus = payload.preparation?.status || 'blocked';
        setError(
          preparationStatus === 'blocked'
            ? 'Approved. Provider execution is still blocked by the current safety gates.'
            : 'Approved. No customer message was sent.',
        );
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save approval decision.');
    } finally {
      setBusy(null);
    }
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
      {error ? <p className="max-w-xl text-xs leading-5 text-amber-700">{error}</p> : null}
    </div>
  );
}
