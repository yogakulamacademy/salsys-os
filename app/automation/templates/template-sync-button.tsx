'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';

export function TemplateSyncButton({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function syncTemplates() {
    if (disabled || syncing) return;
    setSyncing(true);
    setMessage(null);

    try {
      const response = await fetch('/api/integrations/whatsapp/templates/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        templatesSeen?: number;
        templatesUpserted?: number;
        templatesDeactivated?: number;
      };

      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error || 'Unable to synchronize WhatsApp templates.');
      }

      setMessage({
        tone: 'success',
        text: `${payload.templatesSeen ?? 0} checked · ${payload.templatesUpserted ?? 0} updated`,
      });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unable to sync templates.',
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={disabled || syncing}
        onClick={syncTemplates}
        title={disabled ? 'Admin permission required' : 'Synchronize templates from Meta'}
        className="btn-primary"
      >
        {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        {syncing ? 'Syncing…' : 'Sync templates'}
      </button>
      {message ? (
        <p className={`max-w-[240px] text-xs ${message.tone === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
