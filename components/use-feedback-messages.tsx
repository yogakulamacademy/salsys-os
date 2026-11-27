'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';

/** Mirror explicit operation outcomes; never infer success from clicks or elapsed time. */
export function useFeedbackMessages(error?: string | null, success?: string | null, warning?: string | null) {
  useEffect(() => { if (error) toast.error('Something went wrong', { description: error }); }, [error]);
  useEffect(() => { if (success) toast.success(success); }, [success]);
  useEffect(() => { if (warning) toast.warning('Please check', { description: warning }); }, [warning]);
}

export function useOutcomeToast(outcome: { tone: string; text: string } | null | undefined) {
  const tone = outcome?.tone;
  const text = outcome?.text;
  useEffect(() => {
    if (!text) return;
    if (tone === 'error') toast.error('Something went wrong', { description: text });
    else if (tone === 'warning') toast.warning('Please check', { description: text });
    else if (tone === 'success' || tone === 'ok') toast.success(text);
    else toast.info(text);
  }, [tone, text]);
}

export function OutcomeToast({ outcome }: { outcome: { tone: string; text: string } | null }) { useOutcomeToast(outcome); return null; }

export function LoadErrorToast({ message }: { message?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (message) toast.error('Couldn’t load data', { description: message, onRetry: () => router.refresh() });
  }, [message, router]);
  return null;
}
